use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::client::{CompileResult, HttpClient};
use crate::error::{Error, Result};
use crate::output::{OutputFormat, output_success};

use super::compile::wait_for_completion;

const DEFAULT_SKILL: &str =
    include_str!("../../../../examples/compile/ov-compile-skills/llm-wiki/SKILL.md");
const DEFAULT_USER_PROFILE: &str =
    include_str!("../../../../examples/compile/ov-compile-skills/llm-wiki/USER_PROFILE.md");
const DEFAULT_OKF_CONFIG: &str =
    include_str!("../../../../examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml");
const DEFAULT_REASON: &str = "将这些文档整理成便于团队检索和复用的 OKF 知识库。提取关键实体、概念、综合结论与关系，保留重要结论的出处，并使用中文输出。";
const MEMORY_INCREMENTAL_REASON: &str = "这是团队 Memory 增量更新阶段。请完整检查现有目标知识库，以团队 Memory 为新增证据更新、补充或纠正已有页面；明确的新事实应取代旧事实。保留仍然准确的文档知识、出处、WikiLink 和所有配置视图标签，避免重复页面。";
const MAX_UPLOAD_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;
const DOCUMENT_EXTENSIONS: &[&str] = &["doc", "docx", "md", "markdown", "pdf", "xls", "xlsx"];
const MEMORY_EXTENSIONS: &[&str] = &["json", "markdown", "md", "text", "txt", "yaml", "yml"];

#[derive(Debug, Serialize)]
struct KnowledgeMiningResult {
    batch_id: String,
    phase: String,
    document_files: usize,
    memory_files: usize,
    document_source_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_source_uri: Option<String>,
    okf_config_uri: String,
    target_uri: String,
    skill_uri: String,
    document_task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<CompileResult>,
}

#[derive(Debug)]
pub struct KnowledgeMiningOptions {
    pub document_paths: Vec<String>,
    pub memory_paths: Vec<String>,
    pub target_uri: Option<String>,
    pub skill_uri: Option<String>,
    pub okf_config_path: Option<String>,
    pub reason: Option<String>,
    pub wait: bool,
    pub timeout: Option<f64>,
    pub runtime_timeout: Option<f64>,
    pub show_progress: bool,
    pub verbose: bool,
    pub output_format: OutputFormat,
    pub compact: bool,
}

pub async fn run(client: &HttpClient, options: KnowledgeMiningOptions) -> Result<()> {
    if !options.memory_paths.is_empty() && !options.wait {
        return Err(Error::Client(
            "--memory requires --wait so the CLI can start the incremental Memory stage after the document stage succeeds"
                .into(),
        ));
    }

    let document_files =
        collect_supported_files(&options.document_paths, DOCUMENT_EXTENSIONS, "documents")?;
    let memory_files = if options.memory_paths.is_empty() {
        Vec::new()
    } else {
        collect_supported_files(&options.memory_paths, MEMORY_EXTENSIONS, "memory")?
    };
    let okf_config = load_okf_config(options.okf_config_path.as_deref())?;
    let reason = options
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_REASON);

    let batch_id = create_batch_id();
    let batch_root = format!("viking://resources/knowledge-mining/{batch_id}");
    let document_source_uri = format!("{batch_root}/document-sources");
    let memory_source_uri = format!("{batch_root}/team-memory");
    let target_uri = options
        .target_uri
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{batch_root}/wiki"));

    let _: Value = client.get("/bot/v1/health", &[]).await?;
    let skill_uri = match options
        .skill_uri
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(uri) => uri.to_owned(),
        None => ensure_llm_wiki_skill(client, options.show_progress, options.verbose).await?,
    };

    print_progress(
        options.output_format,
        format!("Uploading {} document file(s)...", document_files.len()),
    );
    upload_files(
        client,
        &document_files,
        &document_source_uri,
        options.show_progress,
        options.verbose,
    )
    .await?;

    if !memory_files.is_empty() {
        print_progress(
            options.output_format,
            format!("Uploading {} team Memory file(s)...", memory_files.len()),
        );
        upload_files(
            client,
            &memory_files,
            &memory_source_uri,
            options.show_progress,
            options.verbose,
        )
        .await?;
    }

    let okf_config_uri = format!("{document_source_uri}/OKF_CONFIG.yaml");
    client
        .write(
            &okf_config_uri,
            &okf_config,
            "upsert",
            false,
            None,
            "semantic_and_vectors",
        )
        .await?;

    print_progress(
        options.output_format,
        format!("Starting document Compile at {target_uri}..."),
    );
    let document_accepted = client
        .create_compile(
            std::slice::from_ref(&document_source_uri),
            &target_uri,
            &skill_uri,
            Some(&okf_config_uri),
            Some(reason),
            options.runtime_timeout,
        )
        .await?;

    if !options.wait {
        return output_result(
            KnowledgeMiningResult {
                batch_id,
                phase: "compiling_documents".into(),
                document_files: document_files.len(),
                memory_files: 0,
                document_source_uri,
                memory_source_uri: None,
                okf_config_uri,
                target_uri,
                skill_uri,
                document_task_id: document_accepted.task_id,
                memory_task_id: None,
                result: None,
            },
            options.output_format,
            options.compact,
        );
    }

    let document_task = wait_for_completion(client, &document_accepted, options.timeout).await?;
    let document_result = document_task.result;
    if document_task.stage == "salvaged"
        || document_result
            .as_ref()
            .and_then(|result| result.validation_passed)
            == Some(false)
    {
        return output_result(
            KnowledgeMiningResult {
                batch_id,
                phase: "partial".into(),
                document_files: document_files.len(),
                memory_files: memory_files.len(),
                document_source_uri,
                memory_source_uri: (!memory_files.is_empty()).then_some(memory_source_uri),
                okf_config_uri,
                target_uri,
                skill_uri,
                document_task_id: document_accepted.task_id,
                memory_task_id: None,
                result: document_result,
            },
            options.output_format,
            options.compact,
        );
    }

    let (phase, memory_task_id, final_result) = if memory_files.is_empty() {
        let phase = completion_phase(document_result.as_ref());
        (phase, None, document_result)
    } else {
        print_progress(
            options.output_format,
            "Starting team Memory incremental Compile...".into(),
        );
        let memory_reason = format!("{reason}\n\n{MEMORY_INCREMENTAL_REASON}");
        let memory_accepted = client
            .create_compile(
                std::slice::from_ref(&memory_source_uri),
                &target_uri,
                &skill_uri,
                Some(&okf_config_uri),
                Some(&memory_reason),
                options.runtime_timeout,
            )
            .await?;
        let memory_task = wait_for_completion(client, &memory_accepted, options.timeout).await?;
        let memory_result = memory_task.result;
        let phase = if memory_task.stage == "salvaged"
            || memory_result
                .as_ref()
                .and_then(|result| result.validation_passed)
                == Some(false)
        {
            "partial"
        } else {
            completion_phase(memory_result.as_ref())
        };
        (phase, Some(memory_accepted.task_id), memory_result)
    };

    output_result(
        KnowledgeMiningResult {
            batch_id,
            phase: phase.into(),
            document_files: document_files.len(),
            memory_files: memory_files.len(),
            document_source_uri,
            memory_source_uri: (!memory_files.is_empty()).then_some(memory_source_uri),
            okf_config_uri,
            target_uri,
            skill_uri,
            document_task_id: document_accepted.task_id,
            memory_task_id,
            result: final_result,
        },
        options.output_format,
        options.compact,
    )
}

fn output_result(
    result: KnowledgeMiningResult,
    output_format: OutputFormat,
    compact: bool,
) -> Result<()> {
    output_success(result, output_format, compact);
    Ok(())
}

fn print_progress(output_format: OutputFormat, message: String) {
    if matches!(output_format, OutputFormat::Table) {
        eprintln!("{message}");
    }
}

fn completion_phase(_result: Option<&CompileResult>) -> &'static str {
    // Human evidence is currently informational for the CLI workflow. Keep the
    // investigation and questionnaire in the Compile result for auditing, but
    // do not make them a completion gate or submit answers automatically.
    "completed"
}

async fn upload_files(
    client: &HttpClient,
    files: &[PathBuf],
    parent_uri: &str,
    show_progress: bool,
    verbose: bool,
) -> Result<()> {
    for file in files {
        let path = file.to_str().ok_or_else(|| {
            Error::InvalidPath(format!("Path is not valid UTF-8: {}", file.display()))
        })?;
        client
            .add_resource(
                path,
                None,
                None,
                None,
                Some(parent_uri.to_owned()),
                "knowledge mining source upload",
                "",
                true,
                Some(900.0),
                false,
                None,
                None,
                None,
                true,
                0.0,
                "semantic_and_vectors".into(),
                None,
                Vec::new(),
                "replace".into(),
                show_progress,
                verbose,
            )
            .await?;
    }
    Ok(())
}

async fn ensure_llm_wiki_skill(
    client: &HttpClient,
    show_progress: bool,
    verbose: bool,
) -> Result<String> {
    let listed = client.skills_list(1000, None).await?;
    if let Some(uri) = find_llm_wiki_skill(&listed) {
        return Ok(uri);
    }

    let installed = client
        .add_skill(
            DEFAULT_SKILL,
            true,
            Some(300.0),
            show_progress,
            verbose,
            Some(json!({
                "operation": "install",
                "source": "openviking_knowledge_mining_cli",
                "type": "bundled_example",
                "version": 1,
            })),
            None,
        )
        .await?;
    let root_uri = installed
        .get("root_uri")
        .and_then(Value::as_str)
        .or_else(|| installed.get("uri").and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| Error::Parse("llm-wiki installation returned no root URI".into()))?;

    for (name, content) in [
        ("USER_PROFILE.md", DEFAULT_USER_PROFILE),
        ("OKF_CONFIG.yaml", DEFAULT_OKF_CONFIG),
    ] {
        client
            .write(
                &format!("{}/{name}", root_uri.trim_end_matches('/')),
                content,
                "upsert",
                false,
                None,
                "semantic_and_vectors",
            )
            .await?;
    }
    Ok(root_uri)
}

fn find_llm_wiki_skill(value: &Value) -> Option<String> {
    let skills = value.get("skills")?.as_array()?;
    let mut matches = skills.iter().filter_map(|skill| {
        if skill.get("name").and_then(Value::as_str) != Some("llm-wiki") {
            return None;
        }
        skill
            .get("uri")
            .and_then(Value::as_str)
            .or_else(|| skill.get("root_uri").and_then(Value::as_str))
            .filter(|uri| !uri.trim().is_empty())
            .map(str::to_owned)
    });
    let first = matches.next()?;
    Some(
        matches
            .find(|uri| uri.starts_with("viking://user/"))
            .unwrap_or(first),
    )
}

fn create_batch_id() -> String {
    let timestamp = Utc::now().format("%Y%m%d%H%M%S");
    let suffix = Uuid::new_v4().simple().to_string();
    format!("{timestamp}-{}", &suffix[..6])
}

fn load_okf_config(path: Option<&str>) -> Result<String> {
    let Some(path) = path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(DEFAULT_OKF_CONFIG.to_owned());
    };
    let path = Path::new(path);
    if !path.is_file() {
        return Err(Error::InvalidPath(format!(
            "OKF config file does not exist: {}",
            path.display()
        )));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "yaml" | "yml") {
        return Err(Error::InvalidPath(
            "--okf-config must be a .yaml or .yml file".into(),
        ));
    }
    std::fs::read_to_string(path).map_err(Error::from)
}

fn collect_supported_files(
    raw_paths: &[String],
    extensions: &[&str],
    label: &str,
) -> Result<Vec<PathBuf>> {
    let mut files = BTreeSet::new();
    for raw_path in raw_paths {
        let raw_path = raw_path.replace("\\ ", " ");
        let path = Path::new(&raw_path);
        if !path.exists() {
            return Err(Error::InvalidPath(format!(
                "Local {label} path does not exist: {}",
                path.display()
            )));
        }
        if path.is_file() {
            add_supported_file(&mut files, path, extensions, label, true)?;
            continue;
        }
        if !path.is_dir() {
            return Err(Error::InvalidPath(format!(
                "Local {label} path is not a file or directory: {}",
                path.display()
            )));
        }
        for entry in WalkDir::new(path).follow_links(false) {
            let entry = entry.map_err(|error| {
                Error::InvalidPath(format!("Failed to scan {}: {error}", path.display()))
            })?;
            if entry.file_type().is_file() {
                add_supported_file(&mut files, entry.path(), extensions, label, false)?;
            }
        }
    }
    if files.is_empty() {
        return Err(Error::Client(format!(
            "No supported {label} files were found"
        )));
    }
    Ok(files.into_iter().collect())
}

fn add_supported_file(
    files: &mut BTreeSet<PathBuf>,
    path: &Path,
    extensions: &[&str],
    label: &str,
    explicit: bool,
) -> Result<()> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !extensions.contains(&extension.as_str()) {
        if explicit {
            return Err(Error::InvalidPath(format!(
                "Unsupported {label} file: {}",
                path.display()
            )));
        }
        return Ok(());
    }
    let size = path.metadata()?.len();
    if size > MAX_UPLOAD_FILE_SIZE_BYTES {
        return Err(Error::Client(format!(
            "{} is larger than the 10 MiB upload limit",
            path.display()
        )));
    }
    files.insert(path.to_path_buf());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        DOCUMENT_EXTENSIONS, MEMORY_EXTENSIONS, collect_supported_files, completion_phase,
        find_llm_wiki_skill,
    };
    use crate::client::CompileResult;
    use serde_json::json;

    fn compile_result(investigation_status: Option<&str>, question_count: usize) -> CompileResult {
        CompileResult {
            from_uris: Vec::new(),
            to: String::new(),
            skill: String::new(),
            okf_version: "1.0".into(),
            created: Vec::new(),
            updated: Vec::new(),
            unchanged: Vec::new(),
            page_count: 0,
            link_count: 0,
            warnings: Vec::new(),
            views: Vec::new(),
            main_view: None,
            intermediate_artifacts: Vec::new(),
            investigation_status: investigation_status.map(str::to_owned),
            question_count,
            validation_passed: Some(true),
        }
    }

    #[test]
    fn recursively_collects_only_supported_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("report.pdf"), b"pdf").expect("write pdf");
        std::fs::write(dir.path().join("notes.txt"), b"notes").expect("write txt");

        let documents = collect_supported_files(
            &[dir.path().to_string_lossy().into_owned()],
            DOCUMENT_EXTENSIONS,
            "documents",
        )
        .expect("collect documents");
        let memory = collect_supported_files(
            &[dir.path().to_string_lossy().into_owned()],
            MEMORY_EXTENSIONS,
            "memory",
        )
        .expect("collect memory");

        assert_eq!(documents.len(), 1);
        assert!(documents[0].ends_with("report.pdf"));
        assert_eq!(memory.len(), 1);
        assert!(memory[0].ends_with("notes.txt"));
    }

    #[test]
    fn prefers_user_llm_wiki_skill() {
        let value = json!({
            "skills": [
                {"name": "llm-wiki", "uri": "viking://agent/skills/llm-wiki"},
                {"name": "llm-wiki", "root_uri": "viking://user/alice/skills/llm-wiki"}
            ]
        });
        assert_eq!(
            find_llm_wiki_skill(&value).as_deref(),
            Some("viking://user/alice/skills/llm-wiki")
        );
    }

    #[test]
    fn unresolved_questions_do_not_block_cli_completion() {
        assert_eq!(
            completion_phase(Some(&compile_result(Some("needs_human_input"), 2))),
            "completed"
        );
        assert_eq!(
            completion_phase(Some(&compile_result(Some("clear"), 0))),
            "completed"
        );
    }
}

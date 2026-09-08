use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::client::{CompileAccepted, CompileResult, HttpClient};
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
const MAX_UPLOAD_FILE_SIZE_BYTES: u64 = 512 * 1024 * 1024;
const DOCUMENT_EXTENSIONS: &[&str] = &["doc", "docx", "md", "markdown", "pdf", "xls", "xlsx"];
const MEMORY_EXTENSIONS: &[&str] = &["json", "markdown", "md", "text", "txt", "yaml", "yml"];

#[derive(Debug, Serialize)]
struct KnowledgeMiningResult {
    batch_id: String,
    phase: String,
    document_files: usize,
    memory_files: usize,
    window_count: usize,
    completed_windows: usize,
    state_file: String,
    run_log_uri: String,
    document_source_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_source_uri: Option<String>,
    okf_config_uri: String,
    target_uri: String,
    skill_uri: String,
    /// First document task retained for compatibility with the former single-window output.
    document_task_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_task_id: Option<String>,
    task_ids: Vec<String>,
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
    pub window_files: usize,
    pub window_bytes: u64,
    pub window_pages: usize,
    pub window_probes: usize,
    pub state_file: Option<String>,
    pub resume_state: Option<String>,
    pub reason: Option<String>,
    pub wait: bool,
    pub timeout: Option<f64>,
    pub runtime_timeout: Option<f64>,
    pub show_progress: bool,
    pub verbose: bool,
    pub output_format: OutputFormat,
    pub compact: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum WindowKind {
    Documents,
    Memory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowFileState {
    path: String,
    name: String,
    size_bytes: u64,
    uploaded: bool,
    #[serde(default)]
    resource_uri: String,
    pdf_pages: usize,
    estimated_probes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MiningWindowState {
    index: usize,
    kind: WindowKind,
    source_uri: String,
    size_bytes: u64,
    pdf_pages: usize,
    estimated_probes: usize,
    oversized_singleton: bool,
    status: String,
    files: Vec<WindowFileState>,
    task_id: Option<String>,
    error: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    #[serde(default)]
    validation_passed: Option<bool>,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MiningRunState {
    version: String,
    batch_id: String,
    root_uri: String,
    target_uri: String,
    skill_uri: String,
    okf_config_uri: String,
    reason: String,
    window_file_limit: usize,
    window_byte_limit: u64,
    window_page_limit: usize,
    window_probe_limit: usize,
    phase: String,
    created_at: String,
    updated_at: String,
    windows: Vec<MiningWindowState>,
}

pub async fn run(client: &HttpClient, options: KnowledgeMiningOptions) -> Result<()> {
    validate_window_limits(
        options.window_files,
        options.window_bytes,
        options.window_pages,
        options.window_probes,
    )?;
    if options
        .timeout
        .is_some_and(|seconds| !crate::config::timeout_is_valid(seconds))
    {
        return Err(Error::Client(
            "--timeout must be a positive finite number of seconds".into(),
        ));
    }
    let resume_path = options.resume_state.as_deref().map(PathBuf::from);
    let (mut state, state_path, okf_config) = if let Some(path) = resume_path {
        let state = load_run_state(&path)?;
        validate_resume_files(&state)?;
        (state, path, None)
    } else {
        let document_files =
            collect_supported_files(&options.document_paths, DOCUMENT_EXTENSIONS, "documents")?;
        let memory_files = if options.memory_paths.is_empty() {
            Vec::new()
        } else {
            collect_supported_files(&options.memory_paths, MEMORY_EXTENSIONS, "memory")?
        };
        let reason = options
            .reason
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_REASON)
            .to_owned();
        let batch_id = create_batch_id();
        let root_uri = format!("viking://resources/knowledge-mining/{batch_id}");
        let target_uri = options
            .target_uri
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| format!("{root_uri}/wiki"));
        let windows = build_window_states(
            &root_uri,
            &document_files,
            &memory_files,
            options.window_files,
            options.window_bytes,
            options.window_pages,
            options.window_probes,
        )?;
        if windows.len() > 1 && !options.wait {
            return Err(Error::Client(format!(
                "{} serial windows were planned; use --wait so the CLI can run them end to end",
                windows.len()
            )));
        }
        let now = Utc::now().to_rfc3339();
        let state = MiningRunState {
            version: "1.0".into(),
            batch_id: batch_id.clone(),
            root_uri: root_uri.clone(),
            target_uri,
            skill_uri: options
                .skill_uri
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or_default()
                .to_owned(),
            okf_config_uri: format!("{root_uri}/OKF_CONFIG.yaml"),
            reason,
            window_file_limit: options.window_files,
            window_byte_limit: options.window_bytes,
            window_page_limit: options.window_pages,
            window_probe_limit: options.window_probes,
            phase: "preparing".into(),
            created_at: now.clone(),
            updated_at: now,
            windows,
        };
        let path = options
            .state_file
            .as_deref()
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(".openviking")
                    .join("knowledge-mining")
                    .join(format!("{batch_id}.json"))
            });
        save_run_state(&path, &state)?;
        (
            state,
            path,
            Some(load_okf_config(options.okf_config_path.as_deref())?),
        )
    };

    let _: Value = client.get("/bot/v1/health", &[]).await?;
    if state.skill_uri.is_empty() {
        state.skill_uri =
            ensure_llm_wiki_skill(client, options.show_progress, options.verbose).await?;
    }
    mkdir_idempotent(
        client,
        &state.root_uri,
        Some("Knowledge-mining serial run"),
    )
    .await?;
    if let Some(config) = okf_config {
        write_text_upsert_compatible(client, &state.okf_config_uri, &config).await?;
    }
    checkpoint_run(client, &state_path, &mut state).await?;

    let should_wait = options.wait || options.resume_state.is_some();
    let mut final_result = None;
    for window_index in 0..state.windows.len() {
        if state.windows[window_index].status == "completed" {
            continue;
        }
        if state.windows[window_index].status == "partial" && options.resume_state.is_none() {
            state.phase = "partial".into();
            break;
        }
        let outcome = run_serial_window(
            client,
            &mut state,
            window_index,
            &state_path,
            should_wait,
            options.timeout,
            options.runtime_timeout,
            options.show_progress,
            options.verbose,
            options.output_format,
        )
        .await;
        match outcome {
            Ok(result) => {
                if result.is_some() {
                    final_result = result;
                }
            }
            Err(error) => {
                let task_may_still_be_running = state.windows[window_index].task_id.is_some()
                    && state.windows[window_index].status == "compiling";
                state.phase = if task_may_still_be_running {
                    "running"
                } else {
                    "failed"
                }
                .into();
                if !task_may_still_be_running {
                    state.windows[window_index].status = "failed".into();
                }
                state.windows[window_index].error = Some(error.to_string());
                let _ = checkpoint_run(client, &state_path, &mut state).await;
                let _ = write_window_log(client, &state, window_index).await;
                print_progress(
                    options.output_format,
                    format!(
                        "Checkpoint saved at {}. Resume with: ov knowledge-mining --resume-state {}",
                        state_path.display(),
                        state_path.display()
                    ),
                );
                return Err(error);
            }
        }
        if !should_wait || state.phase == "partial" {
            break;
        }
    }
    if state
        .windows
        .iter()
        .all(|window| window.status == "completed")
    {
        state.phase = completion_phase(final_result.as_ref()).into();
    }
    checkpoint_run(client, &state_path, &mut state).await?;
    output_result(
        build_result(&state, &state_path, final_result),
        options.output_format,
        options.compact,
    )
}

fn validate_window_limits(
    file_limit: usize,
    byte_limit: u64,
    page_limit: usize,
    probe_limit: usize,
) -> Result<()> {
    if file_limit == 0 {
        return Err(Error::Client(
            "--window-files must be greater than zero".into(),
        ));
    }
    if byte_limit == 0 {
        return Err(Error::Client(
            "--window-bytes must be greater than zero".into(),
        ));
    }
    if page_limit == 0 {
        return Err(Error::Client(
            "--window-pages must be greater than zero".into(),
        ));
    }
    if probe_limit == 0 {
        return Err(Error::Client(
            "--window-probes must be greater than zero".into(),
        ));
    }
    Ok(())
}

fn estimated_required_probes(fragment_count: usize) -> usize {
    match fragment_count {
        0 => 1,
        1..=8 => fragment_count,
        9..=24 => 12,
        25..=64 => 16,
        _ => 24,
    }
}

fn window_file(path: &Path) -> Result<WindowFileState> {
    let size_bytes = path.metadata()?.len();
    let is_pdf = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"));
    let pdf_pages = if is_pdf {
        lopdf::Document::load(path)
            .map_err(|error| {
                Error::Parse(format!(
                    "Cannot inspect PDF page count for {}: {error}",
                    path.display()
                ))
            })?
            .get_pages()
            .len()
    } else {
        0
    };
    let estimated_fragments = if is_pdf {
        pdf_pages.max(1)
    } else {
        usize::try_from(size_bytes.saturating_add(65_535) / 65_536)
            .unwrap_or(usize::MAX)
            .max(1)
    };
    Ok(WindowFileState {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("source")
            .to_owned(),
        size_bytes,
        uploaded: false,
        resource_uri: String::new(),
        pdf_pages,
        estimated_probes: estimated_required_probes(estimated_fragments),
    })
}

fn plan_kind_windows(
    files: &[PathBuf],
    kind: WindowKind,
    file_limit: usize,
    byte_limit: u64,
    page_limit: usize,
    probe_limit: usize,
) -> Result<Vec<(WindowKind, Vec<WindowFileState>, u64, usize, usize, bool)>> {
    let mut planned = Vec::new();
    let mut current = Vec::new();
    let mut current_bytes = 0_u64;
    let mut current_pages = 0_usize;
    let mut current_probes = 0_usize;
    for path in files {
        let file = window_file(path)?;
        if file.size_bytes > byte_limit
            || file.pdf_pages > page_limit
            || file.estimated_probes > probe_limit
        {
            if !current.is_empty() {
                planned.push((
                    kind.clone(),
                    std::mem::take(&mut current),
                    current_bytes,
                    current_pages,
                    current_probes,
                    false,
                ));
                current_bytes = 0;
                current_pages = 0;
                current_probes = 0;
            }
            let size = file.size_bytes;
            let pages = file.pdf_pages;
            let probes = file.estimated_probes;
            planned.push((kind.clone(), vec![file], size, pages, probes, true));
            continue;
        }
        if !current.is_empty()
            && (current.len() >= file_limit
                || current_bytes + file.size_bytes > byte_limit
                || current_pages + file.pdf_pages > page_limit
                || current_probes + file.estimated_probes > probe_limit)
        {
            planned.push((
                kind.clone(),
                std::mem::take(&mut current),
                current_bytes,
                current_pages,
                current_probes,
                false,
            ));
            current_bytes = 0;
            current_pages = 0;
            current_probes = 0;
        }
        current_bytes += file.size_bytes;
        current_pages += file.pdf_pages;
        current_probes += file.estimated_probes;
        current.push(file);
    }
    if !current.is_empty() {
        planned.push((
            kind,
            current,
            current_bytes,
            current_pages,
            current_probes,
            false,
        ));
    }
    Ok(planned)
}

fn build_window_states(
    root_uri: &str,
    documents: &[PathBuf],
    memory: &[PathBuf],
    file_limit: usize,
    byte_limit: u64,
    page_limit: usize,
    probe_limit: usize,
) -> Result<Vec<MiningWindowState>> {
    let mut planned = plan_kind_windows(
        documents,
        WindowKind::Documents,
        file_limit,
        byte_limit,
        page_limit,
        probe_limit,
    )?;
    planned.extend(plan_kind_windows(
        memory,
        WindowKind::Memory,
        file_limit,
        byte_limit,
        page_limit,
        probe_limit,
    )?);
    Ok(planned
        .into_iter()
        .enumerate()
        .map(
            |(
                offset,
                (kind, files, size_bytes, pdf_pages, estimated_probes, oversized_singleton),
            )| {
                let index = offset + 1;
                let source_name = match kind {
                    WindowKind::Documents => "document-sources",
                    WindowKind::Memory => "team-memory",
                };
                let mut files = files;
                for (file_offset, file) in files.iter_mut().enumerate() {
                    file.resource_uri = format!(
                        "{root_uri}/windows/{index:04}/{source_name}/{:06}",
                        file_offset + 1
                    );
                }
                MiningWindowState {
                    index,
                    kind,
                    source_uri: format!("{root_uri}/windows/{index:04}/{source_name}"),
                    size_bytes,
                    pdf_pages,
                    estimated_probes,
                    oversized_singleton,
                    status: "planned".into(),
                    files,
                    task_id: None,
                    error: None,
                    started_at: None,
                    completed_at: None,
                    validation_passed: None,
                    warnings: Vec::new(),
                }
            },
        )
        .collect())
}

fn save_run_state(path: &Path, state: &MiningRunState) -> Result<()> {
    if let Some(parent) = path.parent().filter(|value| !value.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(state)?)?;
    fs::rename(temporary, path)?;
    Ok(())
}

fn load_run_state(path: &Path) -> Result<MiningRunState> {
    let bytes = fs::read(path).map_err(|error| {
        Error::InvalidPath(format!(
            "Cannot read resume state {}: {error}",
            path.display()
        ))
    })?;
    serde_json::from_slice(&bytes)
        .map_err(|error| Error::Parse(format!("Invalid resume state {}: {error}", path.display())))
}

fn validate_resume_files(state: &MiningRunState) -> Result<()> {
    for window in &state.windows {
        for file in window.files.iter().filter(|file| !file.uploaded) {
            let path = Path::new(&file.path);
            let size = path
                .metadata()
                .map_err(|error| {
                    Error::InvalidPath(format!(
                        "Cannot resume missing source {}: {error}",
                        file.path
                    ))
                })?
                .len();
            if size != file.size_bytes {
                return Err(Error::Client(format!(
                    "Cannot resume because {} changed size ({} -> {} bytes)",
                    file.path, file.size_bytes, size
                )));
            }
        }
    }
    Ok(())
}

fn remote_run_state(state: &MiningRunState) -> Value {
    json!({
        "version": state.version,
        "batch_id": state.batch_id,
        "root_uri": state.root_uri,
        "target_uri": state.target_uri,
        "skill_uri": state.skill_uri,
        "okf_config_uri": state.okf_config_uri,
        "reason": state.reason,
        "window_file_limit": state.window_file_limit,
        "window_byte_limit": state.window_byte_limit,
        "window_page_limit": state.window_page_limit,
        "window_probe_limit": state.window_probe_limit,
        "phase": state.phase,
        "created_at": state.created_at,
        "updated_at": state.updated_at,
        "windows": state.windows.iter().map(|window| json!({
            "index": window.index,
            "kind": window.kind,
            "source_uri": window.source_uri,
            "size_bytes": window.size_bytes,
            "pdf_pages": window.pdf_pages,
            "estimated_probes": window.estimated_probes,
            "oversized_singleton": window.oversized_singleton,
            "status": window.status,
            "files": window.files.iter().map(|file| json!({
                "name": file.name,
                "size_bytes": file.size_bytes,
                "uploaded": file.uploaded,
                "resource_uri": file.resource_uri,
                "pdf_pages": file.pdf_pages,
                "estimated_probes": file.estimated_probes,
            })).collect::<Vec<_>>(),
            "task_id": window.task_id,
            "error": window.error,
            "started_at": window.started_at,
            "completed_at": window.completed_at,
            "validation_passed": window.validation_passed,
            "warnings": window.warnings,
        })).collect::<Vec<_>>(),
    })
}

async fn checkpoint_run(
    client: &HttpClient,
    state_path: &Path,
    state: &mut MiningRunState,
) -> Result<()> {
    state.updated_at = Utc::now().to_rfc3339();
    save_run_state(state_path, state)?;
    let content = serde_json::to_string_pretty(&remote_run_state(state))? + "\n";
    write_text_upsert_compatible(
        client,
        &format!("{}/logs/run.json", state.root_uri),
        &content,
    )
    .await?;
    Ok(())
}

fn checkpoint_local(state_path: &Path, state: &mut MiningRunState) -> Result<()> {
    state.updated_at = Utc::now().to_rfc3339();
    save_run_state(state_path, state)
}

async fn write_window_log(
    client: &HttpClient,
    state: &MiningRunState,
    window_index: usize,
) -> Result<()> {
    let window = &state.windows[window_index];
    let content = serde_json::to_string_pretty(&json!({
        "version": state.version,
        "batch_id": state.batch_id,
        "target_uri": state.target_uri,
        "window": remote_run_state(state)["windows"][window_index].clone(),
    }))? + "\n";
    write_text_upsert_compatible(
        client,
        &format!("{}/logs/windows/{:04}.json", state.root_uri, window.index),
        &content,
    )
    .await?;
    Ok(())
}

async fn write_text_upsert_compatible(
    client: &HttpClient,
    uri: &str,
    content: &str,
) -> Result<()> {
    match client
        .write(
            uri,
            content,
            "create",
            false,
            None,
            "semantic_and_vectors",
        )
        .await
    {
        Ok(_) => Ok(()),
        Err(error) if matches!(error.code(), "CONFLICT" | "ALREADY_EXISTS") => {
            client
                .write(
                    uri,
                    content,
                    "replace",
                    false,
                    None,
                    "semantic_and_vectors",
                )
                .await?;
            Ok(())
        }
        Err(error) => Err(error),
    }
}

async fn mkdir_idempotent(
    client: &HttpClient,
    uri: &str,
    reason: Option<&str>,
) -> Result<()> {
    match client.mkdir(uri, reason).await {
        Ok(_) => Ok(()),
        Err(error) if matches!(error.code(), "CONFLICT" | "ALREADY_EXISTS") => Ok(()),
        Err(error) => Err(error),
    }
}

async fn upload_window_file(
    client: &HttpClient,
    file: &WindowFileState,
    show_progress: bool,
    verbose: bool,
) -> Result<()> {
    let path = Path::new(&file.path);
    let preserve_original = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"));
    let resource_args = preserve_original
        .then(|| serde_json::Map::from_iter([("preserve_original".to_owned(), Value::Bool(true))]));
    client
        .add_resource(
            &file.path,
            None,
            Some(file.resource_uri.clone()),
            None,
            None,
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
            resource_args,
            Vec::new(),
            "replace".into(),
            show_progress,
            verbose,
        )
        .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_serial_window(
    client: &HttpClient,
    state: &mut MiningRunState,
    window_index: usize,
    state_path: &Path,
    wait: bool,
    timeout: Option<f64>,
    runtime_timeout: Option<f64>,
    show_progress: bool,
    verbose: bool,
    output_format: OutputFormat,
) -> Result<Option<CompileResult>> {
    let resumes_partial = state.windows[window_index].status == "partial";
    if state.windows[window_index].status == "failed" {
        state.windows[window_index].task_id = None;
    }
    state.windows[window_index].error = None;
    state.phase = "running".into();
    state.windows[window_index].status = "uploading".into();
    if state.windows[window_index].started_at.is_none() {
        state.windows[window_index].started_at = Some(Utc::now().to_rfc3339());
    }
    checkpoint_run(client, state_path, state).await?;

    let source_uri = state.windows[window_index].source_uri.clone();
    mkdir_idempotent(
        client,
        &source_uri,
        Some("Knowledge-mining window sources"),
    )
    .await?;
    let file_count = state.windows[window_index].files.len();
    print_progress(
        output_format,
        format!(
            "Window {}/{}: uploading {} file(s) to {}...",
            window_index + 1,
            state.windows.len(),
            file_count,
            source_uri
        ),
    );
    for file_index in 0..file_count {
        if state.windows[window_index].files[file_index].uploaded {
            continue;
        }
        let file = state.windows[window_index].files[file_index].clone();
        upload_window_file(client, &file, show_progress, verbose).await?;
        state.windows[window_index].files[file_index].uploaded = true;
        checkpoint_local(state_path, state)?;
    }

    if !resumes_partial {
        if let Some(task_id) = state.windows[window_index].task_id.clone() {
            state.windows[window_index].status = "compiling".into();
            checkpoint_run(client, state_path, state).await?;
            let existing = client.get_compile(&task_id).await?;
            if matches!(existing.status.as_str(), "failed" | "cancelled") {
                state.windows[window_index].task_id = None;
            }
        }
    }

    let accepted = if let Some(task_id) = state.windows[window_index].task_id.clone() {
        state.windows[window_index].status = "compiling".into();
        checkpoint_run(client, state_path, state).await?;
        if resumes_partial {
            let accepted = client.resume_compile(&task_id).await?;
            state.windows[window_index].task_id = Some(accepted.task_id.clone());
            accepted
        } else {
            CompileAccepted {
                task_id,
                status: "running".into(),
                to: state.target_uri.clone(),
            }
        }
    } else {
        state.windows[window_index].status = "queued".into();
        checkpoint_run(client, state_path, state).await?;
        let reason = if state.windows[window_index].kind == WindowKind::Memory {
            format!("{}\n\n{}", state.reason, MEMORY_INCREMENTAL_REASON)
        } else if window_index == 0 {
            state.reason.clone()
        } else {
            format!(
                "{}\n\n这是串行窗口 {}/{} 的增量更新。完整保留现有目标知识库，只用本窗口新增证据补充、纠正和去重。",
                state.reason,
                window_index + 1,
                state.windows.len()
            )
        };
        let accepted = client
            .create_compile(
                std::slice::from_ref(&source_uri),
                &state.target_uri,
                &state.skill_uri,
                Some(&state.okf_config_uri),
                Some(&reason),
                runtime_timeout,
                Some(true),
            )
            .await?;
        state.windows[window_index].task_id = Some(accepted.task_id.clone());
        accepted
    };
    state.windows[window_index].status = "compiling".into();
    checkpoint_run(client, state_path, state).await?;
    if !wait {
        return Ok(None);
    }

    print_progress(
        output_format,
        format!(
            "Window {}/{}: compiling into {}...",
            window_index + 1,
            state.windows.len(),
            state.target_uri
        ),
    );
    let task = wait_for_completion(client, &accepted, timeout).await?;
    let result = task.result;
    let partial = task.stage == "salvaged";
    state.windows[window_index].validation_passed = result
        .as_ref()
        .and_then(|compile_result| compile_result.validation_passed);
    state.windows[window_index].warnings = result
        .as_ref()
        .map(|compile_result| compile_result.warnings.clone())
        .unwrap_or_default();
    state.windows[window_index].status = if partial { "partial" } else { "completed" }.into();
    state.windows[window_index].completed_at = Some(Utc::now().to_rfc3339());
    state.phase = if partial { "partial" } else { "running" }.into();
    checkpoint_run(client, state_path, state).await?;
    write_window_log(client, state, window_index).await?;
    Ok(result)
}

fn build_result(
    state: &MiningRunState,
    state_path: &Path,
    result: Option<CompileResult>,
) -> KnowledgeMiningResult {
    let document_windows: Vec<_> = state
        .windows
        .iter()
        .filter(|window| window.kind == WindowKind::Documents)
        .collect();
    let memory_windows: Vec<_> = state
        .windows
        .iter()
        .filter(|window| window.kind == WindowKind::Memory)
        .collect();
    KnowledgeMiningResult {
        batch_id: state.batch_id.clone(),
        phase: state.phase.clone(),
        document_files: document_windows
            .iter()
            .map(|window| window.files.len())
            .sum(),
        memory_files: memory_windows.iter().map(|window| window.files.len()).sum(),
        window_count: state.windows.len(),
        completed_windows: state
            .windows
            .iter()
            .filter(|window| window.status == "completed")
            .count(),
        state_file: state_path.to_string_lossy().into_owned(),
        run_log_uri: format!("{}/logs/run.json", state.root_uri),
        document_source_uri: document_windows
            .first()
            .map(|window| window.source_uri.clone())
            .unwrap_or_default(),
        memory_source_uri: memory_windows
            .first()
            .map(|window| window.source_uri.clone()),
        okf_config_uri: state.okf_config_uri.clone(),
        target_uri: state.target_uri.clone(),
        skill_uri: state.skill_uri.clone(),
        document_task_id: document_windows
            .iter()
            .find_map(|window| window.task_id.clone())
            .unwrap_or_default(),
        memory_task_id: memory_windows
            .iter()
            .find_map(|window| window.task_id.clone()),
        task_ids: state
            .windows
            .iter()
            .filter_map(|window| window.task_id.clone())
            .collect(),
        result,
    }
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

async fn ensure_llm_wiki_skill(
    client: &HttpClient,
    show_progress: bool,
    verbose: bool,
) -> Result<String> {
    let listed = client.skills_list(1000, None).await?;
    if let Some(uri) = find_llm_wiki_skill(&listed) {
        return Ok(uri);
    }

    let package_root = tempfile::tempdir()?;
    let package = package_root.path().join("llm-wiki");
    fs::create_dir_all(&package)?;
    fs::write(package.join("SKILL.md"), DEFAULT_SKILL)?;
    fs::write(package.join("USER_PROFILE.md"), DEFAULT_USER_PROFILE)?;
    fs::write(package.join("OKF_CONFIG.yaml"), DEFAULT_OKF_CONFIG)?;
    let installed = client
        .add_skill(
            &package.to_string_lossy(),
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
            "{} is larger than the 512 MiB server upload limit",
            path.display()
        )));
    }
    files.insert(path.to_path_buf());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        DOCUMENT_EXTENSIONS, MEMORY_EXTENSIONS, WindowKind, collect_supported_files,
        completion_phase, find_llm_wiki_skill, plan_kind_windows, window_file,
    };
    use crate::client::CompileResult;
    use lopdf::{Document, Object, dictionary};
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
    fn reads_actual_pdf_page_count_for_window_budgeting() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("three-pages.pdf");
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let page_ids = (0..3)
            .map(|_| {
                document.add_object(dictionary! {
                    "Type" => "Page",
                    "Parent" => pages_id,
                    "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
                })
            })
            .collect::<Vec<_>>();
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
                "Count" => 3,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        document.save(&path).expect("save pdf");

        let inspected = window_file(&path).expect("inspect pdf");

        assert_eq!(inspected.pdf_pages, 3);
        assert_eq!(inspected.estimated_probes, 3);
    }

    #[test]
    fn plans_adaptive_windows_and_isolates_oversized_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let sizes = [40_u64, 40, 120, 30];
        let files = sizes
            .iter()
            .enumerate()
            .map(|(index, size)| {
                let path = dir.path().join(format!("{index}.md"));
                let file = std::fs::File::create(&path).expect("create file");
                file.set_len(*size).expect("size file");
                path
            })
            .collect::<Vec<_>>();

        let windows = plan_kind_windows(&files, WindowKind::Documents, 2, 100, 1_500, 300)
            .expect("plan windows");
        assert_eq!(windows.len(), 3);
        assert_eq!(windows[0].1.len(), 2);
        assert_eq!(windows[0].2, 80);
        assert_eq!(windows[0].4, 2);
        assert!(windows[1].5);
        assert_eq!(windows[1].2, 120);
        assert_eq!(windows[2].1.len(), 1);
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

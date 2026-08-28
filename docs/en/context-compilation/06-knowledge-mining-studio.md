# Studio Knowledge Mining

The Web Studio Knowledge Mining page combines file ingestion, the `llm-wiki` Skill, and VikingBot Compile into one visual workflow. Users can select a complete resource folder, describe the objective, follow the long-running task, and resolve evidence conflicts or gaps before the run is considered final.

## Prerequisites

Knowledge Mining requires VikingBot. Enable the Bot when starting a local server:

```bash
openviking-server --with-bot
```

Then open `http://localhost:1933/studio/knowledge-mining`. For a remote server, configure the API key and user identity in Studio Connection Settings.

The server also needs working VLM, Embedding, and VikingBot LLM settings. Check the base configuration first:

```bash
openviking-server doctor
curl http://localhost:1933/bot/v1/health
```

## Workflow

1. Choose individual files or a complete resource folder containing `documents/` and `team-memory/`; Studio recursively classifies its subdirectories. Supported document extensions are `.pdf`, `.md`, `.markdown`, `.doc`, `.docx`, `.xls`, and `.xlsx`. The total file count is unlimited and each file may be up to 10 MiB.
2. Optionally upload team Memory files (`.md`, `.txt`, `.json`, `.yaml`, `.yml`). They use an isolated source root and are not mixed into the first document Compile.
3. **OKF format config** uses `llm-wiki/OKF_CONFIG.yaml` by default. A custom `.yaml`/`.yml` can strictly define required frontmatter, `main_view.path_structure`, facets, path/type mappings, derived views, and WikiLink rules. Submission rejects unconfigured directories or `view/...` groups.
4. Describe the question, audience, time range, output language, and priorities. This text becomes the Compile `reason`.
5. Select **Start knowledge mining**. Studio first saves the complete batch under isolated directories and then adds it to a FIFO queue. You can immediately create another batch, upload a different dataset, and queue it without sharing source or output directories. The queue head builds the main knowledge base from documents first. If team Memory was uploaded, it starts a second incremental Compile against the same target after the document task succeeds.
6. **Mining history** lists the current principal's recent, running, and queued batches with queue positions. Select any batch to inspect it through the same full directory, coverage ledger, intermediate, questionnaire, and knowledge-cloud interface. The queue runs exactly one complete mining workflow at a time: document, Memory, and human-evidence stages belong to the same workflow, and a run waiting for human evidence blocks later jobs. The next item starts only after the current workflow completes, produces a partial result, fails, or is cancelled. Running Compile tasks can be cancelled cooperatively, queued items can leave the queue, and failed or cancelled tasks can resume from a checkpoint only when the queue is idle.
7. Browse physical knowledge files in an expandable directory tree. The default physical structure is exactly `knowledge/<facet>/<meta_id>/<filename>`: what, why, and how are top-level facets rather than final parent directories. Every unit still contains one page per facet sharing an explicit `meta_id`; root `index.md` is navigation and is not counted as knowledge. Legacy results receive a compatible virtual meta directory.
8. Main, Domain, and Usage always contain the exact same files and file total. **Knowledge domain** is the unit's single primary subject, while **Usage** is its single primary job to be done; both move the complete triplet without copying or splitting files. **Intermediates** expose the audit trail, and **Human investigation** is the pre-completion evidence gate.
9. **Knowledge cloud** directly reuses the official KG Explorer HTML/CSS/D3 renderer in `examples/compile/graph-show/knowledge-graph/knowledge_graph.py`. Studio only adapts meta-knowledge, what/why/how pages, WikiLinks, cross-knowledge references, and evidence chains into the official `nodes` / `links` data. Type filters, relation legend, search, neighbor focus, pan/zoom, and the entity inspector remain intact.
10. **Source coverage** shows uploaded, inspected, cited, merged, and skipped materials with reasons. Missing sources, unread sources, unjustified skips, or citations that disagree with the evidence ledger reject submission so VikingBot continues working.
11. When conflicts or evidence gaps exist, Studio switches the workflow to **Waiting for human evidence** and immediately exposes the provisional pages and questionnaire without declaring the run complete. Answers become a `human-answer` source and trigger an incremental Compile against the same target. The workflow completes only after the open issues are handled.

## Display CLI mining results

The **Import and display CLI mining results** area reuses exactly the same Main, derived-view, source-coverage, intermediate, questionnaire, and knowledge-cloud renderers as a Studio run. It does not run VikingBot again. Three connection paths are supported:

1. **Automatic same-server discovery**: when the CLI and Studio use the same OpenViking server and identity, Studio recognizes Compile-history tasks that use `llm-wiki`. Their `to` URI may be outside `viking://resources/knowledge-mining/`; they still appear in Mining history with a **CLI result** badge.
2. **Attach an existing result URI**: when Compile history has expired but the target still exists, enter the CLI command's `--to` URI. Studio recursively validates `index.md`, knowledge pages, and `_mining/` artifacts, then reconstructs display metadata from the run manifest, coverage ledger, investigation report, questionnaire, directory structure, and page tags.
3. **Upload an OVPack**: to display a result from another server, export the target in the original CLI environment and upload the resulting file in Studio:

```bash
ov export viking://resources/research-wiki ./research-wiki.ovpack
```

Studio uses the official OVPack import endpoint to verify the manifest, file set, and checksums. It imports under an isolated `viking://resources/knowledge-mining-imports/<batch-id>/...` directory so existing knowledge bases cannot be overwritten, then adds the result to Mining history and opens it immediately. If the OVPack does not contain the Compile response, Studio derives page counts, What/Why/How layout, source coverage, human gate, and derived views from the Wiki tree and mining ledgers.

Imported results are review-only by default. Questionnaires remain fully visible, but Studio does not guess source or Skill settings and start a human incremental Compile. To continue mining, supply new evidence as `from` in the original CLI environment and incrementally Compile the same `to` URI.

## Data and execution model

Each run creates an isolated directory:

```text
viking://resources/knowledge-mining/<batch-id>/
├── document-sources/   # uploaded and parsed documents
│   └── OKF_CONFIG.yaml  # external OKF contract for this Compile run
├── team-memory/        # optional incremental team Memory source
└── wiki/                # llm-wiki Compile output
    ├── index.md
    ├── knowledge/what/<meta_id>/*.md
    ├── knowledge/why/<meta_id>/*.md
    ├── knowledge/how/<meta_id>/*.md
    └── _mining/
        ├── run-manifest.json
        ├── evidence-ledger.json
        ├── investigation-report.json
        ├── questionnaire.json
        ├── source-coverage.json
        ├── candidate-knowledge.json
        ├── readlist.json
        └── evidence-history.json
```

The page uses OpenViking's existing temporary upload and `add_resource` APIs and waits for semantic processing. It then calls:

```http
POST /bot/v1/compile
```

Queue state and FIFO order are persisted in the browser for the current Studio identity. Refreshing or reopening Knowledge Mining resumes scheduling. Compile tasks that already started continue independently on the server when the page is closed; queued tasks that have not started continue the next time the page opens and confirms that no other Compile is running. Before dispatch, Studio checks both server history and local state so restoring the page cannot accidentally overlap two workflows.

The first request uses `from=document-sources` and `to=wiki`. When team Memory exists, the second request strictly uses `from=team-memory` and `to=wiki`; VikingBot reads the existing target before merging the new evidence. Incremental validation permits existing document provenance to remain while new Memory provenance must still come from the second supplied source.

`skill` points at the current user's or shared `llm-wiki` Skill, and `okf_config` points at the batch's `OKF_CONFIG.yaml`. VikingBot materializes the contract as `compile_config/OKF_CONFIG.yaml` and gives it precedence. The submitter deterministically validates the exact level count and order in `main_view.path_structure`, facet values, the `meta_id` directory, every configured derived-view tag, frontmatter, input-plus-intermediate provenance, cross-knowledge references, WikiLinks, and all eight intermediate artifacts. Model-invented topic/domain/misc directories, moved facets, undeclared view namespaces, and unknown groups fail submission.

Studio no longer sends a one-hour runtime limit when it starts Compile, and the server has no wall-clock hard deadline by default. The three-phase gates persist private server-side recovery checkpoints after source coverage and candidate knowledge pass; cooperative cancellation also attempts to preserve the current workspace. Resume reuses the original task's source URIs and sanitized request, validates the source signature, and restores the checkout, read ledger, and phase state. Nothing from this checkpoint is written to the canonical `wiki/` target before final submission passes, so interrupted runs do not expose a half-validated knowledge base.

## Main and derived views

The Main view always corresponds to the physical files under `wiki/` and is the single source of truth. Except for `index.md`, the default contract's exact `path_structure` is `facet/meta_id/filename`, producing `knowledge/what|why|how/<meta_id>/*.md`. What/Why/How are no longer hard-coded as the final directory; their position and allowed values come from `path_structure` and `facet_categories`. Every unit has exactly one page per configured facet and a shared stable `meta_id`. Submission rejects extra, missing, or reordered levels, unknown facets, mismatched meta ids, duplicate facets, missing facets, and inconsistent unit view tags.

Derived views never copy or move pages. They group complete units using the same namespaced OKF frontmatter tags on all three pages. `index.md` is excluded, and each default view uses `selection: exactly_one`; therefore Main, Domain, and Usage contain the exact same knowledge-file set and total. The default contract provides `domain` and `usage` views. A custom contract may define other `views` with a `tag_prefix`, `selection`, and `groups`; submission rejects every undeclared `view/...` namespace or group, and Studio builds branches only from the validated config.

## Provenance, cross-knowledge references, and human confirmation

Every knowledge page's `sources` must include at least one input (`original`, `team-memory`, or `human-answer`) and one configured `intermediate` artifact. `_mining/evidence-ledger.json` also maps every page to input URIs, intermediate URIs, and material claims, so final knowledge can be traced back through processing to uploaded documents.

`_mining/source-coverage.json` works at the user upload level rather than counting parser chunks as independent sources. Every source is `cited`, `merged`, or `skipped`; all fragments for small documents and adaptive deterministic head/middle/tail probes for large documents must appear in the platform-generated `readlist.json`, cited sources must resolve to evidence-ledger pages, merged sources must point to a directly cited source, and skipped sources require a source-specific reason that cannot be copied across uploads. `candidate-knowledge.json` is a mandatory pre-page checkpoint for every promote/merge/defer/reject decision; the platform does not synthesize missing rejected candidates. Incremental Compile merges prior evidence and appends an `evidence-history.json` snapshot.

Knowledge mining uses three platform-enforced gates in the fixed order `source_coverage` → `candidate_knowledge` → `page_generation`. The first phase must complete every required read probe, account for every current upload in source coverage, and call `submit_source_coverage`; candidate artifacts and final-page changes are rejected before that gate. The second phase must account for every upload in candidate knowledge and call `submit_candidate_knowledge`; final-page changes remain locked. Only then is `submit_wiki_bundle` unlocked. The task-start checkout is the comparison baseline, so incremental runs retain unchanged prior pages without allowing current page generation to bypass the gates.

Use `[[WikiLink]]` for pages in the same knowledge base. Cross-knowledge relations are passage-specific many-to-many references: different paragraphs in one page may cite different knowledge targets, and one target may be cited by many pages. Each `knowledge_links` item carries the target `viking://` URI, title, relation, direction, and a verbatim body `context`, while the corresponding body passage contains a readable Markdown link to that URI. The submitter validates both. Use `bidirectional` only when the other knowledge base contains the mirrored relation; otherwise keep it `outgoing` and record the absent reciprocal link as an evidence gap.

The investigation report is either `clear` or `needs_human_input`. Every open issue must be covered by a questionnaire question or submission fails. `needs_human_input` pauses Studio at the evidence gate instead of presenting the knowledge base as final. Human answers do not mutate pages directly: Studio saves them as a new source and incrementally compiles the same `to` directory so the Main view, evidence ledger, and report remain traceable.

The platform materializes the complete target through a node-bounded deep recursive inventory instead of the server's default three-level tree. Before submission it deterministically repairs and persists the run manifest, upload-level readlist, evidence history, per-page ledger, source coverage, and candidate knowledge, then merges the existing target checkout with the current one. An incremental stage therefore cannot delete first-stage knowledge by omitting old pages, overwrite the prior ledger, or erase audit history with malformed candidate JSON; if an older run already damaged source coverage, retained page provenance reconstructs the missing historical sources. If strict validation still fails, the task enters `salvaged` with an inspectable `validation_passed=false` partial result; Studio does not automatically start a following Memory or human-answer stage.

Studio uses the versioned repository copy at `examples/compile/ov-compile-skills/llm-wiki/SKILL.md`. It installs a user-scoped copy when needed and upgrades an older copy installed by Knowledge Mining so new hierarchy, citation, and human-evidence rules apply to subsequent runs.

## Troubleshooting

- **Cannot connect to VikingBot**: start the server with `--with-bot` and check `/bot/v1/health`.
- **File processing failed**: inspect the corresponding `add_resource` task and verify VLM/Embedding settings and file size.
- **Compile failed at `loading_skill`**: confirm that `llm-wiki` is visible on the Skills page and its `SKILL.md` is valid.
- **Compile failed at `agent`**: check the VikingBot LLM credentials, quota, context window, and server logs.
- **The task shows the `SALVAGED · validation failed` label**: it entered `salvaged`. Its pages and intermediates remain inspectable, but they did not pass the complete contract and do not trigger an automatic incremental stage. Review the warning and `_mining/` artifacts before rerunning.
- **Results are not readable yet**: wait for Compile to leave `writing`/`refreshing` and enter `completed` before reading the target directory.

Related: [Context Compilation overview](./01-overview.md) · [LLM Wiki example](./02-llm-wiki.md) · [VikingBot API](../api/24-vikingbot.md)

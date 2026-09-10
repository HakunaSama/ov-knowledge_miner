# VikingBot API

When OpenViking Server starts with `--with-bot`, it proxies VikingBot's core interaction endpoints below `/bot/v1`. These endpoints return `503` when Bot is not enabled.

**Code entry points**:

- `openviking/server/routers/bot.py` - OpenViking Server proxy and identity forwarding
- `bot/vikingbot/channels/openapi.py` - VikingBot Gateway routes
- `bot/vikingbot/channels/openapi_models.py` - request, response, and SSE event models

## API Reference

### health()

Check whether the Bot Gateway is available.

**HTTP API**

```bash
curl http://localhost:1933/bot/v1/health
```

**Response Example**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-07-24T09:00:00"
}
```

### chat()

Send text and/or images and wait for the complete reply. Omit `session_id` to create a new
session.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | string | Conditional | `""` | User text; required when `images` is empty |
| `images` | array | Conditional | `[]` | Up to four OpenAI-style `image_url` parts; required when `message` is empty |
| `session_id` | string | No | Generated | Existing session to continue |
| `context` | array | No | `null` | Additional messages containing `role` and `content` |
| `need_reply` | boolean | No | `true` | Whether the Bot should reply |
| `disabled_tools` | string[] | No | `[]` | Tool names disabled for this request |
| `channel_id` | string | No | `null` | Multi-channel routing identifier |

**HTTP API**

```bash
curl -X POST http://localhost:1933/bot/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message":"Summarize my project progress","session_id":"optional-session-id"}'
```

Images may use an accessible HTTPS URL or an inline Base64 data URL:

```bash
curl -X POST http://localhost:1933/bot/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "message": "Describe this image",
    "images": [{
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/photo.png"
      }
    }]
  }'
```

Inline Base64 images support JPEG, PNG, GIF, and WebP. Each decoded inline image is limited to
10 MiB; inline SVG and mismatched MIME signatures are rejected. For HTTPS URLs, the Gateway
validates the URL structure but does not fetch or inspect the remote resource, so remote format
support and related errors are provider-specific. Local filesystem paths are rejected. The
optional `detail` field accepts `auto`, `low`, or `high`; omit it for maximum provider
compatibility.

**CLI**

```bash
ov chat -m "Summarize my project progress"
```

**Response Example**

```json
{
  "session_id": "session-id",
  "response_id": "response-id",
  "message": "Here is the current project summary…",
  "events": null,
  "relevant_memories": null,
  "token_usage": {
    "prompt_tokens": 120,
    "completion_tokens": 42,
    "total_tokens": 162
  },
  "timestamp": "2026-07-24T09:00:00"
}
```

### chat_stream()

Return reasoning, tool calls, content deltas, and the final response as Server-Sent Events. The request fields are the same as `chat()`; the Gateway enables streaming automatically.

**HTTP API**

```bash
curl -N -X POST http://localhost:1933/bot/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message":"Analyze the current knowledge base"}'
```

**CLI**

```bash
ov chat -m "Analyze the current knowledge base"
```

**SSE Response Example**

Each message uses `data: <json>` format. The `X-VikingBot-Session-ID` response header contains the session ID.

```text
data: {"event":"reasoning_delta","data":"Inspecting the knowledge base…","timestamp":"2026-07-24T09:00:00"}

data: {"event":"content_delta","data":"The knowledge base contains","timestamp":"2026-07-24T09:00:01"}

data: {"event":"response","data":{"content":"The knowledge base contains…","response_id":"response-id"},"timestamp":"2026-07-24T09:00:02"}
```

`event` can be `reasoning`, `reasoning_delta`, `tool_call`, `tool_result`, `content_delta`, `iteration`, or `response`.

### compile()

Start an asynchronous, Skill-driven Compile task. VikingBot loads the selected Skill, reads the supplied OpenViking directories with the authenticated user identity, runs a task-scoped AgentLoop, and commits validated outputs below the target URI.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `from` | string[] | Yes | - | One or more source directories |
| `to` | string | Yes | - | Target Resource or Memory directory, or a supported Skill namespace |
| `skill` | string | Yes | - | Skill directory or its `SKILL.md` URI |
| `okf_config` | string | No | - | External OKF YAML file URI; Resource Wiki submission validates frontmatter, single-main-view path/type rules, and standard Markdown links against it |
| `allow_invalid_okf_output` | boolean | No | `false` | Record final OKF conformance failures as warnings and still commit the checkout. Knowledge-mining clients set this to `true`; ordinary Compile remains strict by default. |
| `reason` | string | No | Skill-driven default | Additional instructions for this Compile run |
| `runtime_timeout_seconds` | number | No | None | Optional positive runtime limit. With no value, the task has no server-side hard deadline. If an administrator configures a server maximum, this value must not exceed it |

**HTTP API**

```
POST /bot/v1/compile
```

```bash
curl -X POST http://localhost:1933/bot/v1/compile \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "from": ["viking://resources/research"],
    "to": "viking://resources/research-wiki",
    "skill": "viking://user/default/skills/research-compiler",
    "okf_config": "viking://resources/research/OKF_CONFIG.yaml",
    "reason": "Track the historical progress and preserve supporting evidence."
  }'
```

**CLI**

```bash
ov compile \
  --from viking://resources/research \
  --to viking://resources/research-wiki \
  --skill viking://user/default/skills/research-compiler \
  --okf-config viking://resources/research/OKF_CONFIG.yaml \
  --reason "Track the historical progress and preserve supporting evidence." \
  --wait
```

`--okf-config` points to a readable YAML file in OpenViking. VikingBot materializes it as `compile_config/OKF_CONFIG.yaml` and treats it as control data rather than knowledge; the external contract takes precedence over conflicting Skill format rules. Omitting it preserves existing Compile behavior.

`--wait` polls the status endpoint until the task reaches a terminal state. `--timeout` limits only the local wait and does not cancel the server task. There is no server-side hard runtime deadline by default; a task is deadline-bound only when `--runtime-timeout` is supplied or an administrator configures a server maximum. Requests above an administrator maximum are rejected with `429 RESOURCE_EXHAUSTED`. Compile now allows up to 240 tool iterations to stop truly non-progressing loops rather than limiting wall-clock runtime. Knowledge-mining runs write private recovery checkpoints when the `source_coverage` and `candidate_knowledge` gates pass, and also attempt to preserve the current checkpoint on cancellation, an explicit deadline, or iteration exhaustion. Private checkpoints are never published to the canonical target. At final submission, knowledge-mining sets `allow_invalid_okf_output=true`, so a phase-three OKF conformance failure is committed with `validation_passed=false` and warnings; ordinary Compile remains strict.

The `direct` backend runs Compile `exec` commands with the Bot host's permissions. `bot.sandbox.backends.direct.allow_compile_exec` defaults to `true`: the Compile toolchain is open source, so `exec` runs directly in the user's shell by default, and ordinary Wiki and artifact generation run through file tools as before. A Skill that declares `requires.bins` or `requires.env` still probes the commands; set the option to `false` to omit `exec` from Compile (then such Skills fail with `SKILL_CAPABILITY_UNAVAILABLE` before any command probe runs). Isolated backends with filesystem and network policies are recommended for CLI-dependent Skills. Admission overflow returns `429 RESOURCE_EXHAUSTED`.

**Response Example**

The HTTP endpoint returns `202 Accepted`:

```json
{
  "status": "ok",
  "result": {
    "task_id": "cmp_01abc",
    "status": "accepted",
    "to": "viking://resources/research-wiki"
  }
}
```

### compile_history()

List Compile tasks visible to the current principal in reverse creation order. Each item contains its public task state and sanitized original request so clients can reconcile retries for a serial document window and associate windows that share the same `to` target. The default limit is 200, configurable up to 1000; terminal tasks are retained for 90 days by default.

```http
GET /bot/v1/compile?limit=200
```

### compile_status()

Get the current state and, for a terminal task, its result or error. A task is visible only to the principal that created it; a missing task and a task owned by another principal both return `404`.

**HTTP API**

```
GET /bot/v1/compile/{task_id}
```

```bash
curl http://localhost:1933/bot/v1/compile/cmp_01abc \
  -H "X-API-Key: your-key"
```

The CLI accepts the `cmp_...` task ID returned by Compile directly:

```bash
ov task status cmp_01abc
```

**Response Example**

```json
{
  "status": "ok",
  "result": {
    "task_id": "cmp_01abc",
    "status": "completed",
    "stage": "completed",
    "created_at": "2026-07-28T08:00:00Z",
    "updated_at": "2026-07-28T08:02:30Z",
    "result": {
      "from": ["viking://resources/research"],
      "to": "viking://resources/research-wiki",
      "skill": "viking://user/default/skills/research-compiler",
      "okf_version": "0.1",
      "created": ["viking://resources/research-wiki/Progress.md"],
      "updated": [],
      "unchanged": [],
      "page_count": 1,
      "link_count": 0,
      "validation_passed": true,
      "warnings": [],
      "main_view": {
        "root_path": "knowledge",
        "path_structure": ["page_role", "business_domain", "subdomain", "subject_path", "filename"],
        "page_roles": [
          {"id": "topic", "title": "TOPIC", "description": "Explanatory knowledge"}
        ],
        "business_domains": [
          {
            "id": "technology-data",
            "title": "Technology and data",
            "description": "Technical knowledge",
            "subdomains": [
              {"id": "engineering", "title": "Engineering", "description": "Engineering knowledge"}
            ]
          }
        ],
        "navigation": {"filename": "index.md", "type": "index"},
        "exempt_paths": ["**/index.md"]
      },
      "intermediate_artifacts": [
        {
          "kind": "evidence_ledger",
          "path": "_mining/evidence-ledger.json",
          "uri": "viking://resources/research-wiki/_mining/evidence-ledger.json"
        }
      ],
      "investigation_status": "clear",
      "source_coverage": {
        "uploaded": 30,
        "inspected": 30,
        "cited": 24,
        "merged": 4,
        "skipped": 2,
        "artifact_uri": "viking://resources/research-wiki/_mining/source-coverage.json"
      }
    }
  }
}
```

`main_view` describes the physical directory constraint and is `null` when unconfigured. Every knowledge page exists only in this main-view file tree. Navigation pages are described by `navigation`, and `exempt_paths` accepts safe `*`/`**` path patterns.

`intermediate_artifacts` lists the validated run manifest, evidence ledger, investigation report, source coverage, candidate knowledge, persisted read ledger, and evidence-history URIs. `source_coverage` summarizes upload-level inspected/cited/merged/skipped dispositions after the readlist and evidence gates pass. `investigation_status=issues_found` means unresolved conflicts or evidence gaps were retained for debugging; it does not open a human-question workflow.

`stage=salvaged` means an interrupted or failed strict Compile preserved a partial workspace snapshot. Its `result.validation_passed` is `false`; clients must present it as partial. A knowledge-mining run that reaches final submission but has OKF conformance warnings instead finishes with `stage=completed`, keeps `validation_passed=false`, and exposes the committed result.

### compile_cancel()

Request cooperative cancellation of a Compile task by task ID. The task first enters `cancelling`, then becomes `cancelled` after preserving an available private recovery checkpoint and completing cleanup. Canonical writes that already completed are not rolled back. Repeated cancellation of a `cancelled` task is idempotent; a missing task or a task owned by another principal returns `404`.

**CLI**

```bash
ov task cancel cmp_01abc
```

**HTTP API**

```http
POST /bot/v1/compile/{task_id}/cancel
```

```bash
curl -X POST http://localhost:1933/bot/v1/compile/cmp_01abc/cancel \
  -H "X-API-Key: your-key"
```

### compile_resume()

Create a new Compile task from a `failed`, `cancelled`, or `salvaged` task. The new task reuses the original task's persisted sanitized request and source URIs, so files do not need to be uploaded again. If a private checkpoint with the same source signature exists, execution continues after its latest completed phase; otherwise it restarts at source reading. The original task remains unchanged and the new task records it in `resumed_from_task_id`.

```http
POST /bot/v1/compile/{task_id}/resume
```

```bash
curl -X POST http://localhost:1933/bot/v1/compile/cmp_01abc/resume \
  -H "X-API-Key: your-key"
```

`checkpoint_available` in task status indicates that the server has a resumable checkpoint, while `checkpoint_stage` reports the latest completed gate. Checkpoints are private server state and never appear in the canonical knowledge base. A changed source list or content signature causes checkpoint restoration to fail with `409 CONFLICT`.

Task lifecycle values are:

| Status | Typical stages |
|--------|----------------|
| `accepted` | `queued` |
| `running` | `loading_skill`, `collecting_context`, `source_coverage`, `candidate_knowledge`, `page_generation`, `agent`, `rendering` |
| `committing` | `writing`, `refreshing`, `salvaging` |
| `cancelling` | Settling in-process work and resource cleanup |
| `completed` | `completed`, `salvaged` |
| `failed` | Stage where the failure occurred; the response contains `error.code` and `error.message` |
| `cancelled` | `cancelled` |

### feedback()

Submit explicit feedback for an existing assistant response.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | Yes | Session containing the target response |
| `response_id` | string | Yes | Target assistant response ID |
| `feedback_type` | string | Yes | `thumb_up`, `thumb_down`, or `rating` |
| `feedback_score` | number | Conditional | Required when `feedback_type=rating` |
| `feedback_reason` | string | No | Feedback reason label |
| `feedback_text` | string | No | Free-form feedback |
| `channel_id` | string | No | Multi-channel routing identifier |

**HTTP API**

```bash
curl -X POST http://localhost:1933/bot/v1/feedback \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "session_id":"session-id",
    "response_id":"response-id",
    "feedback_type":"thumb_up"
  }'
```

**Response Example**

```json
{
  "accepted": true,
  "response_id": "response-id",
  "session_id": "session-id",
  "feedback_type": "thumb_up",
  "feedback_delay_sec": 8.42,
  "timestamp": "2026-07-24T09:00:08"
}
```

A missing target response returns `404`. Rating feedback without `feedback_score` returns a request validation error.

## Client Scope

The standard OpenViking Python, TypeScript, and Go SDKs do not currently wrap the Bot proxy. Chat and Compile are available through the `ov` CLI and HTTP. The VikingBot Gateway also exposes Session and Channel APIs; see the [VikingBot documentation](https://github.com/volcengine/OpenViking/blob/main/bot/README.md#http-api).

## Related Documentation

- [VikingBot Concepts](../concepts/15-vikingbot.md) - architecture and interaction flow
- [VikingBot Guide](../guides/17-vikingbot.md) - setup and Chat workflow

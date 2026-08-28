# VikingBot API

OpenViking Server 启用 `--with-bot` 后，会在 `/bot/v1` 下代理 VikingBot 的核心交互接口。未启用 Bot 时，这些端点返回 `503`。

**代码入口**：

- `openviking/server/routers/bot.py` - OpenViking Server 代理与身份转发
- `bot/vikingbot/channels/openapi.py` - VikingBot Gateway 路由实现
- `bot/vikingbot/channels/openapi_models.py` - 请求、响应和 SSE 事件模型

## API 参考

### health()

检查 Bot Gateway 是否可用。

**HTTP API**

```bash
curl http://localhost:1933/bot/v1/health
```

**响应示例**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-07-24T09:00:00"
}
```

### chat()

发送文本和/或图片并等待完整回复。`session_id` 可省略；省略时 Gateway 会创建新会话。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `message` | string | 条件必填 | `""` | 用户文本；`images` 为空时必填 |
| `images` | array | 条件必填 | `[]` | 最多 4 个 OpenAI 风格的 `image_url`；`message` 为空时必填 |
| `session_id` | string | 否 | 自动生成 | 继续已有会话时传入 |
| `context` | array | 否 | `null` | 额外上下文消息，每项包含 `role` 和 `content` |
| `need_reply` | boolean | 否 | `true` | 是否需要 Bot 回复 |
| `disabled_tools` | string[] | 否 | `[]` | 本次请求禁用的工具名 |
| `channel_id` | string | 否 | `null` | 多 Channel 路由标识 |

**HTTP API**

```bash
curl -X POST http://localhost:1933/bot/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message":"总结我的项目进展","session_id":"optional-session-id"}'
```

图片可以使用模型可访问的 HTTPS URL，或内联 Base64 Data URL：

```bash
curl -X POST http://localhost:1933/bot/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "message": "描述这张图片",
    "images": [{
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/photo.png"
      }
    }]
  }'
```

内联 Base64 图片支持 JPEG、PNG、GIF 和 WebP，解码后单张最大 10 MiB；内联 SVG 和 MIME
签名不匹配的图片会被拒绝。对于 HTTPS URL，Gateway 只校验 URL 结构，不会下载或检查远程
资源，因此远程格式支持及相关错误由具体 provider 决定。本地文件路径仍会被拒绝。可选的
`detail` 支持 `auto`、`low`、`high`；为获得最好的模型兼容性，建议省略。

**CLI**

```bash
ov chat -m "总结我的项目进展"
```

**响应示例**

```json
{
  "session_id": "session-id",
  "response_id": "response-id",
  "message": "这是当前项目进展摘要……",
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

以 Server-Sent Events 返回推理、工具调用、增量内容和最终响应事件。请求字段与 `chat()` 相同；Gateway 会自动启用流式模式。

**HTTP API**

```bash
curl -N -X POST http://localhost:1933/bot/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"message":"分析当前知识库"}'
```

**CLI**

```bash
ov chat -m "分析当前知识库"
```

**SSE 响应示例**

每条消息使用 `data: <json>` 格式，响应头 `X-VikingBot-Session-ID` 包含本次会话 ID。

```text
data: {"event":"reasoning_delta","data":"正在检查知识库…","timestamp":"2026-07-24T09:00:00"}

data: {"event":"content_delta","data":"当前知识库包含","timestamp":"2026-07-24T09:00:01"}

data: {"event":"response","data":{"content":"当前知识库包含……","response_id":"response-id"},"timestamp":"2026-07-24T09:00:02"}
```

`event` 可能为 `reasoning`、`reasoning_delta`、`tool_call`、`tool_result`、`content_delta`、`iteration` 或 `response`。

### compile()

启动一个异步、由 Skill 驱动的 Compile 任务。VikingBot 会加载指定 Skill，使用当前认证用户身份读取来源目录，在任务独立的 AgentLoop 中执行，并将通过校验的产物提交到目标 URI 下。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `from` | string[] | 是 | - | 一个或多个来源目录 |
| `to` | string | 是 | - | 目标 Resource 或 Memory 目录，或受支持的 Skill namespace |
| `skill` | string | 是 | - | Skill 目录或其 `SKILL.md` URI |
| `okf_config` | string | 否 | - | 外部 OKF YAML 配置文件 URI；Resource Wiki 提交会据此校验 frontmatter、目录类型与 WikiLink |
| `reason` | string | 否 | Skill 驱动的默认值 | 本次 Compile 的补充指令 |
| `runtime_timeout_seconds` | number | 否 | 无 | 可选的正数运行时限；不传时任务没有服务端硬截止时间。若服务端管理员配置了最大时限，本字段不得超过该值 |

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
    "reason": "追踪历史进展，并保留支撑证据。"
  }'
```

**CLI**

```bash
ov compile \
  --from viking://resources/research \
  --to viking://resources/research-wiki \
  --skill viking://user/default/skills/research-compiler \
  --okf-config viking://resources/research/OKF_CONFIG.yaml \
  --reason "追踪历史进展，并保留支撑证据。" \
  --wait
```

`--okf-config` 指向 OpenViking 中可读的 YAML 文件。VikingBot 会将其物化为任务工作区的 `compile_config/OKF_CONFIG.yaml`，并把它作为控制数据而非知识来源；外部契约优先于 Skill 中冲突的格式规则。未提供时保持现有 Compile 行为。

`--wait` 会轮询状态接口，直到任务进入终态。`--timeout` 只限制本地等待时间，不会取消服务端任务。默认不设置服务端硬运行时限；只有显式传入 `--runtime-timeout`，或管理员配置了服务端最大运行时限时，任务才会因运行时限终止。超过管理员上限的请求会以 `429 RESOURCE_EXHAUSTED` 拒绝。Compile 的工具轮次上限现为 240，用于阻止无进展的无限循环，而不是墙钟超时。知识挖掘的 `source_coverage` 和 `candidate_knowledge` 门禁通过时会各自写入私有恢复检查点；任务被取消、显式超时或耗尽轮次时也会尽力保存当前检查点，但不会把未通过最终校验的半成品写入正式目标。

`direct` backend 会以 Bot 宿主机权限执行 Compile 的 `exec` 命令。`bot.sandbox.backends.direct.allow_compile_exec` 默认为 `true`：Compile 工具链开源，`exec` 默认直接以用户 shell 权限运行，普通 Wiki 和产物文件整理仍通过文件工具运行。声明了 `requires.bins` 或 `requires.env` 的 Skill 仍会先探测命令；将该选项设为 `false` 时 Compile 不会暴露 `exec`，此类 Skill 会在执行任何命令探测前以 `SKILL_CAPABILITY_UNAVAILABLE` 失败。依赖 CLI 的 Skill 推荐使用具备文件系统和网络策略的隔离 backend。超过 admission 上限时返回 `429 RESOURCE_EXHAUSTED`。

**响应示例**

HTTP 接口返回 `202 Accepted`：

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

列出当前 principal 可见的 Compile 任务，按创建时间倒序返回。响应包含公开任务状态及已净化的原始请求，便于客户端把同一 `to` 目标的文档、Memory 和人工补证任务组合成一条挖掘历史。默认最多返回 200 条，可通过 `limit` 调整到 1000；终态任务默认保留 90 天。

```http
GET /bot/v1/compile?limit=200
```

### compile_status()

获取任务当前状态；任务进入终态后还会返回结果或错误。任务仅对创建它的 principal 可见；任务不存在或属于其他 principal 时均返回 `404`。

**HTTP API**

```
GET /bot/v1/compile/{task_id}
```

```bash
curl http://localhost:1933/bot/v1/compile/cmp_01abc \
  -H "X-API-Key: your-key"
```

CLI 可直接使用 Compile 返回的 `cmp_...` task ID：

```bash
ov task status cmp_01abc
```

**响应示例**

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
        "single_source_of_truth": true,
        "root_path": "knowledge",
        "facet_categories": ["what", "why", "how"],
        "path_structure": ["facet", "meta_id", "filename"],
        "exempt_paths": ["index.md"]
      },
      "intermediate_artifacts": [
        {
          "kind": "evidence_ledger",
          "path": "_mining/evidence-ledger.json",
          "uri": "viking://resources/research-wiki/_mining/evidence-ledger.json"
        }
      ],
      "investigation_status": "clear",
      "question_count": 0,
      "source_coverage": {
        "uploaded": 30,
        "inspected": 30,
        "cited": 24,
        "merged": 4,
        "skipped": 2,
        "artifact_uri": "viking://resources/research-wiki/_mining/source-coverage.json"
      },
      "views": [
        {
          "id": "domain",
          "title": "知识域 · Domain",
          "description": "按知识域组织页面",
          "selection": "one_or_more",
          "groups": [
            {
              "id": "products-and-systems",
              "title": "产品与系统",
              "description": "产品、服务和技术系统",
              "tag": "view/domain/products-and-systems"
            }
          ]
        }
      ]
    }
  }
}
```

`main_view` 描述唯一事实源的物理目录约束；未配置时为 `null`。`views` 来自外部 OKF 配置；未配置派生视图时为空数组。客户端可按每个 group 的精确 `tag` 读取页面 frontmatter 并重组导航，实际文件结构仍由 `to` 目录表示。

`intermediate_artifacts` 给出经过校验的运行清单、证据账本、调查报告、问卷、来源覆盖、候选知识、持久阅读账本和证据历史 URI。`source_coverage` 汇总通过真实 readlist 与证据门禁后的上传级来源已检查、已引用、已合并和已跳过数量。`investigation_status=needs_human_input` 表示存在未解决的冲突或证据缺口，`question_count` 给出问卷问题数。使用人工答案发起后续 Compile 时，应让 `from` 精确指向答案资源并保持同一个 `to`，以保留可验证的增量谱系。

`stage=salvaged` 表示保留了阶段性工作区快照，而不是严格校验成功。此时 `result.validation_passed=false`；结果仍会返回已知 `main_view`、`views` 和可读取的 `intermediate_artifacts`，但客户端必须显示为“部分结果”，且不得自动以它作为下一轮 Memory 或人工答案增量 Compile 的成功基线。只有 `stage=completed` 且 `validation_passed=true` 才是可继续自动增量的最终结果。

### compile_cancel()

按 task ID 请求协作式停止 Compile 任务。任务会先进入 `cancelling`，在保存可用的私有恢复检查点并完成清理后进入 `cancelled`；已经完成的正式写入不会回滚。重复取消已经 `cancelled` 的任务是幂等的，任务不存在或属于其他 principal 时返回 `404`。

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

为一个 `failed`、`cancelled` 或未通过最终校验的 `salvaged` 任务创建新的 Compile 任务。新任务复用原任务已经净化并持久化的请求和来源 URI，因此无需重新上传文件；如果原任务有相同来源签名的私有检查点，则从最近完成的阶段继续，否则从来源读取阶段重新执行。原任务保持不变，新任务通过 `resumed_from_task_id` 记录来源任务。

```http
POST /bot/v1/compile/{task_id}/resume
```

```bash
curl -X POST http://localhost:1933/bot/v1/compile/cmp_01abc/resume \
  -H "X-API-Key: your-key"
```

任务状态中的 `checkpoint_available` 表示服务端已保存可恢复检查点，`checkpoint_stage` 表示最近完成的门禁阶段。检查点属于服务端私有状态，不会出现在正式知识库中；恢复时若来源清单或内容签名不一致，任务会以 `409 CONFLICT` 拒绝使用旧检查点。

任务生命周期如下：

| Status | 常见 Stage |
|--------|------------|
| `accepted` | `queued` |
| `running` | `loading_skill`、`collecting_context`、`source_coverage`、`candidate_knowledge`、`page_generation`、`agent`、`rendering` |
| `committing` | `writing`、`refreshing`、`salvaging` |
| `cancelling` | 收敛当前进程内工作和清理资源 |
| `completed` | `completed`、`salvaged` |
| `failed` | 失败发生时的 Stage；响应包含 `error.code` 和 `error.message` |
| `cancelled` | `cancelled` |

### feedback()

对已经生成的回复提交显式反馈。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 产生目标回复的会话 ID |
| `response_id` | string | 是 | 目标助手回复 ID |
| `feedback_type` | string | 是 | `thumb_up`、`thumb_down` 或 `rating` |
| `feedback_score` | number | 条件必填 | `feedback_type=rating` 时必须提供 |
| `feedback_reason` | string | 否 | 反馈原因标签 |
| `feedback_text` | string | 否 | 自由文本反馈 |
| `channel_id` | string | 否 | 多 Channel 路由标识 |

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

**响应示例**

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

目标回复不存在时返回 `404`；`rating` 缺少 `feedback_score` 时返回请求校验错误。

## 客户端范围

标准 OpenViking Python、TypeScript 和 Go SDK 当前不封装 Bot 代理接口；Chat 和 Compile 可通过 `ov` CLI 与 HTTP 使用。VikingBot Gateway 自身还提供 Session 和 Channel API，详见 [VikingBot 文档](https://github.com/volcengine/OpenViking/blob/main/bot/README_CN.md#http-api)。

## 相关文档

- [VikingBot 概念](../concepts/15-vikingbot.md) - 架构和交互流程
- [VikingBot 指标验证](../guides/12-vikingbot-metrics-validation.md) - Chat、Feedback 和指标链路

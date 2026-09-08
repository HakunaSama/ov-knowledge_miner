# Studio 知识挖掘

Web Studio 的“知识挖掘”页面把文件导入、`llm-wiki` Skill 和 VikingBot Compile 串成一个可视化工作流。用户可以一次选择整个资源文件夹，填写本次挖掘目标，查看长程任务进度，并在最终完成前处理 VikingBot 发现的证据冲突或缺口。

## 前置条件

知识挖掘依赖 VikingBot。启动本地服务时需要启用 Bot：

```bash
openviking-server --with-bot
```

然后打开 `http://localhost:1933/studio/knowledge-mining`。远程服务还需要在 Studio 的“连接设置”中配置 API Key 和正确的用户身份。

服务必须已经配置可用的 VLM、Embedding 和 VikingBot LLM。可以先运行以下命令检查基础配置：

```bash
openviking-server doctor
curl http://localhost:1933/bot/v1/health
```

## 使用流程

1. 在“知识挖掘”页面选择文件，或一次选择包含 `documents/` 与 `team-memory/` 的完整资源文件夹。页面会递归分类子目录。支持 `.pdf`、`.md`、`.markdown`、`.doc`、`.docx`、`.xls` 和 `.xlsx`；文件总数不限，单文件上限 512 MiB。
2. 可选上传团队 Memory 文件（`.md`、`.txt`、`.json`、`.yaml`、`.yml`）。它们会进入独立来源目录，不会混入首轮文档 Compile。
3. “OKF 格式配置”默认使用 `llm-wiki/OKF_CONFIG.yaml`；也可以选择自定义 `.yaml`/`.yml`，严格指定必需 frontmatter、`main_view.path_structure`、facet、目录类型映射、派生视图和 WikiLink 规则。配置外目录或 `view/...` 分组会被提交器拒绝。
4. 在“挖掘目标”中说明问题、受众、时间范围、输出语言和侧重点。这段内容会作为 Compile 的 `reason`。
5. 设置串行窗口。默认每窗最多 10 份文件、200 MiB 原文件、1,500 个 PDF 实际页和 300 个预计必读探针，任一预算先达到就切窗。单文件自身超过窗口预算、但仍不超过 512 MiB 单文件硬上限时会独占一窗，不会被客户端物理拆 PDF。
6. 点击“开始知识挖掘”。同一运行的所有窗口使用隔离的来源目录并固定指向同一个 `wiki` 目标。系统严格执行“上传当前窗 → Compile 当前窗 → 当前窗完成 → 上传下一窗”；首窗创建主知识库，后续文档窗和 Memory 窗都是增量更新。
7. 页面顶部的“挖掘历史”会列出当前 principal 最近 90 天内的历史、运行中窗口和排队位置；点击任一窗口即可用同一套完整界面查看目录、覆盖账本、中间产物、调查问卷和知识点阵。每个终态窗口都会留下日志；运行中的 Compile 可以协作式取消，失败或已取消的任务只有在队列空闲时才能从检查点恢复。
8. 主视图以可展开目录树展示真实知识文件。默认物理结构严格是 `knowledge/<facet>/<meta_id>/<filename>`，what、why、how 位于顶层 facet，而不是文件的末级父目录；一个元知识仍由共享同一 `meta_id` 的三页构成。根 `index.md` 只是导航，不计入知识文件，旧版结果仍会按 `meta_id` 显示兼容目录。
9. 主视图、知识域和使用场景始终展示同一批文件且总数一致。“知识域”表示整个元知识的一个主要主题归属，“使用场景”表示它的一个主要用途；两者只重组整组三页，不复制或拆散文件。“中间产物”用于审计证据链，“人工调查”是最终完成前的补证门禁。
10. “知识点阵”直接复用 `examples/compile/graph-show/knowledge-graph/knowledge_graph.py` 中的官方 KG Explorer HTML/CSS/D3 渲染器；Studio 只负责把元知识、what/why/how、WikiLink、跨知识引用和证据链适配为官方 `nodes` / `links` 数据。保留类型筛选、关系图例、检索、邻居聚焦、平移缩放和实体检查器。
11. “来源覆盖”逐项展示已上传、已检查、已引用、已合并和已跳过的材料及原因。缺失来源、未实际读取、无理由跳过或引用与证据账本不一致都会拒绝提交，让 VikingBot 继续处理。
12. 最后一个窗口发现来源冲突或证据缺口时，Studio 会切换到“等待人工知识补证”，展示阶段性知识与问卷。提交答案后，答案作为新的 `human-answer` 来源触发同目标增量 Compile；只有问题处理完成后才进入“已完成”。

## 使用 CLI 一键上传并开始挖掘

`ov knowledge-mining` 把知识源准备和“开始知识挖掘”封装成一个非交互命令。它会自动创建隔离批次目录、上传并解析本地文档或直接引用已有 OpenViking 文件夹、写入 OKF 配置、找到或安装 `llm-wiki` Skill，然后启动文档 Compile：

```bash
ov knowledge-mining \
  --documents ./resources/documents \
  --reason "提炼产品、流程和风险知识，并保留出处" \
  --wait
```

同时上传团队 Memory 并在首轮成功后自动增量更新同一个知识库：

```bash
ov knowledge-mining \
  --documents ./resources/documents \
  --memory ./resources/team-memory \
  --okf-config ./OKF_CONFIG.yaml \
  --to viking://resources/enterprise-wiki \
  --wait \
  --timeout 7200
```

参数说明：

- `--documents` 必填，可传本地文件/目录或 `viking://` 文件夹，也可重复传入；本地目录会递归查找支持的文档格式，OpenViking 文件夹不会重复上传。
- `--memory` 可选，可传文件或目录。由于 Memory 必须等待文档阶段完成后才能增量执行，因此它必须和 `--wait` 一起使用。
- `--okf-config` 接收本地 YAML 文件；省略时使用随 CLI 编译的默认配置。
- `--skill` 可指定已有 Skill URI；省略时优先使用当前身份可见的用户级 `llm-wiki`，找不到时自动安装内置版本。
- `--to` 可固定知识库目标；省略时自动使用本批次的 `wiki/` 目录。
- `--window-files`、`--window-bytes`、`--window-pages` 和 `--window-probes` 分别控制每窗文件数（默认 10）、原文件字节（默认 200 MiB）、PDF 实际页数（默认 1500）与预计必读探针（默认 300）。多窗口完整流程必须使用 `--wait`。
- `knowledge-mining` CLI 将最终 OKF 一致性校验作为非阻断告警：目录、frontmatter、来源或 WikiLink 不符合 OKFConfig 时仍会写入当前 checkout，并在任务结果与窗口日志中记录 `validation_passed: false` 和告警。路径安全、文件数量、输出大小及前两个挖掘阶段的门禁仍然生效。普通 `ov compile` 保持严格校验。
- `--state-file` 可指定本地原子 JSON 检查点；省略时写到 `.openviking/knowledge-mining/<batch-id>.json`。中断后运行 `ov knowledge-mining --resume-state <file>`，无需再次提供 `--documents`，会跳过已完成窗口和已确认上传的文件，并恢复运行中、失败或部分成功的窗口。
- 不传 `--wait` 只适用于单窗口；命令启动任务后返回 `task_ids`、`state_file` 和 `run_log_uri`。
- 加 `-o json` 可获得便于脚本消费的批次 URI、来源 URI、任务 ID、阶段和最终 Compile 结果。
- CLI 当前不启用人工补充门禁：即使调查报告生成了问卷或标记为 `needs_human_input`，顶层 `phase` 仍返回 `completed`，不会出现 `awaiting_human`，也不会自动提交人工答案。调查报告和问卷仍保留在结果中用于审计。

该命令不复制挖掘算法，而是依次复用公开接口：`POST /api/v1/resources/temp_upload`、`POST /api/v1/resources`、`POST /api/v1/content/write` 和 `POST /bot/v1/compile`。因此网页、原有 `ov compile` 与此命令最终走的是同一套服务端解析、Compile 和校验逻辑。

## 展示 CLI 挖掘结果

Studio 的“导入并展示 CLI 挖掘结果”区域复用与网页挖掘完全相同的主视图、派生视图、来源覆盖、中间产物、调查问卷和知识点阵渲染器，不会再次运行 VikingBot。支持三种接入方式：

1. **同一服务自动发现**：只要 CLI 和 Studio 连接的是同一 OpenViking 服务与身份，页面就会从 Compile 历史中识别使用 `llm-wiki` 的任务。即使 `to` 不在 `viking://resources/knowledge-mining/` 下，也会自动进入“挖掘历史”，并标记为“CLI 结果”。
2. **挂载已有结果 URI**：当 Compile 历史已经过期但目标目录仍存在时，输入 CLI 命令中的 `--to` URI。Studio 会递归检查 `index.md`、知识页面和 `_mining/` 产物，从运行清单、覆盖账本、调查报告、问卷、目录结构与页面 tags 重建展示元数据。
3. **上传 OVPack**：跨服务展示时，在原 CLI 环境导出结果目录，然后在 Studio 上传生成的文件：

```bash
ov export viking://resources/research-wiki ./research-wiki.ovpack
```

Studio 使用官方 OVPack 导入接口校验 manifest、文件集合与 checksum，并把结果写到独立的 `viking://resources/knowledge-mining-imports/<batch-id>/...` 目录，避免覆盖当前知识库。导入完成后会立即加入挖掘历史并打开结果视图。OVPack 中没有 Compile 响应元数据时，页面会从知识目录和中间账本确定页面数量、What/Why/How 结构、来源覆盖、人工门禁和派生视图。

导入结果默认是审阅模式：问卷仍会完整显示，但 Studio 不会使用推断的来源或 Skill 配置擅自发起人工增量 Compile。如需继续挖掘，应在原 CLI 环境中以新证据作为 `from`，保持同一个 `to` URI 执行增量 Compile。

## 数据与执行模型

每次运行会创建一个隔离目录：

```text
viking://resources/knowledge-mining/<batch-id>/
├── OKF_CONFIG.yaml
├── windows/
│   ├── 0001/document-sources/
│   ├── 0002/document-sources/
│   └── 0003/team-memory/
├── logs/
│   ├── run.json
│   └── windows/0001.json
└── wiki/                # llm-wiki 编译产物
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

页面使用 OpenViking 已有的临时上传和 `add_resource` 接口解析文件，并等待语义处理完成。随后它调用：

```http
POST /bot/v1/compile
```

每个终态窗口都会写入 `logs/windows/NNNN.json`，聚合运行状态写入 `logs/run.json`。已经上传或已经启动 Compile 的窗口可以从服务端历史与日志恢复。浏览器安全模型不允许刷新后重新读取尚未上传的本地 `File`，因此如果刷新发生在后续窗口上传之前，Studio 会把该窗明确标记为失败；需要无人值守、可跨进程续跑的大批量任务时应使用 CLI 的 `--state-file` / `--resume-state`。

首轮请求中的 `from` 指向 `document-sources`，`to` 指向 `wiki`。如果存在团队 Memory，第二轮请求严格使用 `from=team-memory`、`to=wiki`；VikingBot 会先读取现有目标，再把新增证据合并到规范页面中。增量提交允许保留首轮页面已有的文档出处，同时要求新 Memory 出处仍来自第二轮 supplied source。

`skill` 指向当前用户或共享空间中的 `llm-wiki` Skill，`okf_config` 指向本批次写入的 `OKF_CONFIG.yaml`。VikingBot 将配置物化为 `compile_config/OKF_CONFIG.yaml` 并优先执行；提交器会确定性校验 frontmatter、`main_view.path_structure` 的准确层数与顺序、facet 值、`meta_id` 目录、配置声明的全部派生视图标签、原始来源与中间证据的双重谱系、跨库引用、WikiLink，以及八类中间产物的结构和一致性。模型增加任意 topic/domain/misc 目录、改变 facet 位置、发明视图命名空间或使用未声明 group 都会失败；知识阅读、归纳和页面写作仍在 VikingBot 的任务独立 AgentLoop 中执行。

Studio 启动 Compile 时不再提交一小时运行时限，服务端默认也没有墙钟硬截止时间。三阶段门禁会在服务端私有目录保存可恢复检查点：通过来源覆盖后保存一次，通过候选知识后再保存一次；协作式取消也会尽力保存当前工作区。恢复接口复用原任务的来源 URI 和净化请求，并校验来源签名后恢复 checkout、阅读账本与阶段状态。检查点在最终提交通过前不会写入 `wiki/` 正式目标，因此中断恢复不会暴露半成品知识库。

## 主视图与派生视图

主视图永远对应 `wiki/` 中的实际文件，也是唯一事实源。除 `index.md` 外，默认契约的精确 `path_structure` 是 `facet/meta_id/filename`，所以页面位于 `knowledge/what|why|how/<meta_id>/*.md`；what/why/how 不再被代码硬编码为末级目录，它们的位置和可选值分别由 `path_structure` 与 `facet_categories` 决定。每个元知识必须有且仅有一个 what、一个 why 和一个 how 页面并共享稳定的 `meta_id`。提交器会拒绝额外或缺失层级、顺序错误、未知 facet、meta_id 不匹配、缺页、同一 facet 多页或三页视图标签不一致的结果。

派生视图不会复制或移动页面，而是读取每个元知识三页一致的 namespaced tags。`index.md` 不进入派生视图；每个默认视图使用 `selection: exactly_one`，因此主视图、知识域和使用场景中的知识文件集合及总数严格一致。默认契约内置：

- `domain`：元知识的主要主题归属——人员与组织、产品与系统、流程与方法、决策与洞察；
- `usage`：新人入门、规划与决策、执行与协作、排障与风险、参考查询。

自定义 OKF 可以在 `views` 中定义其他分组。每个视图声明 `tag_prefix`、`selection` 和 `groups`；提交器要求每个非豁免知识页至少选择一个有效 group tag，`selection: exactly_one` 时必须恰好一个，并拒绝所有未声明的 `view/...` 命名空间与 group。界面只根据这些已验证配置生成视图分支，不接受模型自定义目录。

## 谱系、跨库引用与人工确认

每个知识页的 `sources` 必须同时包含至少一个输入来源（`original`、`team-memory` 或 `human-answer`）和一个配置声明的 `intermediate` 来源。`_mining/evidence-ledger.json` 还必须逐页列出输入 URI、中间产物 URI 和关键声明，因此可以从最终知识回溯到上传文档及处理过程。

PDF 的解析片段不会变成互不相关的“原始文件”。知识挖掘上传 PDF 时会在该文档资源的 `.source/` 下保存原始二进制文件和 `provenance.json`；后者记录 `original_uri`、真实文件名、大小和 SHA-256 `document_id`。Compile 只读取小型 provenance sidecar 与派生 Markdown 证据，不把大 PDF 下载进 Agent 沙箱；最终 `kind: original` 的来源 URI 指回原 PDF，页码位置继续来自派生证据中的 PDF page marker。

`_mining/source-coverage.json` 以用户上传级文档为单位，而不是把解析后的 chunk 当成独立来源。每个来源必须标记为 `cited`、`merged` 或 `skipped`；小文档的全部片段、大文档自适应且确定性的首/中/尾探针都必须出现在平台生成的 `readlist.json` 中，`cited` 必须指向证据账本中的有效页面，`merged` 必须指向另一个直接引用来源，`skipped` 必须给出不可跨来源复制的具体理由。`candidate-knowledge.json` 是最终页面之前的强制候选检查点，逐项解释候选为何晋升、合并、延后或拒绝；平台不会为缺失来源伪造 rejected 候选。增量 Compile 会合并旧证据并追加 `evidence-history.json` 快照。

知识挖掘采用平台强制的三阶段门禁，顺序固定为 `source_coverage` → `candidate_knowledge` → `page_generation`。第一阶段必须读完本轮每份上传文档的必读探针、完整写入覆盖账本并调用 `submit_source_coverage`；在它通过前不能创建候选账本或修改最终页面。第二阶段必须让候选账本覆盖每份上传文档并调用 `submit_candidate_knowledge`；在它通过前仍不能创建或修改最终页面。只有两个检查点都通过后，`submit_wiki_bundle` 才会解锁。检查点会将任务开始时的目标 checkout 作为基线，因此增量任务可保留未改动的旧页面，但不能把本轮页面生成伪装成旧内容来绕过顺序。

同库页面使用 `[[WikiLink]]`。跨知识库关系是正文位置级的多对多关系：同一页面的不同段落可以引用不同知识目标，同一目标也可以被多个页面引用。每个 `knowledge_links` 条目除目标 `viking://` URI、标题、关系和方向外，还必须包含正文中的原文 `context`，并在该正文位置放置可读 Markdown 链接；提交器会确定性校验两者。只有目标库也保存了镜像关系时才使用 `bidirectional`；否则保存为 `outgoing`，并把缺少反向关系记录为证据缺口。

调查报告的状态为 `clear` 或 `needs_human_input`。存在冲突/缺口时，每个 issue 必须由至少一个问卷问题覆盖，否则提交会失败。`needs_human_input` 会让 Studio 暂停在补证门禁，而不是显示为最终完成。人工答案不是直接修改页面：它先被保存为新来源，再通过同一 `to` 目录的增量 Compile 更新主视图、证据账本和报告。

平台会以受节点总数限制的深层递归 inventory 物化完整目标树，而不是使用服务端默认的三层 tree 深度。提交前会持久化运行清单、逐文档 readlist、证据历史并合并已有目标 checkout；逐页账本可依据最终页面谱系校正，但来源覆盖和候选知识必须由本轮真实决策支持，不能用通用跳过记录补齐。因此第二阶段省略旧页面或覆盖旧账本时仍不能删除第一阶段知识与审计历史；旧版本生成的通用 skipped/candidate 占位会被清除。严格校验仍失败时，任务会进入 `salvaged` 并返回 `validation_passed=false` 的可检查阶段性结果；Studio 不会自动开始后续 Memory/人工答案阶段。

页面使用仓库自带、带版本标记的 `examples/compile/ov-compile-skills/llm-wiki/SKILL.md`。当前身份没有用户级 Skill 时会自动安装；发现由旧版知识挖掘页面安装的版本时会升级，使新的目录、引用与人工补证规则对后续任务生效。

## 常见问题

- **提示无法连接 VikingBot**：确认服务使用 `--with-bot` 启动，并检查 `/bot/v1/health`。
- **文件解析失败**：在任务中心查看对应的 `add_resource` 任务，并检查 VLM/Embedding 配置和文件大小。
- **Compile 在 `loading_skill` 失败**：在“技能”页面确认 `llm-wiki` 可见，且 `SKILL.md` 格式有效。
- **Compile 在 `agent` 阶段失败**：检查 VikingBot LLM 的凭证、额度、上下文窗口和服务日志。
- **任务显示 `SALVAGED · 未通过校验` 标签**：任务进入了 `salvaged`；这些页面和中间产物可用于排查，但没有通过完整契约校验，也不会触发下一轮自动增量。查看任务 warning 和 `_mining/` 产物后重新运行。
- **结果页暂时读不到**：Compile 的 `writing`/`refreshing` 阶段尚未结束；等待任务进入 `completed` 后再读取目标目录。

相关资料：[上下文编译概览](./01-overview.md) · [LLM Wiki 示例](./02-llm-wiki.md) · [VikingBot API](../api/24-vikingbot.md)

# 知识挖掘完整运行流程报告

本文说明当前知识挖掘页面在 `POST /bot/v1/compile` 之外做了什么，以及一次完整挖掘到底怎样运行。内容以当前代码为准，不把界面上的进度文案当作真实执行逻辑。

## 一句话结论

知识挖掘不是“上传文件后只调用一次 `ov compile`”。它是一个由 Studio 负责调度、由 Compile/VikingBot 负责挖掘、再由 Studio 负责解释和展示结果的长流程。

最重要的几个事实是：

1. 一个新的文档挖掘任务至少调用一次 Compile。
2. 如果有团队 Memory，会在文档 Compile 成功后再调用一次 Compile，增量更新同一个知识库。
3. 如果发现证据冲突或缺口，用户每提交一轮问卷答案，又会增加一次 Compile。
4. 每个 Compile 任务只启动一个连续的 VikingBot AgentLoop，不会因为 Skill 有多个阶段就启动多个 Agent。
5. 在一个新 Compile 请求中，服务端会两次读取并解析 Skill：第一次是请求准入校验，第二次是执行时真正装载到任务工作区。真正参与模型挖掘的执行只有一次。
6. 一个 Compile 内部由平台强制执行三个挖掘门禁：来源覆盖、候选知识、页面生成。页面生成之后还有确定性校验与正式写入；如果把它也算成业务步骤，就可以通俗地称为“四步”，但第四步不是再次调用 Skill。

## 先分清四个容易混淆的概念

### Studio 工作流

指用户在知识挖掘页面创建的一整批任务。它可能包含文档 Compile、Memory Compile 和一轮或多轮人工补证 Compile。

主要代码：

```text
web-studio/src/routes/knowledge-mining/route.tsx
web-studio/src/routes/knowledge-mining/-lib/workflow.ts
web-studio/src/routes/knowledge-mining/-lib/queue.ts
web-studio/src/routes/knowledge-mining/-lib/history.ts
```

### Compile 任务

指一次 `POST /bot/v1/compile` 创建的服务端任务。它只有一个 `from`、一个 `to`、一个 Skill 和一个 OKF 配置。

主要代码：

```text
bot/vikingbot/compile/router.py
bot/vikingbot/compile/service.py
bot/vikingbot/compile/models.py
bot/vikingbot/compile/store.py
```

### Skill

`llm-wiki/SKILL.md` 是给 VikingBot 的完整知识挖掘方法和规则。它不是一个被依次调用四次的函数，而是一份在整个 AgentLoop 中持续生效的任务说明。

主要文件：

```text
examples/compile/ov-compile-skills/llm-wiki/SKILL.md
examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml
```

### 模型调用

一个 Compile 任务不等于只请求模型一次。执行前有一次很小的语言判断调用；随后一个 AgentLoop 会根据读文件、写文件和校验结果多轮调用模型，最多允许 240 个工具循环轮次。Skill 始终作为这一任务的系统上下文生效。

主要代码：

```text
bot/vikingbot/compile/service.py
bot/vikingbot/agent/loop.py
```

## Skill 到底调用几次

### 从业务执行角度看

每个 Compile 任务真正执行一次完整 Skill，对应一个独立 AgentLoop。

| 一次 Studio 工作流包含的内容 | Compile 任务数 | Skill 的实际执行次数 |
| --- | ---: | ---: |
| 只有文档，没有待人工处理问题 | 1 | 1 |
| 文档 + 团队 Memory | 2 | 2 |
| 文档 + 一轮人工补证 | 2 | 2 |
| 文档 + 团队 Memory + 一轮人工补证 | 3 | 3 |
| 每增加一轮人工补证 | +1 | +1 |
| 每恢复一次失败或取消的任务 | +1 个新 Compile 任务 | +1 |

可以用下面的公式理解：

```text
完整工作流的 Skill 执行次数
= 1 次文档 Compile
+（有团队 Memory ? 1 : 0）
+ 人工补证轮数
+ 恢复或重试次数
```

### 从代码读取角度看

每个全新的 Compile 请求会读取 Skill 两次：

1. `_normalize_request()` 中读取并解析一次，用于确认 Skill URI、目录和 `SKILL.md` 合法。
2. `_execute_task()` 中再读取并解析一次，然后把 Skill 物化到本次隔离工作区，真正交给 AgentLoop。

这两次读取不等于模型执行了两次 Skill。第一遍只是服务端准入检查。

恢复任务复用已经净化过的旧请求，不再走完整的 `_normalize_request()`，执行阶段仍会装载一次 Skill。

### 三阶段还是四阶段

当前平台代码明确写的是三个强制阶段：

1. `source_coverage`：逐文档读取与来源覆盖。
2. `candidate_knowledge`：形成候选知识并决定晋升、合并、延后或拒绝。
3. `page_generation`：生成或修改正式页面与其余证据产物。

随后还有：

4. 确定性校验、合并历史、正式写入 OpenViking。

所以“Skill 分四阶段”如果是为了方便理解，可以这样说；但代码层面只有前三个属于同一个 Agent 按 Skill 执行的挖掘阶段。第四步主要是 Python 校验器和 OpenViking 写入代码，不是第四次调用 Skill。

此外，`documents`、`memory_incremental`、`human_incremental` 是三种证据进入知识库的运行批次，不是一个 Compile 内的三个子 Agent。

## 在 Compile 接口之外额外做了什么

### 调用 Compile 之前

#### 1. 创建互相隔离的任务目录

Studio 为每批任务生成独立 URI：

```text
viking://resources/knowledge-mining/<batch-id>/
├── document-sources/
├── team-memory/
└── wiki/
```

这样第二批上传不会混入第一批。代码在：

```text
web-studio/src/routes/knowledge-mining/route.tsx
```

#### 2. 检查 VikingBot 是否可用

页面在开始时请求 `/bot/v1/health`。如果 Bot 没有启动，就不会创建 Compile。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/api.ts
```

#### 3. 自动安装或升级 llm-wiki Skill

Studio 会列出当前可见 Skill，优先使用用户空间的 `llm-wiki`。如果不存在就安装；如果版本标记不是当前的 `4.6`，就用仓库自带版本更新。

这一步只是准备 Skill，不执行知识挖掘。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/api.ts
examples/compile/ov-compile-skills/llm-wiki/SKILL.md
```

#### 4. 写入本次 OKF 配置

Studio 把默认或用户选择的 `OKF_CONFIG.yaml` 写入本批次来源目录，再把它的 URI 作为 `okf_config` 传给 Compile。

目录结构、facet、meta_id、派生视图和 frontmatter 规则由这个配置决定。当前默认配置里有 what/why/how，是因为默认 YAML 这样配置，而不是前端或 Skill 把它们写死。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/api.ts
examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml
bot/vikingbot/compile/okf_config.py
```

#### 5. 在前端维护串行队列

用户可以继续创建新任务，但 Studio 一次只启动一个完整工作流。当前任务处于文档、Memory、人工补证或等待人工状态时，后面的任务继续排队。

这个队列是 Studio 在 Compile 之外增加的业务调度。尚未提交到服务端的排队项保存在浏览器历史中；已经提交的 Compile 由服务端独立运行。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/queue.ts
web-studio/src/routes/knowledge-mining/route.tsx
```

### 一次 Compile 完成以后

#### 6. 自动决定是否启动 Memory 增量 Compile

首轮文档 Compile 成功后，如果这批任务有团队 Memory，Studio 自动创建第二个 Compile：

```text
from = 本批次 team-memory 目录
to   = 首轮同一个 wiki 目录
```

第二轮不是重新生成另一套知识库，而是在同一目标 checkout 上合并、修订和补充。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/workflow.ts
web-studio/src/routes/knowledge-mining/-lib/api.ts
web-studio/src/routes/knowledge-mining/route.tsx
```

#### 7. 自动进入人工补证闭环

如果 Compile 结果的 `investigation_status` 是 `needs_human_input`，并且问卷有问题，Studio 不把流程标记为最终完成，而是切到“等待人工知识补证”。

用户提交答案后，前端把答案生成一个新的 Markdown 证据文件，再用同一个 Skill、同一个 OKF 配置和同一个 `to` 创建新的增量 Compile。

代码在：

```text
web-studio/src/routes/knowledge-mining/route.tsx
web-studio/src/routes/knowledge-mining/-lib/intermediates.ts
web-studio/src/routes/knowledge-mining/-lib/api.ts
```

#### 8. 合并浏览器历史与服务端 Compile 历史

页面每 15 秒读取服务端历史，并与浏览器保存的文件名、上传进度、当前选择等信息合并；运行中任务每 2 秒读取一次状态。

因此刷新页面后可以恢复展示已经启动的任务，也可以切换文档、Memory 和人工阶段组成的历史记录。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/history.ts
web-studio/src/routes/knowledge-mining/route.tsx
bot/vikingbot/compile/store.py
```

#### 9. 把真实文件转换成多种浏览方式

Compile 返回的是结果元数据和目标 URI。Studio 还会：

- 递归读取目标目录；
- 读取每个知识页的 frontmatter；
- 按 OKF 的 `path_structure` 和 `meta_id` 组装元知识；
- 按配置中的 view tags 生成派生视图；
- 读取并解析来源覆盖、候选知识、阅读账本、调查报告和问卷；
- 将 `WikiLink` 和跨知识引用整理成图谱关系；
- 把图谱数据注入 OpenViking 官方 KG Explorer HTML。

这些都是展示处理，不会复制或重新生成知识文件。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/wiki-tree.ts
web-studio/src/routes/knowledge-mining/-lib/views.ts
web-studio/src/routes/knowledge-mining/-lib/meta-knowledge.ts
web-studio/src/routes/knowledge-mining/-lib/intermediates.ts
web-studio/src/routes/knowledge-mining/-lib/knowledge-graph.ts
web-studio/src/routes/knowledge-mining/-lib/official-knowledge-graph.ts
web-studio/src/routes/knowledge-mining/-components/knowledge-cloud-graph.tsx
```

#### 10. 导入 CLI 结果用于展示

Studio 可以从同一服务的 Compile 历史发现 CLI 任务，也可以挂载目标 URI 或导入 OVPack。导入后只复用展示链路，不会再次运行 Skill。

代码在：

```text
web-studio/src/routes/knowledge-mining/-lib/result-import.ts
web-studio/src/routes/knowledge-mining/-components/cli-result-import-card.tsx
```

## 我们在 Compile 实现内部额外增强了什么

下面这些不是前端在接口外做的事，而是当前定制版 Compile 在接口背后增加的保护。它们直接关系到“是否漏读、是否跳过候选、是否覆盖中间证据”。

### 1. 请求准入、队列容量和同目标锁

服务端会规范化 `from`、`to`、Skill 和 OKF URI，检查类型与限制。不同目标可以由服务端并行处理，但同一个 `to` 有独占锁，避免两个 Compile 同时覆盖同一知识库。

```text
bot/vikingbot/compile/service.py
bot/vikingbot/compile/models.py
```

Studio 当前又在更外层做了串行队列，所以从页面发起时通常只会有一个完整工作流运行。

### 2. 物化完整来源和已有目标

Compile 把解析后的来源内容下载到本次隔离工作区，并生成：

```text
compile_resources/_source-units.json
compile_resources/_manifest.tsv
```

`_source-units.json` 是上传级来源清单，不把一个 PDF 的多个解析片段误算成多份文档。已有目标知识库也会被复制到 `target_checkout`，供增量任务读取和修改。

```text
bot/vikingbot/compile/service.py
```

### 3. 自适应阅读深度和真实阅读跟踪

每个上传级文档都有必须阅读的路径：

- 不超过 8 个片段：全部读取；
- 9–24 个片段：读取 12 个分布式探针；
- 25–64 个片段：读取 16 个；
- 超过 64 个片段：读取 24 个；
- 大文档始终覆盖头部、准确中部和尾部。

平台跟踪 `read_file`、受控 exec 等实际读取行为。模型仅仅在 JSON 中声称“已检查”不算完成。

```text
bot/vikingbot/compile/read_depth.py
bot/vikingbot/compile/readlist.py
bot/vikingbot/compile/readtrace/sitecustomize.py
```

### 4. 三个不可跳过的门禁

#### 门禁一：来源覆盖

Agent 必须先写运行清单和 `source-coverage.json`，然后调用：

```text
submit_source_coverage()
```

成功前不允许新建或修改正式页面，也不允许提前写候选知识。平台核对来源清单、必读探针、处理状态和具体原因。

#### 门禁二：候选知识

来源覆盖通过后，Agent 必须让每份上传材料至少进入一个候选，写入 `candidate-knowledge.json`，再调用：

```text
submit_candidate_knowledge()
```

每个候选必须被明确处理为：

- `promoted`：生成正式元知识；
- `merged`：合并进另一个候选；
- `deferred`：证据暂时不足；
- `rejected`：不适合形成知识。

成功前仍然不能生成正式页面。

#### 门禁三：页面生成和最终提交

前两个门禁都通过后，Agent 才能修改正式 checkout，按 OKF 配置生成完整元知识页面、证据账本、调查报告和问卷，最后调用：

```text
submit_wiki_bundle()
```

三个工具及其门禁状态位于：

```text
bot/vikingbot/agent/tools/compile.py
```

它们都在同一个 AgentLoop 中执行。正常情况每个工具有一次成功调用；如果校验不通过，Agent 可以修改文件后重试，所以实际尝试次数可能大于一次。

### 5. 平台拥有的中间证据不会让 Agent 覆盖

最终提交前，平台会合并本轮和旧知识库的证据，并亲自生成或追加：

```text
_mining/readlist.json
_mining/evidence-history.json
```

同时合并运行清单、证据账本、来源覆盖和候选知识。旧页面、旧来源和旧阶段的证据不会因为本轮 Agent 漏写就直接消失。

```text
bot/vikingbot/compile/intermediate_artifacts.py
```

### 6. 最终结果由 Python 硬校验，不只依赖模型自检

最终提交会检查：

- 所有来源是否出现在覆盖账本；
- 必读片段是否真的读取；
- 每个来源是否进入候选阶段；
- 每个非导航页面是否来自 promoted 候选；
- frontmatter 字段、类型和来源是否合法；
- 物理目录是否严格符合 OKF `path_structure`；
- 每个 meta_id 是否具有配置要求的完整 facet 集；
- 派生视图 tags 是否来自配置；
- 页面证据账本、来源覆盖和候选页面是否互相一致；
- 调查问题是否覆盖全部冲突和证据缺口；
- WikiLink 和跨知识库引用是否合法。

```text
bot/vikingbot/compile/renderer.py
bot/vikingbot/compile/okf_config.py
```

### 7. 中断、取消与恢复

通过来源覆盖和候选知识后，平台分别保存私有检查点。检查点放在 VikingBot 数据目录的 `compile_checkpoints/<task-id>/`，任务状态放在 `compile_tasks/<task-id>.json`。

恢复会创建一个新 task id，并校验来源签名没有变化：

- 已通过来源覆盖：从候选阶段继续；
- 已通过候选知识：从页面生成继续；
- 没有有效阶段检查点：从最早未完成阶段继续。

```text
bot/vikingbot/compile/service.py
bot/vikingbot/compile/store.py
bot/vikingbot/compile/router.py
openviking/server/routers/bot.py
```

## 一次完整挖掘的具象时序

下面假设用户上传了文档、团队 Memory，并且最终出现一轮人工问卷。

### A. Studio 准备任务

1. 创建独立的 document、memory、wiki URI。
2. 检查 VikingBot 健康状态。
3. 检查、安装或升级 `llm-wiki` Skill。
4. 写入本次 OKF 配置。
5. 将任务放入 Studio 串行队列。

### B. 第一次 Compile：文档主挖掘

1. Studio 调用 `POST /bot/v1/compile`，`from=document-sources`，`to=wiki`。
2. 服务端第一次读取 Skill，完成请求准入检查。
3. 任务取得执行槽和目标锁。
4. 服务端第二次读取 Skill，物化 Skill、OKF、来源和已有目标。
5. 服务端额外调用模型一次，判断输出语言。
6. 启动一个 VikingBot AgentLoop；完整 Skill 放入系统上下文。
7. Agent 读取 `_source-units.json`，按必读路径检查所有上传级文档。
8. Agent 写来源覆盖，成功调用一次 `submit_source_coverage`；平台保存第一份检查点。
9. Agent 写候选知识，成功调用一次 `submit_candidate_knowledge`；平台保存第二份检查点。
10. Agent 根据 OKF 生成或修改正式页面和中间产物。
11. Agent 成功调用一次 `submit_wiki_bundle`。
12. 平台合并旧证据，注入 readlist 和 evidence-history，执行全部硬校验。
13. 校验通过后使用 OpenViking batch-write 写入同一个 `wiki` 目标。
14. Compile 返回页面数量、创建/更新 URI、视图配置、中间产物和调查状态。

### C. 第二次 Compile：团队 Memory 增量

1. Studio 看到文档任务完成且存在 Memory，自动再调用一次 Compile。
2. `from=team-memory`，`to` 仍然是同一个 `wiki`。
3. 同一个 Skill 再执行一次，并重复完整的三门禁流程。
4. Agent 先读取已有知识库，再用团队 Memory 修订页面。
5. 平台保留上一轮文档证据，同时把 Memory 证据加入账本和历史。

### D. 人工补证 Compile

1. 如果调查报告是 `needs_human_input`，Studio 暂停整个工作流。
2. 用户填写问卷。
3. Studio 将答案生成新的 `human-answers-<time>.md` 证据。
4. Studio 第三次调用 Compile，`from=human-answer`，`to` 仍然是同一个 `wiki`。
5. 同一个 Skill 第三次执行，并再次走三门禁。
6. Agent 根据人工证据解决冲突、修订页面和问卷状态。
7. 如果报告变成 `clear`，整个 Studio 工作流完成；如果还有新问题，可以继续下一轮人工补证，每一轮都新增一个 Compile。

### E. Studio 展示结果

1. 读取真实目标目录和所有 Markdown 页面。
2. 从 Compile 返回的 `main_view` 和 `views` 读取配置，不猜测目录。
3. 按 `meta_id` 把配置要求的 facet 页面组成元知识。
4. 主视图展示真实目录；派生视图只按 tags 重组同一批文件。
5. 读取 `_mining` 中间产物，展示覆盖、候选、阅读账本和问卷。
6. 从页面 WikiLink、跨库引用和 meta/facet 关系构图，再用官方 KG Explorer HTML 展示。

## 最终产物是谁生成的

| 产物 | 主要生成者 | 平台是否再次处理 |
| --- | --- | --- |
| 正式知识 Markdown | VikingBot Agent 按 Skill 生成 | 是，校验 frontmatter、目录、来源、meta/facet、tags 和链接 |
| `run-manifest.json` | Agent 起草 | 是，平台纠正版本、阶段、目标和来源根 |
| `source-coverage.json` | Agent 决策 | 是，平台合并旧阶段并核对真实读取 |
| `candidate-knowledge.json` | Agent 决策 | 是，平台合并并核对来源及最终页面 |
| `evidence-ledger.json` | Agent 起草 | 是，平台与已有账本合并并校正页面集合 |
| `investigation-report.json` | Agent | 是，平台校验问题结构和状态一致性 |
| `questionnaire.json` | Agent | 是，平台校验是否覆盖所有冲突与缺口 |
| `readlist.json` | Compile 平台 | Agent 不应手工修改 |
| `evidence-history.json` | Compile 平台 | Agent 不应手工修改 |
| 主视图目录树 | 已写入 OpenViking 的真实文件 | Studio 只读取和展示 |
| 派生视图 | Studio 根据配置 tags 计算 | 不复制知识文件 |
| 点阵图 | Studio 计算图数据，官方 HTML 渲染 | 不修改知识文件 |

## 最容易产生误解的地方

1. “四个阶段”不等于 Skill 调用四次。一个 Compile 只有一个 AgentLoop。
2. Skill 的加载次数不等于模型调用次数。模型会在一个 AgentLoop 内进行许多轮推理和工具调用。
3. 三个门禁在每个文档、Memory、人工 Compile 中都会重新执行，因为每一轮都有新的来源需要覆盖和审计。
4. 30 份文档不要求生成 30 个元知识。每份文档必须被读取并进入候选账本，但多个来源可以有依据地合并到同一候选；是否漏知识应看来源覆盖、候选账本和 readlist，而不能只看最终页面数量。
5. what/why/how 目前存在于默认 OKF 配置，不是前端视图代码或 Skill 的固定假设。换一份合法 OKF 配置后，模型生成和前端展示都应遵循新配置。


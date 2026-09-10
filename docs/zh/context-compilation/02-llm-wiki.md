# 示例：LLM Wiki

把一批异构来源编译成一套 Karpathy 风格、有出处、互相链接的 **LLM Wiki**：每一页有明确的检索目的，开头一句话直给结论，术语统一，关系显式，证据紧贴结论，并由一个 `index.md` 做导航入口。

新版 Skill 使用可配置的 OKF 契约。默认知识类型为：

| 页面类型 | 用于 |
|---------|------|
| `entity` | 有稳定身份的具名事物（人、组织、产品、项目、系统、数据集、标准、事件……） |
| `concept` | 可复用的思想、机制、模式、协议、心智模型 |
| `synthesis` | 围绕明确范围或问题的跨来源综合、偏好、事件摘要、洞察或导航页 |

默认以 `entity` 和 `concept` 为主，只有真正组合多份证据或承担导航职责时才使用 `synthesis`。`OKF_CONFIG.yaml` 定义唯一主视图、`page_role / business_domain / subdomain / subject_path / filename` 物理路径、必需 frontmatter、证据谱系、挖掘中间产物、导航页和标准 Markdown 链接规则；`generated.by` 可用 `{skill}`/`{model}` 模板，`generated.at` 由提交器写入实际 UTC 时间。每个晋升候选只对应一个规范知识页，不要求成组生成固定分面页面。产物是一个**知识库**，不是逐文档的摘要拼盘。

Skill 源码：[examples/compile/ov-compile-skills/llm-wiki](https://github.com/volcengine/OpenViking/tree/main/examples/compile/ov-compile-skills/llm-wiki) · 可视化脚本：[examples/compile/graph-show/llm-wiki](https://github.com/volcengine/OpenViking/tree/main/examples/compile/graph-show/llm-wiki)

## 第一步：准备来源

如果材料还没进 OpenViking，先导入。目录型来源用 `ov add-resource`，单文件可以用 `ov write`：

```bash
# 导入一个目录作为来源
ov add-resource ./my-research --to viking://resources/research --wait

# 或者写入单个文件
ov mkdir viking://resources/research
ov write viking://resources/research/notes.md \
  --from-file ./notes.md --mode create --wait
```

确认来源已就位：

```bash
ov ls -r viking://resources/research
```

## 第二步：添加 Skill

把 LLM Wiki 的 Skill 装进服务。默认落到你的用户私有 skills 命名空间；想让团队共用就用 `-p viking://agent/skills`：

```bash
ov add-skill examples/compile/ov-compile-skills/llm-wiki --wait
```

查看装好的 Skill URI：

```bash
ov skills list
# → viking://agent/skills/llm-wiki  （或 viking://user/<你>/skills/llm-wiki）
```

## 第三步：执行编译

Skill 目录中的 `OKF_CONFIG.yaml` 是默认契约。若要使用外部配置，先把 YAML 写入 OpenViking，然后通过 `--okf-config` 传入它的 URI：

```bash
ov write viking://resources/research/OKF_CONFIG.yaml \
  --from-file ./my-okf-config.yaml --mode upsert
```

```bash
ov compile \
  --from viking://resources/research \
  --to viking://resources/research-wiki \
  --skill viking://agent/skills/llm-wiki \
  --okf-config viking://resources/research/OKF_CONFIG.yaml \
  --reason "面向团队检索整理成 Wiki，保留每条结论的出处" \
  --wait
```

- `--from` 可以重复或用逗号分隔，一次传多个来源。
- `--to` 目录不存在时会自动创建。
- 想要机器可读结果加 `-o json`；不想阻塞终端就去掉 `--wait`，用返回的 `task_id` 轮询：

```bash
ov task status cmp_01abc      # 查看进度与最终结果
ov task cancel cmp_01abc      # 协作式取消
```

## 第四步：看看产物

编译完成后目标目录里就是一套 Markdown 知识库。先看导航页，再按需钻进去：

```bash
ov tree viking://resources/research-wiki
ov read viking://resources/research-wiki/index.md
```

典型结构（实际目录由 OKF 主视图分类决定）：

```text
research-wiki/
├── index.md
├── knowledge/<page_role>/<business_domain>/<subdomain>/<可选主题路径>/<页面>.md
└── _mining/
    ├── run-manifest.json                 # 运行清单
    ├── evidence-ledger.json              # 逐页证据账本
    ├── investigation-report.json         # 冲突与证据缺口
    ├── source-coverage.json              # 上传级来源覆盖
    ├── candidate-knowledge.json          # 候选知识及取舍决策
    ├── readlist.json                     # 平台生成的逐文档阅读账本
    └── evidence-history.json             # 跨阶段证据快照
```

每页 `sources` 只包含用户提供的来源；中间证据链保存在 `_mining/evidence-ledger.json`。`candidate-knowledge.json` 记录从来源候选到最终知识页的取舍；`source-coverage.json` 必须记录每份上传级材料是否已引用、合并或有理由跳过，并与平台生成的 `readlist.json` 和证据账本一致。增量阶段会合并旧证据并追加 `evidence-history.json` 快照。

Compile 使用逐层非递归遍历建立完整来源树，不依赖有深度和节点截断的递归清单；超出显式来源节点、文件数或字节上限时任务会失败，不会静默漏掉尾部文档。解析后不超过八个正文片段的文档必须全部阅读；更长的 PDF 等文档随片段数量增加采用 12、16 或 24 个均匀分布的必读探针，并始终包含首部、正中和尾部。实际读取轨迹随运行落入 `_mining/readlist.json`，因此可以逐文档倒推阅读覆盖。候选决策必须在最终页面之前逐来源写出；Compile 不再伪造缺失的 rejected 候选，会拒绝当前来源的通用或重复跳过理由，也不会接受多文档首轮全部跳过且只有索引页的结果。

## 第五步：可视化成交互式图谱

`wiki_graph.py` 会**直接连接 OpenViking 服务**读取 Wiki 页面（不需要先下载到本地），把页面按类型着色、按链接连边，生成一个独立的交互式 HTML：

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/research-wiki \
  -o research-wiki-graph.html \
  --title "研究知识库"
```

用浏览器打开 `research-wiki-graph.html` 即可。节点按 `entity`、`concept`、`synthesis` 分色，边来自标准 Markdown 链接，点节点能看正文。

连接配置的解析顺序和 `ov` 一致：命令行参数 → `OPENVIKING_*` 环境变量 → `~/.openviking/ovcli.conf`。远程服务显式传参：

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/research-wiki \
  --url https://openviking.example.com \
  --api-key "$OPENVIKING_API_KEY" \
  -o research-wiki-graph.html --title "研究知识库"
```

一次传多个 Wiki，可以把它们画在同一张图里对比：

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/wiki-a viking://resources/wiki-b \
  -o combined.html --title "两个知识库对照"
```

## 相关文档

- [上下文编译概览](./01-overview.md)
- [Knowledge Graph 示例](./03-knowledge-graph.md)
- [VikingBot API → compile()](../api/24-vikingbot.md#compile)

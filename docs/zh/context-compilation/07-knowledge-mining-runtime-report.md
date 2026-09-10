# 知识挖掘运行机制报告

本文记录当前 `ov knowledge-mining` 的真实运行机制。知识挖掘使用单一物理主视图和原子知识页，不依赖固定分面三联页或派生视图。

## 入口与执行边界

正式入口是：

```bash
ov knowledge-mining --documents <本地路径或 viking:// 文件夹> --wait
```

CLI 负责：

1. 收集本地文档或解析已有 OpenViking 来源文件夹。
2. 按文件数、字节数、PDF 页数和预计必读探针规划串行窗口。
3. 为每个窗口建立隔离的来源目录。
4. 安装或复用 `llm-wiki` Skill，并写入本次 OKF 配置。
5. 逐窗调用 VikingBot Compile；前一窗结束后才启动下一窗。
6. 所有窗口固定写入同一个目标知识库。
7. 持久化本地断点状态和远端逐窗口日志。

CLI 不复制 Compile 内部的挖掘算法。

## 串行窗口

默认预算为：

- 最多 10 份文件；
- 最多 200 MiB 原始文件；
- 最多 1,500 个 PDF 实际页；
- 最多 300 个预计必读探针。

任一预算即将超限时切换到下一窗口。单文件自身超过窗口预算但没有超过 512 MiB 单文件硬上限时，该文件独占一个窗口；CLI 不物理拆分 PDF。

每个窗口的来源目录相互隔离：

```text
viking://resources/knowledge-mining/<batch-id>/windows/0001/document-sources/
viking://resources/knowledge-mining/<batch-id>/windows/0002/document-sources/
```

窗口使用相同的 `to` URI。第一窗建立知识库，后续窗口读取已有目标并增量修订。已经完成的窗口结果不会因为后续窗口中断而消失。

## Compile 内部阶段

一个窗口对应一次端到端 Compile，内部依次执行：

1. `source_coverage`：读取本窗每份上传级文档要求的证据探针，提交来源覆盖。
2. `candidate_knowledge`：为每份来源形成候选并记录晋升、合并、延后或拒绝决定。
3. `page_generation`：生成或修改原子知识页及中间产物。
4. 平台合并旧证据、生成审计文件、执行确定性校验并写入 OpenViking。

前三项是 Agent 按 Skill 执行的挖掘阶段；第四项是平台提交和持久化阶段。

`knowledge-mining` 要求前两个检查点正常完成。最终 OKF 一致性校验不阻断写入：校验失败时结果仍提交到目标目录，同时返回 `validation_passed: false` 和具体 warnings。普通 `ov compile` 保持严格校验。

## 单一主视图

`OKF_CONFIG.yaml` 的 `main_view` 定义唯一物理目录树。当前默认路径结构是：

```text
knowledge/<page_role>/<business_domain>/<subdomain>/<subject_path...>/<filename>.md
```

`subject_path` 可以为空或包含多级主题目录。每个晋升候选只对应一个规范页面；候选 ID 是跨批次稳定身份，移动或重命名页面不应创建语义重复项。

页面类型与目录角色是不同概念：`type` 描述知识对象语义，`page_role` 描述它在主视图中的检索用途。

## 原文件与 PDF 溯源

来源覆盖以用户上传级文件为单位，而不是以解析片段为单位。PDF 解析产生的 Markdown 片段共享同一份原始文件身份。

溯源链由以下数据共同维护：

- 原始资源的 `original_uri`、真实文件名和 `document_id`；
- `source-coverage.json` 中的上传级来源与实际证据片段；
- `evidence-ledger.json` 中的页面、来源和关键声明映射；
- PDF 证据片段中的页码标记；
- 最终页面 frontmatter 中的原始来源 URI。

因此知识页可以回溯到真实 PDF，而不是只能回溯到某个解析分片。

## 中间产物

当前 OKF 合同可以要求以下产物：

| 产物 | 作用 |
| --- | --- |
| `run-manifest.json` | 本窗目标、阶段和来源根 |
| `source-coverage.json` | 上传级来源读取与处置 |
| `candidate-knowledge.json` | 候选知识及取舍决策 |
| `evidence-ledger.json` | 页面与证据映射 |
| `investigation-report.json` | 冲突和证据缺口 |
| `readlist.json` | 平台生成的真实读取轨迹 |
| `evidence-history.json` | 跨窗口证据快照 |

`readlist.json` 和 `evidence-history.json` 由平台维护，Agent 不应手工伪造。增量窗口必须保留仍有效的旧页面、旧候选和旧证据历史。

## 断点与日志

本地状态文件默认位于：

```text
.openviking/knowledge-mining/<batch-id>.json
```

远端日志位于：

```text
viking://resources/knowledge-mining/<batch-id>/logs/run.json
viking://resources/knowledge-mining/<batch-id>/logs/windows/<序号>.json
```

恢复命令：

```bash
ov knowledge-mining --resume-state <状态文件> --wait
```

恢复会跳过状态为 completed 的窗口和已经确认上传的文件。失败窗口保留任务 ID、错误、warnings、开始时间和结束时间，便于重试及 debug。

## 代码位置

- CLI 编排：`crates/ov_cli/src/commands/knowledge_mining.rs`
- OKF 解析：`bot/vikingbot/compile/okf_config.py`
- 提交校验：`bot/vikingbot/compile/renderer.py`
- Compile 服务：`bot/vikingbot/compile/service.py`
- 默认 Skill：`examples/compile/ov-compile-skills/llm-wiki/SKILL.md`
- 默认 OKF：`examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml`

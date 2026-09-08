# Agent 教程：使用自定义 Skill、OKF Config 和本地知识源进行分批知识挖掘

本文是给自动化 Agent 使用的 CLI 执行手册。它只描述 ov knowledge-mining，不使用 Studio，也不要擅自改用 ov compile 替代。

目标流程：

1. 安装用户提供的本地 Skill 文件夹；
2. 显式使用用户自己的 OKF_CONFIG.yaml；
3. 把本地 documents 文件夹按默认 10 个文件一个窗口串行处理；
4. 让所有窗口写入同一个知识库，第一批之后均作为增量更新；
5. 保存本地 checkpoint 和 OpenViking 远端日志；
6. 中断后跳过已经完成的窗口，从第一个未完成窗口继续；
7. 即使最终 OKF 校验不通过，也保留写入结果并继续下一个窗口。

## 一、Agent 必须理解的流程

~~~text
本地 Skill 文件夹
  └─ ov skills add
       └─ 安装后的 viking://.../skills/<name> URI

本地 documents 文件夹 + 本地 OKF_CONFIG.yaml
  └─ 收集、排序并计算文件规模
       └─ 按文件数、字节数、PDF 页数和预计探查量切分窗口
            ├─ 窗口 1：上传 → 阶段 1 → 阶段 2 → 页面生成/最终校验 → 写入 → 日志
            ├─ 窗口 2：上传 → 阶段 1 → 阶段 2 → 页面生成/最终校验 → 增量写入 → 日志
            └─ 后续窗口依次串行执行
~~~

串行意味着窗口 1 完成后才会启动窗口 2。所有窗口使用完全相同的目标 URI，因此后续窗口是在已有知识库上增量补充、纠正和去重，不是分别生成多套知识库。

## 二、运行前必须取得的参数

| 参数 | 含义 | 示例 |
|---|---|---|
| SKILL_DIR | 本地 Skill 文件夹 | /data/skills/acme-wiki |
| SKILL_NAME | SKILL.md 中的名称 | acme-wiki |
| OKF_CONFIG | 本地 OKF 配置文件 | /data/skills/acme-wiki/OKF_CONFIG.yaml |
| DOCUMENTS_DIR | 本地知识源文件或文件夹 | /data/documents |
| TARGET_URI | 所有窗口共同写入的知识库 | viking://resources/acme/knowledge |
| STATE_FILE | 本地断点和运行状态文件 | /data/mining/acme-run.json |

参数类型不能混用：

- --documents 接受本地文件、本地文件夹或 OpenViking 文件夹 URI；
- --okf-config 接受本地 YAML 文件；
- --skill 必须使用安装后返回的 viking:// Skill URI，不能传本地路径；
- --to 是 OpenViking 目标 URI，并且在整次串行运行中必须保持不变。

## 三、前置检查

~~~bash
command -v ov
ov knowledge-mining --help
ov skills add --help
ov config validate
~~~

在源码仓库中开发或测试时，如果 PATH 中的 ov 较旧，可以构建并使用项目二进制：

~~~bash
cargo build -p ov_cli
./target/debug/ov knowledge-mining --help
~~~

后续示例统一写作 ov。使用项目二进制时，将其替换成 ./target/debug/ov。

Agent 还必须确认：

- DOCUMENTS_DIR 存在且可读；
- SKILL_DIR/SKILL.md 存在；
- OKF_CONFIG 是用户要求用于本次运行的版本；
- STATE_FILE 的父目录可写；
- TARGET_URI 是用户指定目标，或为首次试跑新建的隔离目标；
- 不在命令输出、日志或回复中暴露 API Key 和模型密钥。

## 四、准备并校验自定义 Skill

推荐的最小目录结构：

~~~text
acme-wiki/
├── SKILL.md
└── OKF_CONFIG.yaml
~~~

Skill 可以包含 USER_PROFILE.md、参考资料和其他辅助文件。使用文件夹安装时，这些文件会和 SKILL.md 一起安装。

SKILL.md 的 frontmatter 至少应包含名称和描述：

~~~yaml
---
name: acme-wiki
description: 将内部文档整理成可追溯、可增量更新的知识库。
---
~~~

安装前校验：

~~~bash
ov skills validate /data/skills/acme-wiki
~~~

Agent 必须确认目录代表的 Skill 名称、SKILL.md 中的 name，以及安装命令的 --skill 名称一致。校验失败时先修正本地文件，不要擅自删除已安装的同名 Skill。

## 五、安装本地 Skill 文件夹

先确认本地来源中有哪些 Skill：

~~~bash
ov -o json skills add /data/skills/acme-wiki --list
~~~

安装到当前用户的私有 Skill 空间：

~~~bash
ov -o json skills add /data/skills/acme-wiki \
  --skill acme-wiki \
  --wait \
  --yes
~~~

典型结果：

~~~json
{
  "ok": true,
  "result": {
    "status": "success",
    "uri": "viking://user/default/skills/acme-wiki",
    "name": "acme-wiki"
  }
}
~~~

Agent 必须读取真实的 result.uri，不能根据用户名自行拼接 URI。

如果用户明确要求共享 Skill，可以指定共享父目录：

~~~bash
ov -o json skills add /data/skills/acme-wiki \
  --skill acme-wiki \
  --parent-auto-create viking://agent/skills \
  --wait \
  --yes
~~~

安装完成后核对：

~~~bash
ov skills list
ov skills show acme-wiki
~~~

本地 Skill 后续发生修改时，已安装副本不会自动变化。再次挖掘前，应重新校验并按照当前 CLI 的 ov skills update --help 更新已安装版本。

## 六、OKF Config 使用规则

SKILL.md 控制 Agent 怎样阅读、分析和写作。OKF_CONFIG.yaml 控制最终知识库的结构与硬约束，例如：

- 页面类型和必需 frontmatter；
- source 类型与溯源要求；
- 目录层级、meta ID、标签和视图；
- 中间产物要求。

即使 Skill 文件夹已经包含 OKF_CONFIG.yaml，运行时仍必须显式传入本地配置：

~~~bash
--okf-config /data/skills/acme-wiki/OKF_CONFIG.yaml
~~~

如果省略，knowledge-mining 会使用 CLI 内置的默认 OKF 配置，而不是自动读取本地 Skill 文件夹里的配置。

## 七、标准分批挖掘命令

~~~bash
ov knowledge-mining \
  --documents /data/documents \
  --skill viking://user/default/skills/acme-wiki \
  --okf-config /data/skills/acme-wiki/OKF_CONFIG.yaml \
  --to viking://resources/acme/knowledge \
  --window-files 10 \
  --window-bytes 209715200 \
  --window-pages 1500 \
  --window-probes 300 \
  --state-file /data/mining/acme-run.json \
  --reason "按照 acme-wiki 的规则，将这些文档整理成可检索、可追溯的中文知识库" \
  --wait \
  --timeout 1800 \
  --runtime-timeout 1800
~~~

自动化 Agent 推荐增加 JSON 输出：

~~~bash
ov -o json knowledge-mining \
  --documents /data/documents \
  --skill viking://user/default/skills/acme-wiki \
  --okf-config /data/skills/acme-wiki/OKF_CONFIG.yaml \
  --to viking://resources/acme/knowledge \
  --window-files 10 \
  --state-file /data/mining/acme-run.json \
  --wait \
  --timeout 1800 \
  --runtime-timeout 1800
~~~

只挖掘 documents 时，不要传 --memory。只有用户明确要求团队记忆挖掘时才能增加该参数。

## 八、窗口切分规则

默认文件数上限为 10。一个窗口会在触碰以下任一上限前结束：

| 参数 | 默认值 | 含义 |
|---|---:|---|
| --window-files | 10 | 最大文件数 |
| --window-bytes | 209715200 | 最大源文件总字节数，即 200 MiB |
| --window-pages | 1500 | PDF 实际页数上限 |
| --window-probes | 300 | 预计必须探查的片段数量上限 |

例如 27 个普通 Markdown 文件，在没有触发其他限制时会被规划成：

~~~text
窗口 1：10 个文件
窗口 2：10 个文件
窗口 3： 7 个文件
~~~

如果某个单文件自身超过字节数、PDF 页数或 probe 上限，它不会被拆到不同窗口，而是单独形成一个窗口，并在状态文件中标记：

~~~json
{
  "oversized_singleton": true
}
~~~

超大 PDF 会独占一个端到端窗口。PDF 上传时保留原始文件，知识页 source 信息仍可指回对应的 OpenViking 原始资源。

## 九、同一知识库的增量语义

每个窗口都有自己的 source_uri 和 task ID，但共享同一个 target_uri。

第一窗口通常创建 index.md、第一批知识页面和 _mining 中间产物。第二窗口及以后会：

- 读取同一个目标知识库；
- 把当前窗口视为新增证据；
- 新建缺失页面；
- 更新、纠正或去重已有页面；
- 更新 _mining 中间产物；
- 保留仍然准确的既有知识。

Agent 不得为每个窗口生成不同的 --to，否则会得到多套互不关联的知识库。

## 十、最终 OKF 校验不阻断写入

ov knowledge-mining 会自动请求非阻断式最终 OKF 校验。

只要前面的挖掘阶段能够完成，页面生成结果就可以写入目标知识库。即使最终校验不通过，窗口仍可记录为完成并继续下一个窗口：

~~~json
{
  "status": "completed",
  "validation_passed": false,
  "warnings": [
    "OKF final validation failed; the checkout was committed without blocking: ..."
  ],
  "error": null
}
~~~

Agent 必须把 validation_passed=false 和完整 warning 报告给用户，不能称为“校验通过”。同时也不能因为 warning 宣称知识库未写入，应结合窗口状态、任务状态和目标文件判断。

## 十一、日志、checkpoint 和恢复

本地 checkpoint 由 --state-file 指定，记录：

- batch ID 和 run 根 URI；
- Skill URI、OKF Config URI、目标知识库 URI；
- 所有窗口及文件清单；
- 每个文件是否上传完成；
- 每个窗口的 task ID、状态和时间；
- validation_passed、warnings 和 error。

OpenViking 远端日志位于：

~~~text
<root_uri>/logs/run.json
<root_uri>/logs/windows/0001.json
<root_uri>/logs/windows/0002.json
...
~~~

本地 checkpoint 用于恢复，远端日志用于跨机器排查、审计和 debug。

中断后不要重新发起新的完整任务，也不要修改状态文件。使用：

~~~bash
ov knowledge-mining \
  --wait \
  --resume-state /data/mining/acme-run.json \
  --timeout 1800 \
  --runtime-timeout 1800
~~~

恢复行为：

- completed 窗口直接跳过；
- 已确认上传的文件不会重复上传；
- 当前未确认文件允许幂等重试；
- 已提交且仍在运行的任务复用原 task ID；
- failed 或 partial 窗口从对应 checkpoint 继续；
- 已完成窗口写入知识库的结果不会因后续窗口中断而被删除。

恢复前，尚未上传的本地源文件必须仍然存在且大小未变化。检测到文件缺失或大小变化时，CLI 会拒绝恢复，避免同一个 checkpoint 混入不同输入。

## 十二、查看进度和结果

~~~bash
ov task status cmp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ov tree viking://resources/acme/knowledge
ov read viking://resources/acme/knowledge/index.md
ov read viking://resources/knowledge-mining/<batch-id>/logs/run.json
ov read viking://resources/knowledge-mining/<batch-id>/logs/windows/0001.json
~~~

Agent 在结束时至少报告：

- 安装后的 Skill URI；
- 使用的本地 OKF Config 路径；
- documents 和 memory 文件数量；
- 窗口数量及每个窗口文件数；
- 目标知识库 URI；
- 本地 state 文件与远端 run 日志 URI；
- 每个 task ID 和最终状态；
- 每个窗口的 validation_passed 和 warnings；
- 创建、更新和保留了多少知识页面。

## 十三、使用 OpenViking 文件夹作为 documents

`ov knowledge-mining --documents` 同时接受本地路径和 `viking://` 文件夹 URI。OpenViking 文件夹会先使用当前 CLI 身份执行 `stat` 校验，再通过非递归目录列表展开为直接子文档；这些子文档仍然直接交给 Compile，不会下载到本地，也不会重复上传到知识挖掘批次目录。

两种数据源进入的是同一套 Skill、OKF Config、Compile 和最终校验流程；差异只在 source 准备、窗口计数和溯源位置：

| 项目 | 本地文件或文件夹 | OpenViking 文件夹 |
|---|---|---|
| 准备方式 | CLI 递归筛选支持的文件并逐份上传、解析 | CLI 校验目录、列举直接子项并引用其现有 URI |
| 窗口计数 | 每个本地文件计为一个 source item | 文件夹下每个可见的直接子项计为一个 source item |
| 目录展开 | 上传后的批次 source 目录 | CLI 展开一层以规划窗口，Compile 再递归展开每个子项 |
| 溯源 URI | 指向本次批次下上传后的资源 | 保留原 OpenViking 子文档及其内部资源 URI |
| checkpoint | 记录每个本地文件的上传状态 | 记录展开后的子项清单并标记为远端已就绪，不执行上传 |

OpenViking 输入只支持文件夹，不支持用远端单文件 URI 代替文件夹。`--memory`、`--okf-config` 仍只接受本地路径，`--skill` 仍必须是安装后可访问的 Skill URI。该能力只改变 `ov knowledge-mining` 的 CLI 编排，不改变 `ov compile` 的参数或服务端行为。

直接挖掘已有 OpenViking 文件夹：

~~~bash
ov knowledge-mining \
  --documents viking://resources/existing-source \
  --skill viking://user/default/skills/acme-wiki \
  --wait
~~~

本地目录与 OpenViking 文件夹也可以混合输入：

~~~bash
ov knowledge-mining \
  --documents /data/documents \
  --documents viking://resources/existing-source \
  --wait
~~~

窗口规划把 OpenViking 文件夹的每个可见直接子项视为一个现有文档 source。因此默认 `--window-files 10` 时，包含 23 个直接子文档的远端文件夹会生成 `10 / 10 / 3` 三个串行窗口；每个窗口把对应子项 URI 直接传给 Compile。若子项本身是目录，Compile 仍会递归展开它。隐藏的目录摘要和控制文件不会被计为文档。本地文件保持原有行为，继续逐份上传到批次窗口。checkpoint 会保存展开后的远端子项 URI 并将其标记为已就绪，因此 `--resume-state` 不依赖远端 source 的本地副本，也不会重新按目录当前内容规划窗口。

Agent 执行远端文件夹挖掘时必须遵守以下规则：

1. URI 必须属于 CLI 当前连接的同一个 OpenViking 服务，且当前 account、user 和 actor peer 对它有读取权限。
2. 启动前执行 `ov stat <folder-uri>`；需要确认内容范围时再执行 `ov ls <folder-uri>` 或 `ov tree <folder-uri>`，不要先导出到本地再挖掘。
3. 一个远端文件夹的每个可见直接子项计为一个 source，并受 `--window-files` 约束；列表提供子项大小时也会参与 `--window-bytes` 和 `--window-probes` 估算。远端目录子项的递归大小以及原始 PDF 页数不会出现在列表中，因此这些实际限制仍由 Compile 展开后兜底。即使把 `--window-files` 设为大于 16，CLI 也会按 Compile 的 source-root 上限提前拆窗。
4. 远端目录不会生成批次内的数据副本。挖掘页面的来源应指向原始 OpenViking URI，这是预期行为。
5. `--resume-state` 不会重新上传、重新列举父目录或把 URI 当成本地路径，但状态文件中记录的远端子项必须仍然存在且可访问。恢复使用首次规划时冻结的子项 URI 清单。
6. 混合输入时，本地文件先上传到窗口 staging 目录，远端子项 URI 直接加入同一个 Compile 请求；不要手工复制远端目录到 staging URI。

远端-only 自动化示例：

~~~bash
ov -o json knowledge-mining \
  --documents viking://resources/existing-source \
  --skill viking://user/default/skills/acme-wiki \
  --okf-config /data/skills/acme-wiki/OKF_CONFIG.yaml \
  --to viking://resources/acme/knowledge \
  --state-file /data/mining/acme-remote-run.json \
  --reason "将 OpenViking 中已有资料整理为可检索、可追溯的中文知识库" \
  --wait \
  --timeout 1800 \
  --runtime-timeout 1800
~~~

如果命令报告 source 不是文件夹、无权访问或不存在，Agent 应停止并报告对应 URI 与当前连接身份，不得退回成本地路径猜测。若某个远端直接子项本身包含过多递归文件并触发服务端 source 文件数或总字节限制，应让用户把该子项拆成更小的同级文档边界后重试。

## 十四、Agent 标准执行清单

1. 确认当前 ov 版本并执行 ov config validate。
2. 确认每个知识源是可读取的本地文件/目录，或当前身份可访问的 viking:// 文件夹。
3. 检查并完整读取本地 SKILL.md 和 OKF_CONFIG.yaml。
4. 执行 ov skills validate <SKILL_DIR>。
5. 使用 ov skills add <SKILL_DIR> --skill <NAME> --wait --yes 安装。
6. 从 JSON 安装结果读取真实 Skill URI，并用 skills show 核对。
7. 确定唯一且固定的目标知识库 URI。
8. 使用 --window-files 10、明确的 --state-file 和 --wait 启动。
9. 只做文档挖掘时绝不传 --memory。
10. 持续观察 state 文件和 task 状态，不因暂时无终端输出而重复启动。
11. 中断后只使用 --resume-state 恢复，不重建 batch。
12. 完成后确认所有窗口为 completed，并逐一报告校验 warning。
13. 使用 ov tree 或 ov read 验证最终页面确实存在。
14. 保留 checkpoint 和远端日志，不泄露凭据或私有文档内容。

## 十五、常见错误

### 把本地 Skill 路径传给 --skill

先用 ov skills add 安装，再传安装结果中的 viking:// URI。

### 修改 Skill 后行为没有变化

本地修改不会自动更新已安装副本。重新校验并更新 Skill，再用 skills show 核对。

### 修改 OKF Config 后结构没有变化

通常是运行时没有显式传 --okf-config。把正确的本地 YAML 路径加入命令。

### 后续窗口生成另一套知识库

通常是不同窗口使用了不同 --to，或中断后重新启动了新 batch。整次运行必须固定一个 --to，中断时使用原 state 文件。

### 最终校验失败但任务显示 completed

这是 knowledge-mining 的预期非阻断行为。检查 validation_passed=false、warnings 和目标文件，同时报告“结果已写入”和“最终校验未通过”。

### 请求超时

本地等待超时不代表服务端任务已取消。先用 state 文件中的 task ID 执行 ov task status，然后使用原 state 文件恢复，不要立即创建新目标或重复提交全部文档。

### 找不到 knowledge-mining

通常是 PATH 中存在旧版 CLI。在源码仓库中可以执行：

~~~bash
cargo build -p ov_cli
./target/debug/ov knowledge-mining --help
~~~

## 十六、当前实现位置

~~~text
crates/ov_cli/src/commands/knowledge_mining.rs
crates/ov_cli/src/client.rs
crates/ov_cli/src/main.rs
bot/vikingbot/compile/models.py
bot/vikingbot/compile/service.py
bot/vikingbot/agent/tools/compile.py
~~~

更底层的运行说明见 docs/zh/context-compilation/07-knowledge-mining-runtime-report.md。

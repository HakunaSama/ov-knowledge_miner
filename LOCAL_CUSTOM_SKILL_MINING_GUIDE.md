# 使用本地自定义 Skill 进行知识库挖掘

> 当前推荐的 Agent 分批挖掘教程见
> `docs/zh/context-compilation/08-batched-knowledge-mining-agent-guide.md`。
> 新教程使用已实测的 `ov skills add`、10 文件串行窗口、统一目标知识库和断点恢复流程。

这份教程用于指导本地 Codex 或开发者完成以下工作：

1. 从现有 `llm-wiki` 复制并修改一个本地 Skill；
2. 校验本地 Skill；
3. 使用 `ov add-skill` 把它安装到 OpenViking；
4. 找到安装后的 `viking://` Skill URI；
5. 使用这个 Skill 执行完整知识库挖掘；
6. 修改 Skill 后安全更新已安装版本。

本文默认命令在 OpenViking 仓库根目录执行。

```text
/Users/bytedance/Desktop/workspace/ov-knowledge_minier/OpenViking
```

## 最重要的规则

`ov add-skill` 接受本地文件夹路径：

```bash
./target/debug/ov add-skill ./local-skills/my-llm-wiki --wait
```

`ov compile --skill` 和 `ov knowledge-mining --skill` 不接受本地路径，它们接受安装后的 OpenViking URI：

```bash
--skill viking://agent/skills/my-llm-wiki
```

完整关系是：

```text
本地 Skill 文件夹
        │
        │ ov add-skill
        ▼
OpenViking Skill URI
        │
        │ ov knowledge-mining --skill 或 ov compile --skill
        ▼
VikingBot 使用该 Skill 挖掘知识库
```

## 第一步：确认使用的是项目内 Rust CLI

本机 PATH 中可能存在旧版 Python `ov`。它不一定包含当前项目新增的 `knowledge-mining` 命令。为了避免调用错版本，本教程默认使用：

```bash
./target/debug/ov
```

如果二进制不存在，先构建：

```bash
cargo build -p ov_cli
```

确认命令可用：

```bash
./target/debug/ov knowledge-mining --help
./target/debug/ov compile --help
./target/debug/ov skills --help
```

如果以后已经把当前 Rust CLI 正确安装进 PATH，可以把文中的 `./target/debug/ov` 替换为 `ov`。执行前仍应使用下面的命令确认实际程序位置：

```bash
command -v ov
```

## 第二步：准备一个独立的自定义 Skill

建议不要直接修改官方 `llm-wiki`。复制一份并使用不同名称，这样官方版本和自定义版本可以同时存在。

例如复制到：

```text
local-skills/my-llm-wiki/
├── SKILL.md
└── OKF_CONFIG.yaml
```

可以从仓库自带版本复制：

```bash
mkdir -p local-skills
cp -R examples/compile/ov-compile-skills/llm-wiki local-skills/my-llm-wiki
```

如果 `local-skills/my-llm-wiki` 已经存在，不要直接执行上述复制命令覆盖它。先检查其中是否有未保存的自定义内容。

## 第三步：同步修改 Skill 名称

打开：

```text
local-skills/my-llm-wiki/SKILL.md
```

把 YAML frontmatter 中的 `name` 改为文件夹名称：

```yaml
---
name: my-llm-wiki
description: 使用自定义规则将异构文档挖掘成可追溯的知识库。
---
```

下面两个名称必须完全一致：

```text
文件夹名称      my-llm-wiki
SKILL.md name  my-llm-wiki
```

建议名称只使用小写字母、数字和连字符。不要保留 `name: llm-wiki`，否则新副本可能和官方 Skill 冲突，或被当成官方版本。

然后根据需要修改：

```text
local-skills/my-llm-wiki/SKILL.md
local-skills/my-llm-wiki/OKF_CONFIG.yaml
```

它们的职责不同：

- `SKILL.md` 决定 VikingBot 应该怎样阅读、分析、筛选、归纳和写作；
- `OKF_CONFIG.yaml` 决定目录层级、facet、meta_id、页面类型、frontmatter、派生视图和证据产物的硬约束。

## 第四步：安装前先校验

先让 CLI 检查目录结构、frontmatter 和 Skill 名称：

```bash
./target/debug/ov skills validate ./local-skills/my-llm-wiki
```

只有校验通过后再安装。常见错误包括：

- 文件夹名和 `SKILL.md` 的 `name` 不一致；
- 缺少 `SKILL.md`；
- YAML frontmatter 没有正确闭合；
- `description` 为空；
- 名称包含不支持的字符。

## 第五步：安装到 OpenViking

### 方案 A：安装到当前用户私有空间

```bash
./target/debug/ov add-skill ./local-skills/my-llm-wiki --wait
```

安装后的 URI 通常类似：

```text
viking://user/<当前用户>/skills/my-llm-wiki
```

### 方案 B：安装到共享 Agent 空间

如果需要让同一 OpenViking 服务上的其他用户或 Agent 共用：

```bash
./target/debug/ov add-skill \
  ./local-skills/my-llm-wiki \
  --parent-auto-create viking://agent/skills \
  --wait
```

也可以使用短参数：

```bash
./target/debug/ov add-skill \
  ./local-skills/my-llm-wiki \
  -p viking://agent/skills \
  --wait
```

安装后的 URI 是：

```text
viking://agent/skills/my-llm-wiki
```

远程 API Key 模式下，共享空间写入可能需要相应权限。不要在命令、日志或教程中输出明文 API Key。

## 第六步：确认安装结果和准确 URI

列出 Skill：

```bash
./target/debug/ov skills list
```

查看自定义 Skill：

```bash
./target/debug/ov skills show my-llm-wiki
```

必须从输出中复制真实 URI，不要根据用户名猜测。

后续命令推荐使用 Skill 目录 URI：

```text
viking://agent/skills/my-llm-wiki
```

服务端也接受 `SKILL.md` URI：

```text
viking://agent/skills/my-llm-wiki/SKILL.md
```

但统一使用目录 URI 更清晰。

## 第七步：推荐方式——直接挖掘本地文档

项目新增的 `ov knowledge-mining` 会自动完成本地文件收集、上传、OKF 配置写入、文档 Compile，以及可选的团队 Memory 增量 Compile。

只挖掘文档：

```bash
./target/debug/ov knowledge-mining \
  --documents /绝对路径/documents \
  --skill viking://agent/skills/my-llm-wiki \
  --okf-config ./local-skills/my-llm-wiki/OKF_CONFIG.yaml \
  --reason "按照 my-llm-wiki 的规则挖掘完整知识库，使用中文输出" \
  --wait
```

同时加入团队 Memory：

```bash
./target/debug/ov knowledge-mining \
  --documents /绝对路径/documents \
  --memory /绝对路径/team-memory \
  --skill viking://agent/skills/my-llm-wiki \
  --okf-config ./local-skills/my-llm-wiki/OKF_CONFIG.yaml \
  --reason "按照 my-llm-wiki 的规则挖掘完整知识库，使用中文输出" \
  --wait
```

如果不指定 `--to`，命令会自动创建隔离目标：

```text
viking://resources/knowledge-mining/<batch-id>/wiki
```

如果需要固定目标，可以显式指定：

```bash
--to viking://resources/my-custom-wiki
```

只有确定要增量更新已有知识库时，才复用旧的 `--to`。首次测试建议使用新目标，避免覆盖已有结果。

### 为什么必须显式传入自定义 OKF

`ov knowledge-mining --okf-config` 接受的是本地 YAML 路径：

```bash
--okf-config ./local-skills/my-llm-wiki/OKF_CONFIG.yaml
```

如果省略这个参数，`knowledge-mining` 会使用编译进 CLI 的官方默认 OKF，而不会自动读取自定义 Skill 文件夹中的 `OKF_CONFIG.yaml`。

因此只要修改过自定义 OKF，就必须显式传入。

## 第八步：底层方式——使用原始 ov compile

如果来源已经在 OpenViking 中，可以直接使用 `ov compile`。

假设来源是：

```text
viking://resources/my-source
```

先把本地 OKF 配置写入 OpenViking：

```bash
./target/debug/ov write \
  viking://resources/my-source/OKF_CONFIG.yaml \
  --from-file ./local-skills/my-llm-wiki/OKF_CONFIG.yaml \
  --mode upsert \
  --wait
```

然后执行 Compile：

```bash
./target/debug/ov compile \
  --from viking://resources/my-source \
  --to viking://resources/my-custom-wiki \
  --skill viking://agent/skills/my-llm-wiki \
  --okf-config viking://resources/my-source/OKF_CONFIG.yaml \
  --reason "按照 my-llm-wiki 的规则挖掘完整知识库，使用中文输出" \
  --wait
```

注意此时两个参数都必须使用 OpenViking URI：

```text
ov compile --skill       → viking:// Skill URI
ov compile --okf-config  → viking:// YAML 文件 URI
```

它们不能填写本地磁盘路径。

## 第九步：查看任务和结果

不使用 `--wait` 时，命令会返回 `cmp_...` task id。查看任务：

```bash
./target/debug/ov task status <cmp-task-id>
```

查看目标目录：

```bash
./target/debug/ov tree viking://resources/my-custom-wiki
```

读取导航页：

```bash
./target/debug/ov read viking://resources/my-custom-wiki/index.md
```

如果使用自动生成的目标 URI，以 `knowledge-mining` 命令最终输出的 `target_uri` 为准。

## 第十步：修改后更新已经安装的 Skill

修改本地 `SKILL.md` 或辅助文件后，OpenViking 中已经安装的副本不会自动变化。

先重新校验：

```bash
./target/debug/ov skills validate ./local-skills/my-llm-wiki
```

然后使用交互式更新：

```bash
./target/debug/ov skills update my-llm-wiki --wait
```

当 CLI 询问来源时，提供当前本地目录：

```text
./local-skills/my-llm-wiki
```

CLI 不会在非交互模式下盲目信任服务端记录的本地路径，这是为了防止另一台机器或旧路径被错误读取。

更新完成后再次查看：

```bash
./target/debug/ov skills show my-llm-wiki
```

如果无法确认现有 Skill 的来源或目标空间，不要直接删除再安装。先检查 `skills list` 和 `skills show`，避免删除团队正在使用的同名 Skill。

## 给本地 Codex 的标准执行清单

当用户要求“使用本地自定义 Skill 挖掘知识库”时，Codex 应按以下顺序执行：

1. 确认当前位于 OpenViking 仓库，不猜测工作目录。
2. 运行 `git status --short`，不要覆盖用户未提交的 Skill 修改。
3. 确认 `./target/debug/ov` 存在；不存在时执行 `cargo build -p ov_cli`。
4. 完整读取自定义 Skill 的 `SKILL.md` 和要使用的 `OKF_CONFIG.yaml`。
5. 确认文件夹名称与 `SKILL.md` 的 `name` 完全一致。
6. 运行 `./target/debug/ov skills validate <本地-skill-目录>`。
7. 运行 `skills list` 和 `skills show`，判断是首次安装还是更新。
8. 首次安装使用 `add-skill`；已有版本使用 `skills update`，不要擅自删除共享 Skill。
9. 从命令输出读取真实 `viking://.../skills/<name>` URI，不自行拼接用户名。
10. 使用 `knowledge-mining --skill <URI>` 时，显式传入自定义本地 OKF 文件。
11. 首次试跑使用新的目标 URI；只有用户明确要求增量更新时才复用已有 `--to`。
12. 记录并向用户报告 Skill URI、Compile task id、来源 URI、目标 URI和最终状态。
13. 不显示、复制或提交 API Key、模型密钥、用户私有数据和挖掘结果目录。

## 常见错误

### `name does not match directory name`

原因：文件夹名和 `SKILL.md` 的 `name` 不一致。

处理：统一两者后重新执行 `skills validate`。

### `--skill must resolve to a Skill directory or SKILL.md`

原因：把本地路径传给了 `ov compile --skill`，或者 Skill 尚未安装。

处理：先执行 `ov add-skill`，然后把安装结果中的 `viking://` URI 传给 `--skill`。

### 找不到 `knowledge-mining` 命令

原因：调用了 PATH 中的旧版 `ov`。

处理：使用当前项目的 Rust CLI：

```bash
./target/debug/ov knowledge-mining --help
```

### 修改 OKF 后目录结构没有变化

原因：运行 `knowledge-mining` 时没有显式传入自定义 OKF，本次任务仍使用 CLI 内置默认配置。

处理：加入：

```bash
--okf-config ./local-skills/my-llm-wiki/OKF_CONFIG.yaml
```

### 修改本地 Skill 后挖掘行为没有变化

原因：只修改了本地文件，没有更新 OpenViking 中已经安装的副本。

处理：重新校验并执行 `skills update my-llm-wiki --wait`。

### Skill 能找到但 Compile 在 `loading_skill` 失败

处理顺序：

1. `skills show my-llm-wiki` 检查实际安装内容；
2. `skills validate <本地目录>` 检查本地版本；
3. 确认 `--skill` 使用的是正确身份和命名空间下的 URI；
4. 检查当前 CLI 连接的服务、account 和 user 是否与安装时一致。

## 当前仓库相关源码

```text
examples/compile/ov-compile-skills/llm-wiki/SKILL.md
examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml
crates/ov_cli/src/commands/skills.rs
crates/ov_cli/src/commands/knowledge_mining.rs
crates/ov_cli/src/commands/compile.rs
bot/vikingbot/compile/service.py
```

知识挖掘内部执行过程的完整说明见：

```text
docs/zh/context-compilation/07-knowledge-mining-runtime-report.md
```

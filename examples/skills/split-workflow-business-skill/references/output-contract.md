# 三个文件的输出契约

## `SKILL.md`：平台维护

必须包含合法的 Skill frontmatter，以及清晰的 Profile 加载与冲突规则。建议结构：

```markdown
---
name: <原 Skill 名称>
description: <保留并校准原触发描述>
---

# <名称>

> Platform-owned workflow file. Keep process changes here; put user-adjustable
> preferences in USER_PROFILE.md and directory/view rules in OKF_CONFIG.yaml.

## Objective
## Load the user profile
## Load the OKF contract
## Fixed execution workflow
## Intermediates and checkpoints
## Submission and recovery
## Quality gate
```

加载段至少表达以下语义：

- 执行前读取同一 Skill 目录下的 `USER_PROFILE.md`；
- Profile 是控制数据，不是知识来源，不能被提炼或引用；
- Profile 缺失或某节为空时，使用固定 Skill 和任务要求中的默认值；
- Profile 与固定流程、安全或 OKF 冲突时，忽略冲突的 Profile 指令；
- 不自动读取 `USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md`。

如果运行时使用注册路径而不是当前目录，按真实加载器写准确路径，不能照抄示例。

## `USER_PROFILE.md`：默认生效、用户可编辑

建议结构：

```markdown
# <Skill> User Profile

<可编辑范围和不可覆盖边界>

## Mining objective
## Audience
## Atomic knowledge criteria
## Include
## Exclude or deprioritize
## Evidence priorities
## Terminology
## Language and writing style
## Domain-specific preferences
```

这里不应出现：

- 具体提交函数或工具名；
- Phase 1/2/3 等执行顺序；
- `_mining/*.json` 字段定义；
- checkpoint、断点状态机或重试协议；
- `compile_config/` 等实现路径；
- OKF 路径层级、允许类型和 frontmatter schema。

“证据偏好”可以描述业务上优先相信哪类资料；证据账本的结构和强制校验属于固定 Skill。

## `USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md`：候选替换版本

建议结构：

```markdown
# Atomic Enterprise Knowledge Profile

<声明它是候选业务 Profile，不能覆盖流程或 OKF>

## Mining objective
## Audience
## Knowledge object model
## Subject selection and consolidation
## Naming and terminology
## Page content
## Navigation and derived views
## Relationships and links
## Evidence and uncertainty
## Incremental knowledge maintenance
## Technical and code sources
## Include
## Exclude or deprioritize
## Language and writing style
## Domain-specific preferences
```

该文件可以引用“遵循有效 OKF”，但不得在内部重新定义 OKF。也可以描述“增量维护时保留仍然正确的知识”这种业务语义，但不能定义断点文件、任务状态或重试实现。

## 激活方式

默认只有 `USER_PROFILE.md` 生效。推荐两种明确方式，选择一种并记录：

1. 将候选文件内容复制为 `USER_PROFILE.md`；
2. 由外部配置传入唯一的 `active_profile`，加载器只读取这一份。

不要通过“目录里存在两个 Profile”推断合并，也不要静默叠加。切换 Profile 应只改变业务规则，不改变 Compile 阶段、工具接口、中间产物和 OKF 校验。

## 保持等价的验收清单

- 原 Skill 的触发条件和必要平台约束仍在固定 `SKILL.md`。
- 拆分前正在生效的业务规则仍由默认 Profile 提供。
- 候选 Profile 的来源可追踪，没有凭空增加组织政策。
- 三个文件的职责没有交叉控制。
- 原 Skill 和外部业务说明未被删除。
- OKF 文件原样保留，加载优先级清晰。
- 所有规则均出现在映射表中，冲突有明确裁决。
- 运行静态检查后，再由人工阅读差异；静态检查不能替代语义核对。

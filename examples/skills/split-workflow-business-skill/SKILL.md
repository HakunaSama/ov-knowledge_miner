---
name: split-workflow-business-skill
description: Split a mixed Agent Skill into a protected workflow SKILL.md, an active user-editable USER_PROFILE.md, and an optional drop-in USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md without losing rules or moving OKF format contracts into user configuration. Use when a knowledge-mining Skill mixes execution stages, tools, validation, audit artifacts, safety rules, and user-adjustable business preferences, or when reproducing the OpenViking llm-wiki three-file separation pattern.
---

# 拆分流程 Skill 与业务 Profile

把混合在一个文件里的流程机制和业务偏好拆开，同时保持当前有效行为。输出目录至少包含：

```text
<skill-directory>/
├── SKILL.md
├── USER_PROFILE.md
└── USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md
```

现有 `OKF_CONFIG.yaml` 是独立的格式与目录契约；保留它，但不要把它并入三个输出文件。

## 拆分前

1. 完整读取原 Skill、相关业务说明、OKF 配置和加载该 Skill 的代码。
2. 确认哪个 Profile 当前生效。默认约定只有 `USER_PROFILE.md` 生效；原子企业知识 Profile 是候选替换文件，不得同时隐式加载两份 Profile。
3. 除非用户明确要求原地修改，否则新建相邻目录进行拆分，不删除或覆盖原文件。
4. 阅读 [分类与映射规则](references/classification-and-mapping.md) 和 [三个文件的输出契约](references/output-contract.md)。

## 执行拆分

### 1. 建立规则清单

逐段提取原文中的有效规则，为每条规则分配 ID。混合句子按子句拆开，不要因为一个段落同时包含流程和业务内容就整段复制到两个文件。

在工作记录中维护以下映射：

```text
规则 ID | 原位置 | 规则摘要 | 分类 | 目标文件/章节 | 处理方式 | 验证结果
```

忽略纯说明性重复文本，但不能遗漏会改变执行、输出、质量或用户偏好的规则。

### 2. 写固定的 `SKILL.md`

保留平台或产品必须控制的内容：

- 阶段顺序、工具调用、输入输出协议和恢复机制；
- 覆盖率、候选知识、证据、提交和质量门禁；
- 中间产物的文件名、结构、生成与消费规则；
- 安全边界、只读约束和不可覆盖的正确性要求；
- OKF 的发现、加载、优先级和校验方式；
- Profile 的加载方式、优先级和冲突处理方式。

把组织偏好、受众、选材和文风从这里移出。少量不可放宽的知识质量底线可以留在固定 Skill，但要明确它们是验证约束，不是用户偏好。

### 3. 写生效的 `USER_PROFILE.md`

只保留用户可以安全调整的业务控制项：挖掘目标、受众、原子知识判断、纳入与排除、证据偏好、术语、语言、文风和领域偏好。

如果原 Skill 中的业务规则当前正在生效，就把这些规则放入这里，以保持拆分前后的有效行为。不要在 Profile 中出现工具名、阶段顺序、中间产物 JSON 结构、提交接口或代码路径。

### 4. 写候选原子知识 Profile

将输入中更完整的“原子化企业知识”业务政策整理到 `USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md`。它可以比默认 Profile 更详细，覆盖知识对象模型、选题合并、内容表达、关系、增量维护及技术资料偏好，但仍然只能描述“产出什么知识、以何种业务标准表达”。

它默认不生效。只有用户明确选择替换默认 Profile，或系统提供明确的单 Profile 选择参数时才启用。输入材料没有对应规则时，不得凭空创造组织政策；应保留通用规则并在交付说明中指出证据不足。

### 5. 声明优先级

在固定 Skill 中明确：

```text
平台与安全约束 > 固定 Compile 流程 > 有效 OKF 格式契约 > 当前用户 Profile
```

两个 Profile 都要声明自己不能覆盖固定流程、安全要求、提交协议、审计机制或有效 OKF。

## 验证等价性

1. 用规则清单反查，确保每条有效规则都有去向；允许必要的边界声明重复，其他重复必须说明原因。
2. 确认默认 Profile 是唯一自动加载的业务 Profile，候选 Profile 不会悄悄改变当前行为。
3. 确认 OKF 的目录、视图、frontmatter 和路径类型规则仍只由 OKF 管理。
4. 确认 Profile 不包含执行阶段、工具、审计 JSON 或提交门禁。
5. 确认固定 Skill 不再混入组织特定的主题清单、文风喜好或临时业务目标。
6. 在新 Skill 目录运行：

```bash
python3 scripts/verify_split.py <拆分结果目录> --strict
```

7. 查看差异并进行两个情景检查：使用默认 Profile 时原有有效行为不丢失；切换到原子知识 Profile 时只改变业务选材与表达，不改变流程、接口和校验。

“等价”指规则覆盖、加载关系和约束优先级等价；生成式任务不承诺两次输出逐字一致。

## 交付内容

向用户报告三个新文件的绝对路径、当前生效的 Profile、原文件是否保持不变、验证命令结果，以及任何无法可靠归类或缺少来源的规则。不要自动删除旧 Skill，也不要未经请求切换生效 Profile。

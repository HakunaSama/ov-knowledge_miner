const workspace = {
  appShell: {
    footer: {
      agentIntegrations: 'Agent 接入',
      connection: '连接设置',
      docs: '文档站',
      github: 'GitHub',
      sdkApi: 'SDK 与 API',
      users: '用户管理',
    },
    header: {
      currentUser: {
        account: 'Account',
        accountSummary: 'Account · {{account}}',
        openMenu: '查看当前用户 {{user}}',
        signedInAs: '当前数据访问身份',
        unset: '未设置',
        user: 'User',
      },
      defaultTitle: 'OpenViking Studio',
    },
    navigation: {
      home: {
        title: '首页',
      },
      knowledgeMining: {
        title: '知识挖掘',
      },
      crossDeviceVerify: {
        title: 'OAuth 验证',
      },
      operations: {
        title: '运维',
      },
      requestLogs: {
        title: '请求日志',
      },
      monitoring: {
        title: '监控',
      },
      skills: {
        title: '技能',
      },
      tasks: {
        title: '任务中心',
      },
      watches: {
        title: '定时同步',
      },
      retrieval: {
        title: '检索',
      },
      sessions: {
        title: '会话',
      },
      playground: {
        title: '实验场',
      },
    },
    sidebar: {
      groups: {
        operations: '活动',
        resources: '资源',
        settings: '设置',
        workspace: '工作区',
      },
      loadingSessions: '加载中...',
      noSessions: '暂无会话',
      workspaceGroupLabel: 'OpenViking Studio',
    },
  },
  knowledgeMining: {
    eyebrow: 'VikingBot · LLM Wiki',
    title: '知识挖掘',
    description:
      '把每项知识构造成一个由 what / why / how 三页组成的元知识，再用团队 Memory 和人工问卷答案增量更新同一知识库；主视图、知识域和使用场景始终浏览同一批知识文件。',
    history: {
      current: '当前查看',
      description:
        '切换后会加载该次任务的完整进度、知识目录、来源覆盖、中间产物、人工问卷和知识点阵；运行中的任务也会持续更新。',
      newJob: '新建挖掘',
      sources: '{{count}} 份来源',
      sourcesUnknown: '来源清单见详情',
      title: '挖掘历史',
      untitled: '未命名的知识挖掘任务',
    },
    cliImport: {
      title: '导入并展示 CLI 挖掘结果',
      description:
        '复用当前完整结果界面渲染 ov compile 产物，无需重新挖掘。支持自动发现同一服务上的 llm-wiki CLI 任务、挂载已有 Viking URI，或上传从其他服务导出的 OVPack。',
      discoveredBadge: '已发现 {{count}} 个 CLI 结果',
      discovery: {
        title: '同一服务自动发现',
        description:
          '网页会从 Compile 历史中识别 llm-wiki CLI 任务，并自动加入上方挖掘历史；运行中结果也会持续更新。',
      },
      uri: {
        title: '挂载已有结果 URI',
        description:
          '适用于结果仍在当前 OpenViking 服务、但 Compile 历史已不可见的情况。系统会校验 index.md、知识页面和中间产物。',
        label: 'CLI 结果 Viking URI',
        placeholder: 'viking://resources/research-wiki',
        action: '校验并展示这个结果',
      },
      ovpack: {
        title: '上传 CLI 结果 OVPack',
        description:
          '适用于从另一套 OpenViking 服务迁移结果。先用 CLI 导出目标目录，再在这里上传；文件会导入独立目录。',
        command: 'ov export <to-uri> result.ovpack',
        action: '选择并导入 .ovpack',
      },
      origins: {
        cli: 'CLI 结果',
        imported: '已导入结果',
      },
      success: {
        uri: 'CLI 结果已校验并加入挖掘历史。',
        ovpack: 'OVPack 已导入，CLI 挖掘结果可以开始浏览。',
      },
      readOnlyTitle: '导入结果以审阅模式展示',
      readOnly:
        '当前页面会完整展示问卷，但不会直接对导入结果发起人工增量 Compile。需要继续处理时，请在原 CLI 环境中对同一 to URI 执行增量挖掘。',
    },
    upload: {
      title: '上传知识来源',
      description: '同一批文档会放入独立的来源目录，不会覆盖其他批次。',
      dropzone: '拖放文件到这里，或点击选择',
      formats:
        '支持 PDF / MD / DOC / DOCX / XLS / XLSX，文件数量不限，单个不超过 {{size}}',
      folder: {
        title: '一次导入整个资源文件夹',
        choose: '选择资源文件夹',
        hint: '递归读取所有子目录，并按 documents 与 team-memory 目录自动分类；其他清单文件会跳过。',
        selected: '已选择 {{documents}} 份文档、{{memory}} 份团队 Memory',
        summary:
          '文件夹读取完成：{{documents}} 份文档、{{memory}} 份团队 Memory，跳过 {{skipped}} 个无关文件。',
      },
    },
    okfConfig: {
      label: 'OKF 格式配置',
      defaultName: '内置 OKF_CONFIG.yaml（默认）',
      choose: '选择配置',
      useDefault: '恢复默认 OKF 配置',
      hint: '可选上传 YAML 配置，指定单一事实主视图、what/why/how 末层、派生视图、证据链、中间产物、跨知识库引用和 WikiLink 规则。',
    },
    memory: {
      title: '团队 Memory（可选增量来源）',
      description:
        'Memory 不会与文档一起参与首轮挖掘。文档 Compile 完成后，系统会自动执行第二次 Compile：from 指向团队 Memory，to 仍指向首轮知识库。',
      dropzone: '拖放团队 Memory 文件，或点击选择',
      formats: '支持 MD / TXT / JSON / YAML；不上传则只执行文档挖掘。',
      incrementalReason:
        '这是团队 Memory 增量更新阶段。请完整检查现有目标知识库，以团队 Memory 为新增证据更新、补充或纠正已有页面；“现在”“从 X 改为 Y”等表述代表新事实取代旧事实，必须修订所有受影响的当前事实，不能只追加来源或另建洞察而保留过期表述。保留仍然准确的文档知识、出处、WikiLink 和所有配置视图标签，避免重复页面。',
      pipeline: {
        documents: '1 · 文档生成主知识库',
        incremental: '2 · 团队 Memory 增量更新',
      },
    },
    reason: {
      label: '挖掘目标',
      default:
        '将这些文档整理成便于团队检索和复用的 OKF 知识库。提取关键实体、概念、综合结论与关系，保留重要结论的出处，并使用中文输出。',
      placeholder: '说明分析问题、受众、范围、语言与侧重点……',
      hint: '这段内容会作为 ov compile 的 reason。llm-wiki Skill 决定产物结构，这里决定本次挖掘的具体方向。',
    },
    actions: {
      start: '开始知识挖掘',
      running: '正在挖掘……',
      queued: '已加入挖掘队列',
      cancel: '取消 Compile 任务',
      cancelQueued: '取消排队',
      resume: '从检查点恢复挖掘',
      resuming: '正在恢复……',
      resumeAccepted: '恢复任务已创建，将复用已上传来源和可用检查点。',
      newJob: '新建挖掘任务',
      removeFile: '移除 {{name}}',
    },
    status: {
      title: '任务进度',
      vikingBot: '知识整理由 OpenViking 内置 VikingBot 的独立 AgentLoop 执行。',
      taskId: '任务 ID',
      documentTaskId: '文档任务',
      memoryTaskId: 'Memory 任务',
      humanTaskId: '人工补充',
      queuePosition: '队列位置',
      pending: '等待文档任务完成',
      skipped: '未配置',
      skill: 'Skill',
      okfConfig: 'OKF 配置',
      output: '产物目录',
      cancelledDescription: '任务已取消。已保存的阶段检查点可以继续恢复。',
    },
    phases: {
      idle: '待开始',
      preparing: '准备环境',
      uploading: '解析文档',
      queued: '等待挖掘',
      compiling_documents: '文档知识挖掘',
      compiling_memory: 'Memory 增量更新',
      compiling_human: '人工知识增量更新',
      awaiting_human: '等待人工知识补证',
      partial: '部分结果 · 未通过校验',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    },
    stages: {
      idle: '等待上传',
      preparing: '检查 VikingBot 并准备 llm-wiki Skill',
      uploading: '上传、解析和生成语义索引',
      queued: '来源已隔离保存，等待前序完整流程结束',
      compiling: '等待 VikingBot',
      compiling_documents: '等待文档 Compile',
      compiling_memory: '等待团队 Memory 增量 Compile',
      compiling_human: '等待人工问卷答案增量 Compile',
      awaiting_human: '发现冲突或证据缺口，等待人工补证后继续',
      loading_skill: '加载 llm-wiki Skill',
      collecting_context: '收集来源与目标上下文',
      agent: 'VikingBot 正在阅读、归纳和写作',
      source_coverage: '阶段 1/3 · 校验逐文档覆盖账本',
      candidate_knowledge: '阶段 2/3 · 校验候选知识账本',
      page_generation: '阶段 3/3 · 生成知识页面',
      rendering: '验证并渲染 Wiki 产物',
      writing: '写入 OpenViking 目标目录',
      refreshing: '生成语义侧车并刷新索引',
      salvaging: '保存可用的阶段性产物',
      completed: '知识 Wiki 已就绪',
      cancelled: '任务已取消',
      failed: '任务执行失败',
    },
    results: {
      title: '挖掘结果',
      description:
        '任务完成后，可在这里浏览 llm-wiki 生成的导航页、实体页、概念页与综合页。',
      completed: '已生成或更新 {{count}} 个 Wiki 页面。',
      awaitingHuman:
        '已生成可审阅的阶段性知识，并暂停在人工补证门禁；提交答案后才会完成最终知识库。',
      partialTitle: '这是抢救保存的部分结果',
      partialBadge: 'SALVAGED · 未通过校验',
      partial:
        '任务没有通过完整 OKF 校验，系统已停止后续 Memory 或人工增量阶段。可浏览已保存页面、中间账本和派生视图，但不能将它视为最终知识库。',
      waitingTitle: 'VikingBot 正在工作',
      waitingDescription:
        '长程挖掘默认没有一小时硬截止。可以关闭或刷新页面；阶段检查点会持久化，并可在失败或取消后继续恢复。',
      queuedTitle: '当前排在第 {{position}} 位',
      queuedDescription:
        '文档和团队 Memory 已保存到本任务的独立目录。前序任务的文档、Memory 与人工补证流程结束后，VikingBot 会自动开始本任务。',
      emptyTitle: '还没有挖掘结果',
      emptyDescription:
        '选择文档、填写挖掘目标并开始任务，结果会作为持久化 OpenViking Resource 保存。',
    },
    views: {
      label: '知识组织视图',
      main: '主视图',
      mainDescription:
        '主视图严格对应 OpenViking 目标目录中的真实文件结构；其他视图只按 OKF tags 重组同一批页面，不复制知识。',
      mainStructure:
        '当前顶层按 {{categories}} 分区，各分区下保持视图目录结构。',
      metaSummary:
        '当前共 {{units}} 个元知识、{{files}} 个知识文件；主视图、知识域和使用场景的文件总数严格一致。',
      incompleteMetaSummary:
        '这个旧结果中有 {{count}} 个元知识缺少 what / why / how 页面。界面不会伪造缺失页；请重新执行挖掘以生成完整三元组。',
      emptyGroup: '该分组暂时没有页面。',
      leafLabels: {
        what: '是什么',
        why: '为什么',
        how: '怎么做',
      },
      guides: {
        contentLabel: '这里包含什么',
        useLabel: '什么时候使用',
        main: {
          title: '主视图：按 what / why / how 浏览真实文件',
          purpose:
            '这是唯一事实源，直接对应 OpenViking 中真正保存的文件夹和文件，不是按标签生成的副本。',
          content:
            '顶层固定分为 what（是什么）、why（为什么）和 how（怎么做），每个顶层目录下继续遵循 OKF 视图目录结构；根导航页不计入知识文件。',
          use: '需要理解知识边界、浏览完整目录，或确认某条知识实际保存在哪里时使用。',
        },
        domain: {
          title: '知识域：元知识的主要主题归属',
          purpose:
            '知识域回答“这项元知识主要属于哪个主题领域”。它只改变整组 what / why / how 的展示位置，不新增、复制或拆散任何文件。每个元知识只选一个主要知识域。',
          content: '人员与组织、产品与系统、流程与方法、决策与洞察等主题分组。',
          use: '已知自己想了解哪个业务或技术领域，希望横向浏览相关知识时使用。',
        },
        usage: {
          title: '使用场景：按要完成的工作重新分组',
          purpose:
            '它回答“这项元知识主要用于完成什么工作”。每个元知识只选一个主要场景，并整体移动同一组 what / why / how，不会重复显示文件。',
          content:
            '新人入门、规划与决策、执行与协作、排障与风险、参考查询等任务分组。',
          use: '面对具体任务，希望快速找到能直接帮助当前工作的知识时使用。',
        },
        graph: {
          title: '知识点阵云图：元知识与关系的空间视图',
          purpose:
            '直接复用 OpenViking knowledge-graph 示例的 KG Explorer HTML，把元知识、what/why/how 页面、WikiLink 和跨知识引用适配成官方图谱数据。',
          content:
            '保留官方的 D3 力导向布局、类型筛选、关系图例、检索、邻居聚焦、证据链和实体检查器；颜色与形状区分元知识及各知识切面。',
          use: '需要发现知识簇、孤立页面、跨元知识联系和知识库整体结构时使用。',
        },
        coverage: {
          title: '来源覆盖：每份上传材料的处理去向',
          purpose:
            '逐项核对上传、实际检查、直接引用、合并和跳过数量；这是 Compile 提交前的硬门禁。',
          content:
            '每个上传级文档的处理状态、引用页面、合并目标或具体跳过原因。',
          use: '需要确认是否漏读文件、解释产出数量，或审计某份材料为何没有形成独立元知识时使用。',
        },
        intermediates: {
          title: '中间产物：知识挖掘的审计证据',
          purpose:
            '这些不是正式知识页，而是 VikingBot 如何读取、判断、发现冲突并生成知识的可检查记录。',
          content:
            '运行清单、逐页证据账本、冲突与证据缺口报告，以及结构化调查问卷。',
          use: '需要追溯结论来源、检查遗漏、审计生成过程或定位为什么提出某个问题时使用。',
        },
        questionnaire: {
          title: '人工调查：最终完成前的知识补证门禁',
          purpose:
            '当来源存在冲突或缺少关键证据时，流程会在这里暂停；VikingBot 不会自行猜测后直接宣布完成。',
          content:
            '只包含会实质影响知识可靠性的待确认问题，以及每个问题对应的冲突、缺口和影响。',
          use: '由了解事实的团队成员补充可验证答案；提交后 VikingBot 才继续修订并完成知识库。',
        },
      },
    },
    graph: {
      title: '知识点阵',
      legend: '知识图例',
      interactionHint:
        '官方 KG Explorer：拖动画布、滚轮缩放、检索实体并单击查看关系与证据链。',
      nodeCount: '{{count}} 个节点',
      edgeCount: '{{count}} 条关系',
      reset: '重置视图',
      openPage: '打开知识正文',
      emptyTitle: '暂无可绘制的知识节点',
      emptyDescription:
        '完成知识挖掘并生成元知识页面后，这里会显示知识点阵关系图。',
      types: {
        meta: '元知识',
        what: 'What · 是什么',
        why: 'Why · 为什么',
        how: 'How · 怎么做',
        external: '外部知识',
      },
    },
    intermediates: {
      title: '中间产物',
      description:
        '查看候选知识、逐文档阅读覆盖、跨阶段证据历史、冲突与证据缺失，以及人工补充问卷。',
      kinds: {
        run_manifest: '运行清单',
        evidence_ledger: '证据账本',
        investigation_report: '调查报告',
        questionnaire: '调查问卷',
        source_coverage: '来源覆盖',
        candidate_knowledge: '候选知识',
        readlist: '逐文档阅读账本',
        evidence_history: '跨阶段证据历史',
      },
      candidates: '候选知识总数',
      promoted: '已晋升为元知识',
      readCoverage: '必读片段覆盖',
      documentCoverage: '逐文档完成',
    },
    coverage: {
      title: '来源覆盖',
      uploaded: '已上传',
      inspected: '已检查',
      cited: '已引用',
      merged: '已合并',
      skipped: '已跳过',
      reason: '原因',
      mergedInto: '合并到',
      outputs: '产出',
      loadError: '无法加载来源覆盖记录',
      legacyTitle: '旧结果没有来源覆盖记录',
      legacyDescription:
        '这次结果生成于来源覆盖门禁启用之前；重新执行知识挖掘后会逐项记录每份上传材料。',
    },
    provenance: {
      sources: '来源与中间证据',
      knowledgeLinks: '正文位置关联的跨知识关系（多对多）',
      knowledgeLinksHint:
        '同一知识页可在不同段落关联多个知识目标，同一目标也可被多个页面引用；正文中的链接表示实际引用位置。',
      linkContext: '引用位置：{{context}}',
      noKnowledgeLinks: '该页面正文没有声明跨知识库关系。',
    },
    questionnaire: {
      title: '人工调查',
      description:
        'VikingBot 不会擅自裁决未解决的冲突或补造缺失证据；请回答问卷，再将答案作为新的人工证据增量写回同一知识库。',
      incrementalReason:
        '这是人工知识补充增量阶段。问卷答案是新的 human-answer 证据；请解决对应冲突或证据缺口，更新受影响页面、证据账本、调查报告和问卷状态，to 必须保持同一知识库。',
      needsInput: '需要人工知识补充',
      clear: '未发现待补充问题',
      conflict: '证据冲突',
      evidenceGap: '证据缺失',
      loadError: '无法加载调查问卷',
      formTitle: '知识补充问卷',
      formDescription:
        '当前知识库仍处于“待补证”状态。答案会保存为人工证据并触发增量 Compile；只有冲突和缺口处理完成后，本次挖掘才标记为完成。',
      answerPlaceholder: '填写可验证的答案、时间范围和依据……',
      submit: '提交答案并增量更新',
      answered: '人工问题已处理',
      answeredDescription:
        '问卷历史已保留；答案作为 human-answer 来源写入，当前调查报告已更新。',
      noQuestions: '当前不需要人工补充',
      noQuestionsDescription: '调查报告为 clear，问卷中没有未解决问题。',
    },
    errors: {
      title: '任务失败',
      botUnavailable:
        '无法连接 VikingBot。请确认 OpenViking 服务已使用 --with-bot 启动，并检查模型配置。',
      unsupportedFile: '{{name}} 不是支持的文档格式。',
      unsupportedMemoryFile: '{{name}} 不是支持的团队 Memory 格式。',
      fileTooLarge: '{{name}} 超过单文件上限 {{size}}。',
      compileFailed: 'VikingBot Compile 执行失败。',
      resultLoad: '无法读取结果目录',
      pageLoad: '无法读取 Wiki 页面',
      missingJob: '当前知识挖掘任务不存在，无法提交人工答案。',
      incompleteQueueJob:
        '排队任务缺少 Skill 或 OKF 配置，无法安全启动。请新建任务并重新上传。',
      queueBusy:
        '当前仍有正在执行或排队的挖掘任务。为保证严格串行，暂时不能恢复这个检查点。',
    },
    queue: {
      added: '数据已独立保存并加入挖掘队列。',
      badge: '排队中 · 第 {{position}} 位',
      position: '第 {{position}} 位',
      started: '队列任务已开始：{{name}}',
    },
  },
  monitoringPage: {
    title: '监控',
    description: '查看 OpenViking 各组件的实时健康状态。',
    version: 'v{{version}}',
    refresh: '刷新',
    updatedAt: '更新于 {{time}}',
    loading: '正在加载监控数据...',
    loadFailed: '监控数据加载失败',
    health: {
      healthy: '正常',
      unhealthy: '异常',
    },
    summary: {
      healthy: '所有组件运行正常',
      unhealthy: '部分组件需要关注',
      components: '{{healthy}} / {{total}} 个组件正常',
    },
    tabs: {
      label: '监控类型',
      overview: '总览',
      queue: '任务队列',
      vikingdb: 'VectorDB',
      models: '模型',
      filesystem: '文件系统',
      lock: '锁',
      retrieval: '检索',
    },
    detail: {
      noData: '暂无监控数据',
      descriptions: {
        queue: '资源处理、语义生成和会话提交队列。',
        vikingdb: '向量数据存储与索引服务。',
        models: 'VLM、Embedding 和 Rerank 模型服务。',
        filesystem: 'OpenViking 文件系统与挂载点。',
        lock: '事务锁与并发控制服务。',
        retrieval: '上下文检索服务。',
      },
    },
    offline: {
      title: '尚未连接 OpenViking 服务',
      description: '配置服务地址和访问凭证后即可查看监控数据。',
      action: '打开连接设置',
    },
  },
  skillsPage: {
    title: '技能',
    description: '查看当前用户和当前空间可用的 Agent 技能。',
    refresh: '刷新',
    loading: '正在加载技能...',
    empty: '暂无可用技能',
    emptyDescription: '添加技能后，会按用户技能和共享技能分开展示。',
    emptyScope: '暂无{{scope}}',
    emptyScopeDescription: '添加对应作用域的技能后，会在这里展示。',
    loadFailed: '技能加载失败',
    networkError: '无法连接 OpenViking 服务，请检查服务地址和连接状态。',
    connectionSettings: '打开连接设置',
    detail: '详情',
    openPlayground: '在 Playground 打开',
    viewDetail: '查看 {{name}} 详情',
    detailLoading: '正在加载技能详情...',
    detailLoadFailed: '技能详情加载失败',
    directory: '目录',
    none: '无',
    metrics: {
      files: '文件',
      scope: '作用域',
    },
    sections: {
      allowedTools: '允许工具',
      content: 'SKILL.md',
      description: '简介',
      files: '文件',
      overview: 'Overview',
      tags: '标签',
    },
    scopes: {
      user: '用户技能',
      agent: '共享技能',
    },
    tabs: {
      agent: '共享技能',
      label: '技能作用域',
      user: '用户技能',
    },
  },
  tasksPage: {
    title: '任务中心',
    description: '集中查看资源处理、会话提交和 Reindex 等后台任务。',
    refresh: '刷新',
    loading: '正在加载任务...',
    empty: '暂无后台任务',
    emptyDescription: '异步任务启动后，会在这里显示执行状态和更新时间。',
    emptyFiltered: '没有匹配的任务',
    emptyFilteredDescription: '可以调整或清除筛选条件后重新查看。',
    loadFailed: '任务加载失败',
    detail: {
      title: '任务详情',
      loading: '正在加载任务详情...',
      loadFailed: '任务详情加载失败',
      retry: '重试',
      openLabel: '查看任务 {{taskId}} 的详情',
      fields: {
        status: '任务状态',
        type: '任务类型',
        stage: '当前阶段',
        resource: '关联资源',
        createdAt: '创建时间',
        updatedAt: '更新时间',
      },
      error: '失败原因',
      result: '执行结果',
      noResult: '暂无执行结果',
      noResultDescription: '任务完成后，接口返回的结果会显示在这里。',
      noResultFailedDescription: '该任务未返回结果，请查看上方失败原因。',
      noResultCancelledDescription: '该任务已取消，未返回执行结果。',
    },
    filters: {
      label: '筛选',
      type: '任务类型',
      status: '任务状态',
      allTypes: '全部类型',
      allStatuses: '全部状态',
      clear: '清除筛选',
    },
    pagination: {
      next: '下一页',
      page: '第 {{page}} 页',
      pageSize: '每页条数',
      pageSizeValue: '每页 {{count}} 条',
      previous: '上一页',
      scope: '当前展示最近 {{count}} 条任务（接口最多返回 {{limit}} 条）',
    },
    table: {
      task: '任务',
      type: '类型',
      resource: '关联资源',
      createdAt: '创建时间',
      status: '状态',
    },
    status: {
      cancelled: '已取消',
      cancelling: '取消中',
      completed: '已完成',
      failed: '失败',
      pending: '等待中',
      running: '进行中',
      unknown: '未知',
    },
    types: {
      session_commit: '会话提交',
      add_resource: '资源处理',
      add_skill: '技能导入',
      connector_import: '连接器导入',
      admin_reindex: 'Reindex',
      snapshot_restore_reindex: '快照恢复索引',
      legacy_migration: '旧数据迁移',
      legacy_cleanup: '旧数据清理',
    },
  },
  watchesPage: {
    title: '定时同步',
    description: '通过 Watch 任务定期检查远程资源更新，并集中管理同步计划。',
    refresh: '刷新',
    add: '添加',
    adding: '添加中...',
    loading: '正在加载定时同步...',
    loadFailed: '定时同步加载失败',
    empty: '暂无定时同步',
    emptyDescription: '添加远程资源并开启定时同步后，会在这里显示。',
    never: '尚未同步',
    cancel: '取消',
    save: '保存',
    creation: {
      title: '正在创建定时同步',
      description: '资源已提交到后台，列表会自动刷新，请稍候。',
    },
    columns: {
      resource: '资源',
      source: '来源',
      status: '状态',
      interval: '同步周期',
      lastRun: '上次同步',
      nextRun: '下次同步',
      actions: '操作',
    },
    status: {
      active: '已启用',
      disabled: '已关闭',
    },
    actions: {
      trigger: '立即同步',
      syncing: '同步中...',
      disable: '关闭',
      enable: '启用',
      more: '更多',
      history: '处理记录',
      edit: '编辑',
      delete: '删除',
    },
    interval: {
      minutes_one: '每分钟',
      minutes_other: '每 {{count}} 分钟',
      hours_one: '每小时',
      hours_other: '每 {{count}} 小时',
      days_one: '每天',
      days_other: '每 {{count}} 天',
    },
    addDialog: {
      title: '添加定时同步',
      description: '添加远程资源，并设置 OpenViking 检查更新的周期。',
    },
    editDialog: {
      title: '编辑定时同步',
      interval: '同步周期（分钟）',
      intervalHint: '例如每小时填写 60，每天填写 1440。',
      reason: '添加原因（可选）',
      reasonPlaceholder: '为什么要持续同步这个资源？',
      instruction: '处理指令（可选）',
      instructionPlaceholder: '针对该资源的特殊处理指令。',
    },
    deleteDialog: {
      title: '删除定时同步？',
      description: '资源 {{uri}} 会继续保留，但不会再自动同步更新。',
    },
    history: {
      title: '处理记录',
      description:
        '按当前资源筛选后台处理任务，其中可能包含首次导入、手动处理和定时同步。',
      loading: '正在加载处理记录...',
      loadFailed: '处理记录加载失败',
      empty: '暂无处理记录',
      emptyDescription: '该资源暂时没有可查询的后台处理任务。',
      stage: '处理阶段',
    },
    toast: {
      creating: '正在创建定时同步，请稍候...',
      created: '定时同步已添加',
      createTimeout: '暂未查询到新任务，请稍后手动刷新',
      updated: '定时同步已更新',
      triggered: '同步任务已调度',
      deleted: '定时同步已删除',
    },
  },
  accountSwitcher: {
    create: '新建 Account',
    dialog: {
      accountLabel: 'Account',
      accountPlaceholder: 'team-account',
      adminLabel: '初始 Admin user',
      cancel: '取消',
      description:
        '创建一个新的空间和首个管理员。创建完成后将自动切换到该空间。',
      submit: '创建并切换',
      title: '新建 Account',
    },
    empty: '没有匹配的 Account',
    errors: {
      loadAccounts: '加载 Account 失败',
      noCreatedKey: 'Account 已创建，但服务端没有返回可用于切换的数据凭证。',
      noUsableKey: '该 Account 没有可用于数据访问的明文 User API Key。',
      noUsers: '该 Account 下没有可用用户。',
    },
    loading: '正在加载 Accounts...',
    manualSwitch: {
      description:
        '服务端没有返回 {{account}} 下的明文凭证。请输入该 Account 中任意用户的 User API Key。',
      hint: 'API Key 只用于校验并切换当前数据身份，不会修改或重新生成服务端凭证。',
      keyLabel: 'User API Key',
      keyPlaceholder: '粘贴目标 Account 的 User API Key',
      manageOnly: '仅管理该 Account',
      submit: '验证并切换',
      title: '输入 User API Key',
    },
    memberCount: '{{count}} 个用户',
    searchPlaceholder: '搜索 Account',
    toast: {
      created: '已创建并切换到 {{account}}',
      createdSwitchFailed:
        '{{account}} 已创建，但数据身份切换失败：{{error}}。仍可进入该 Account 管理用户。',
      managementSwitched:
        '管理空间已切换到 {{account}}。访问租户数据前，请先选择或创建 User Key。',
      switched: '已切换到 {{account}}',
    },
    unset: '未选择 Account',
  },
  common: {
    action: {
      cancel: '取消',
      saveConnection: '保存连接',
      showAdvancedIdentityFields: '显示高级身份字段',
    },
    errorBoundary: {
      description:
        '路由渲染过程中出现未处理异常。可以先重试一次；如果问题持续，查看下方错误信息继续排查。',
      reload: '刷新页面',
      retry: '重试',
      title: '页面发生错误',
    },
    language: {
      current: '当前',
      label: '语言',
    },
    theme: {
      toggle: '切换主题',
    },
  },
  connection: {
    devMode: {
      description:
        '当前服务会自动提供身份，通常不需要填写 account、user 和 API key。',
      title: '服务端托管身份',
    },
    dialog: {
      title: '连接与身份',
    },
    identitySummary: {
      dev: '服务端隐式身份',
      named: '{{identity}}',
      unset: '未设置身份',
    },
    fields: {
      accountId: {
        label: 'Account',
        placeholder: 'default',
      },
      apiKey: {
        label: 'API Key',
        placeholder: '输入 X-API-Key 或 Bearer token',
      },
      adminApiKey: {
        label: 'Admin API key',
        placeholder: 'Root 或 account-admin key',
      },
      baseUrl: {
        label: '服务地址',
        placeholder: 'http://127.0.0.1:1933',
      },
      credentials: {
        title: '身份与凭证',
      },
      dataApiKey: {
        label: 'User API key',
      },
      userId: {
        label: 'User',
        placeholder: 'default',
      },
    },
  },
  settings: {
    actions: {
      addAccount: '新增 account',
      addUser: '新增 user',
      cancel: '取消',
      changeRole: '修改 {{user}} 的角色',
      confirmDeleteAccount: '永久删除 Account',
      confirmRemoveUser: '删除用户',
      confirmRoleChange: '确认修改',
      copy: '复制',
      currentIdentity: '当前身份',
      deleteAccount: '删除 Account',
      refresh: '刷新',
      regenerate: '重新生成',
      removeUser: '删除 {{user}}',
      save: '保存',
      switchIdentity: '切换身份',
      use: '使用',
    },
    connection: {
      accountListLimited:
        '当前 key 不能列出所有 account；如果它有 account-admin 权限，仍可管理选中的 account。',
      adminError: '校验 Root API Key 失败：{{message}}',
      description:
        '租户数据 API 使用 User API Key；控制 API 可单独使用 Root 或 account-admin key。',
      devMode: '当前为开发模式 — 身份自动确定，无需 API key。',
      keyGuide: {
        control: {
          primary:
            '当前 User API Key 已可用于 Playground 和数据访问，普通用户无需配置控制凭证。',
          secondary:
            '如需切换 Account 或管理用户，请向部署管理员索取 Root Key，或向当前 Account 管理员索取 Admin Key。Root Key 位于服务端 ov.conf 的 server.root_api_key。',
          title: '需要管理 Account 或用户？',
        },
        data: {
          primary:
            'Root/Admin API Key 主要用于管理操作，Playground 和租户数据访问需要绑定用户身份的 User API Key。',
          secondary:
            '请在「用户管理」中选择、创建用户或重新生成 User Key，然后将它用作 User API Key。',
          title: '还缺少 User API Key',
        },
        empty: {
          primary: '普通用户：请向当前 Account 管理员索取 User API Key。',
          secondary:
            '部署管理员：Root API Key 位于服务端 ov.conf 的 server.root_api_key；填入后可在「用户管理」中创建或重新生成 User Key。',
          title: '还没有 OpenViking API Key？',
        },
        learnMore: '查看 API Key 获取方式',
        trusted: {
          primary:
            '当前 Trusted 服务启用了 Root Key 校验，浏览器需要配置同一 Root API Key 才能访问管理和租户数据接口。',
          secondary:
            '请向部署管理员索取 Root Key；它位于服务端 ov.conf 的 server.root_api_key。Trusted 模式的数据身份由 Account/User 断言确定，不需要 User API Key。',
          title: 'Trusted 服务需要 Root API Key',
        },
      },
      rootHint: '用于列出 account / user，以及生成或轮换 key。',
      title: '连接设置',
      unsupportedAuthMode: {
        description:
          'Web Studio 不支持 {{mode}} 认证模式。请使用 {{ov}} CLI 或 Python SDK 连接此服务器。',
        primary: '该服务器配置了 {{mode}} 认证。',
        title: '不支持的认证模式',
      },
      userHint: '供 Playground 和租户数据 API 使用。',
    },
    connectionPage: {
      description: '配置 OpenViking 服务连接、控制面凭证和当前数据访问凭证。',
      title: '连接设置',
    },
    dialogs: {
      addAccount: {
        description:
          '创建一个工作区 account 和第一个 admin user。新 key 只会在创建后展示一次。',
        title: '新增 account',
      },
      addUser: {
        currentAccountDescription:
          '在 {{accountId}} 空间下创建用户。生成的 key 只会在创建后展示一次。',
        description:
          '在已有 account 下注册 user。生成的 key 只会在创建后展示一次。',
        title: '新增 user',
      },
      changeRole: {
        description:
          '将 {{account}} / {{user}} 的角色修改为 {{role}}。新的权限会立即生效。',
        title: '修改用户角色？',
      },
      deleteAccount: {
        confirmHint: 'Account 名称必须完全一致。',
        confirmLabel: '请输入 {{account}} 以确认',
        description:
          '此操作将永久删除 {{account}}，之后将无法再访问该 Account，且无法撤销。',
        title: '删除这个 Account？',
      },
      regenerate: {
        description:
          '要重新生成 {{account}} / {{user}} 的 API key 吗？当前 key 会立即失效。',
        title: '重新生成 API key？',
      },
      removeUser: {
        description:
          '确定从 {{account}} 空间移除 {{user}} 吗？该用户的 API Key 会立即失效，此操作不可撤销。',
        title: '删除用户？',
      },
    },
    empty: {
      adminDescription:
        '使用 root 或 account admin API key 后，可以列出用户、复制 key、新增身份或轮换凭证。',
      adminTitle: '需要 admin 权限',
      usersDescription: '创建一个 user 来生成第一个 API key。',
      usersTitle: '选中的 accounts 下没有 user',
    },
    fields: {
      account: 'Account',
      adminUser: 'Admin user',
      adminApiKey: 'Admin API key',
      apiKey: 'API key',
      baseUrl: '服务地址',
      dataApiKey: 'User API key',
      rootApiKey: 'Root or Admin API Key',
      userApiKey: 'User API Key',
      role: '角色',
      user: 'User',
    },
    health: {
      admin: '控制面权限',
      data: '数据访问',
      state: {
        checking: '检查中',
        error: '异常',
        ok: '正常',
        skipped: '未检查',
      },
    },
    keyResult: {
      description:
        '请现在复制保存。离开当前状态后，OpenViking 可能只展示前缀。',
      dismiss: '收起',
      title: '新的 API key',
    },
    loading: '正在加载身份...',
    management: {
      accountFilter: 'Accounts',
      accessDeniedDescription:
        '只有配置并通过校验的 Root 或 Account Admin API Key 才能管理用户。',
      accessDeniedTitle: '无用户管理权限',
      currentAccountDescription: '管理 {{account}} 空间下的用户和访问凭证。',
      description:
        '查看选中 accounts 下的 users 和凭证，并在网页端新增 user 或轮换 key。',
      memberListDescription:
        '“切换身份”会将该用户设为 Playground、检索等数据页面的访问身份，不会改变当前 Root/Admin 管理凭证。',
      memberListDescriptionRoot:
        '可直接修改成员角色；“切换身份”只会改变 Playground、检索等数据页面的访问身份，不会改变当前 Root 管理凭证。',
      memberListTitle: '空间成员',
      cannotRemoveCurrentIdentity: '不能删除当前正在使用的身份。',
      cannotRemoveLastManager: '不能删除空间内最后一个管理员。',
      noUsableKey: '该用户没有可用于数据访问的明文 API Key。',
      openConnection: '打开连接设置',
      title: '用户管理',
    },
    page: {
      adminDescription:
        '配置当前 OpenViking Studio 身份，并管理账号、用户和 API key。',
      description:
        '配置当前 OpenViking Studio 的服务地址和 API key，查看当前身份下的数据。',
      title: '连接与身份',
    },
    placeholders: {
      account: 'team-account',
      adminApiKey: 'Root 或 account-admin key',
      apiKey: '输入 X-API-Key 或 Bearer token',
      baseUrl: 'http://127.0.0.1:1933',
      devModeApiKey: '[dev mode，无需 API key]',
      userApiKey: 'User API key',
      user: 'default',
    },
    roles: {
      admin: 'Admin',
      root: 'Root',
      user: 'User',
    },
    serverMode: {
      api_key: 'API key 模式',
      checking: '检查中...',
      dev: '开发模式',
      ldap: 'LDAP 模式',
      offline: '离线',
      oidc: 'OIDC 模式',
      trusted: 'Trusted 模式',
    },
    stats: {
      accounts: 'Accounts 总数',
      apiKeys: '可见 API keys',
      users: 'Users',
    },
    table: {
      account: 'Account',
      actions: '操作',
      apiKey: 'API key',
      role: '角色',
      user: 'User',
    },
    toast: {
      accountCreated: 'Account 已创建',
      accountDeleted: '{{account}} 已删除',
      accountDeletedRecoveryFailed:
        'Account 已删除，但无法加载剩余 Account 列表：{{error}}',
      connectionSaved: '连接已保存',
      copyFailed: '复制失败',
      copied: '已复制',
      dataKeySelected: '已切换数据访问身份',
      keyRegenerated: 'API key 已重新生成',
      roleUpdated: '{{user}} 的角色已修改为 {{role}}',
      userCreated: 'User 已创建',
      userRemoved: '{{user}} 已删除',
    },
  },
  home: {
    contextCommits: {
      description:
        '按 4 小时聚合资源、技能、会话消息和提交写入，鼠标悬停可查看明细。',
      empty: '过去一年暂无上下文提交',
      hourRange: '{{start}}-{{end}}',
      legend: {
        high: '高',
        intense: '密集',
        low: '低',
        medium: '中',
        more: '多',
        none: '少',
        title: '提交强度',
      },
      operations: {
        addResource: '资源写入',
        addSkill: '技能写入',
        sessionAddMessage: '会话消息',
        sessionCommit: '会话提交',
      },
      stats: {
        activeDays: '活跃天数',
        peakDay: '峰值单日',
        recentDay: '最近提交',
      },
      title: '上下文提交统计',
      yearlyEmpty: '暂无上下文提交',
      yearlyTotal: '{{count}} 次上下文提交',
      tooltip: {
        total: '总提交',
      },
    },
    contextData: {
      description: '包含文件、技能与用户记忆，用于衡量当前上下文资源规模。',
      files: '文件',
      memories: '记忆',
      skills: '技能',
      title: '上下文数据量',
    },
    page: {
      description:
        '按产品需求对齐首页内容：菜单入口、上下文数据量、今日 tokens、今日检索、Agent 访问、tokens 趋势和上下文提交统计。',
      eyebrow: 'OpenViking Studio',
      settings: '连接与设置',
      title: 'Overview',
    },
    requestFailed: '请求失败',
    todayRetrievals: {
      description:
        '展示用户或 Agent 今日使用语义检索 find() 和 search() 的成功调用次数，每天零点刷新。',
      find: 'find',
      search: 'search',
      title: '今日检索次数',
    },
    todayTokens: {
      description: '展示今日实时 token 消耗，每天零点刷新。',
      embeddingInput: 'Embedding input tokens',
      title: '今日 Tokens 消耗',
      vlmInput: 'VLM input tokens',
      vlmOutput: 'VLM output tokens',
    },
    tokenTrend: {
      description:
        '展示最近 14 天每日 token 消耗，包含 VLM 输入、VLM 输出和 Embedding 输入。',
      empty: '最近 14 天暂无 token 消耗',
      title: 'tokens 总消耗统计',
    },
    usageDisabled: 'Usage/Audit 未初始化，暂无实时统计。',
    usageAccessRequired:
      '当前连接未获取到 admin/root 权限，无法显示 Usage/Audit 数据。请在连接与身份中配置具备 Console Usage/Audit 权限的 API Key。',
  },
} as const

export default workspace

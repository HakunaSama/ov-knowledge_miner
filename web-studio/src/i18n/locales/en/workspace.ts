const workspace = {
  appShell: {
    footer: {
      agentIntegrations: 'Agent Integrations',
      connection: 'Connection Settings',
      docs: 'Documentation',
      github: 'GitHub',
      sdkApi: 'SDK & API',
      users: 'User Management',
    },
    header: {
      currentUser: {
        account: 'Account',
        accountSummary: 'Account · {{account}}',
        openMenu: 'View current user {{user}}',
        signedInAs: 'Current data identity',
        unset: 'Not set',
        user: 'User',
      },
      defaultTitle: 'OpenViking Studio',
    },
    navigation: {
      home: {
        title: 'Home',
      },
      knowledgeMining: {
        title: 'Knowledge Mining',
      },
      crossDeviceVerify: {
        title: 'OAuth verify',
      },
      operations: {
        title: 'Operations',
      },
      requestLogs: {
        title: 'Request Logs',
      },
      monitoring: {
        title: 'Monitoring',
      },
      skills: {
        title: 'Skills',
      },
      tasks: {
        title: 'Task Center',
      },
      watches: {
        title: 'Scheduled Sync',
      },
      retrieval: {
        title: 'Retrieval',
      },
      sessions: {
        title: 'Sessions',
      },
      playground: {
        title: 'Playground',
      },
    },
    sidebar: {
      groups: {
        operations: 'Activity',
        resources: 'Resources',
        settings: 'Settings',
        workspace: 'Workspace',
      },
      loadingSessions: 'Loading...',
      noSessions: 'No sessions',
      workspaceGroupLabel: 'OpenViking Studio',
    },
  },
  knowledgeMining: {
    eyebrow: 'VikingBot · LLM Wiki',
    title: 'Knowledge Mining',
    description:
      'Mine knowledge using the directory levels, facets, and derived views declared by the current OKF configuration, then incrementally update the same knowledge base from team Memory and human answers.',
    history: {
      current: 'Viewing',
      description:
        'Switch between complete progress, knowledge files, source coverage, intermediates, questionnaires, and the knowledge cloud. Running jobs continue updating in the background.',
      newJob: 'New mining job',
      sources: '{{count}} sources',
      sourcesUnknown: 'Sources in details',
      title: 'Mining history',
      untitled: 'Untitled knowledge-mining job',
    },
    cliImport: {
      title: 'Import and display CLI mining results',
      description:
        'Render ov compile outputs through the complete result interface without mining again. Discover llm-wiki CLI tasks on this server, attach an existing Viking URI, or upload an OVPack exported from another server.',
      discoveredBadge: '{{count}} CLI results discovered',
      discovery: {
        title: 'Automatic same-server discovery',
        description:
          'Studio recognizes llm-wiki CLI tasks in Compile history and adds them to Mining history automatically, including live updates for running tasks.',
      },
      uri: {
        title: 'Attach an existing result URI',
        description:
          'Use this when the result is still on the current OpenViking server but its Compile history is no longer available. Studio validates index.md, knowledge pages, and intermediates.',
        label: 'CLI result Viking URI',
        placeholder: 'viking://resources/research-wiki',
        action: 'Validate and display result',
      },
      ovpack: {
        title: 'Upload a CLI result OVPack',
        description:
          'Use this to move a result from another OpenViking server. Export the target directory with the CLI, then upload it here into an isolated directory.',
        command: 'ov export <to-uri> result.ovpack',
        action: 'Choose and import .ovpack',
      },
      origins: {
        cli: 'CLI result',
        imported: 'Imported result',
      },
      success: {
        uri: 'The CLI result was validated and added to Mining history.',
        ovpack:
          'The OVPack was imported and its CLI mining result is ready to browse.',
      },
      readOnlyTitle: 'Imported result shown in review mode',
      readOnly:
        'The questionnaire is fully visible, but Studio does not start a human incremental Compile for an imported result. Continue against the same to URI from the original CLI environment when needed.',
    },
    upload: {
      title: 'Upload knowledge sources',
      description:
        'Each batch uses an isolated source directory and never overwrites another batch.',
      dropzone: 'Drop files here, or click to choose',
      formats:
        'PDF / MD / DOC / DOCX / XLS / XLSX · unlimited files · {{size}} each',
      folder: {
        title: 'Import a complete resource folder',
        choose: 'Choose resource folder',
        hint: 'Recursively reads subfolders and classifies documents and team-memory automatically; unrelated manifest files are skipped.',
        selected:
          '{{documents}} documents and {{memory}} team Memory files selected',
        summary:
          'Folder loaded: {{documents}} documents, {{memory}} team Memory files, and {{skipped}} unrelated files skipped.',
      },
    },
    okfConfig: {
      label: 'OKF format config',
      defaultName: 'Bundled OKF_CONFIG.yaml (default)',
      choose: 'Choose config',
      useDefault: 'Restore default OKF config',
      hint: 'Optionally upload YAML that strictly defines the main-view path levels, facet position, derived-view groups, provenance, intermediate artifacts, cross-knowledge links, and WikiLink rules. Unconfigured directories and views are rejected.',
    },
    memory: {
      title: 'Team Memory (optional incremental source)',
      description:
        'Memory is not mixed into the first pass. After the document Compile completes, a second Compile automatically uses team Memory as from and the first knowledge base as to.',
      dropzone: 'Drop team Memory files here, or click to choose',
      formats: 'MD / TXT / JSON / YAML. Leave empty for a document-only run.',
      incrementalReason:
        'This is the team Memory incremental-update stage. Inspect the complete existing target knowledge base and use team Memory as new evidence to update, extend, or correct it. Language such as “now” or “changed from X to Y” supersedes old current facts: revise every affected current claim instead of only appending provenance or creating a separate insight while stale wording remains. Preserve still-accurate document knowledge, provenance, WikiLinks, and every configured view tag, and avoid duplicate pages.',
      pipeline: {
        documents: '1 · Documents build the main knowledge base',
        incremental: '2 · Team Memory updates it incrementally',
      },
    },
    reason: {
      label: 'Mining objective',
      default:
        'Turn these documents into an OKF knowledge base the team can retrieve and reuse. Extract important entities, concepts, syntheses, and relationships, and keep provenance close to every material claim.',
      placeholder:
        'Describe the question, audience, scope, language, and priorities…',
      hint: 'This becomes the ov compile reason. The llm-wiki Skill defines the output structure; this instruction steers this run.',
    },
    actions: {
      start: 'Start knowledge mining',
      running: 'Mining…',
      queued: 'Added to mining queue',
      cancel: 'Cancel Compile task',
      cancelQueued: 'Leave queue',
      resume: 'Resume from checkpoint',
      resuming: 'Resuming…',
      resumeAccepted:
        'A resumed task was created and will reuse uploaded sources and any available checkpoint.',
      newJob: 'New mining task',
      removeFile: 'Remove {{name}}',
    },
    status: {
      title: 'Task progress',
      vikingBot:
        'OpenViking runs the knowledge work in VikingBot’s task-scoped AgentLoop.',
      taskId: 'Task ID',
      documentTaskId: 'Document task',
      memoryTaskId: 'Memory task',
      humanTaskId: 'Human input',
      queuePosition: 'Queue position',
      pending: 'Waiting for document task',
      skipped: 'Not configured',
      skill: 'Skill',
      okfConfig: 'OKF config',
      output: 'Output',
      cancelledDescription:
        'The task was cancelled. Its saved phase checkpoint can be resumed.',
    },
    phases: {
      idle: 'Ready',
      preparing: 'Preparing',
      uploading: 'Parsing files',
      queued: 'Waiting to mine',
      compiling_documents: 'Mining documents',
      compiling_memory: 'Updating from Memory',
      compiling_human: 'Updating from human input',
      awaiting_human: 'Waiting for human evidence',
      partial: 'Partial result · validation failed',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    },
    stages: {
      idle: 'Waiting for files',
      preparing: 'Checking VikingBot and preparing the llm-wiki Skill',
      uploading: 'Uploading, parsing, and generating semantic indexes',
      queued: 'Sources saved in isolation; waiting for the prior workflow',
      compiling: 'Waiting for VikingBot',
      compiling_documents: 'Waiting for the document Compile',
      compiling_memory: 'Waiting for the team Memory incremental Compile',
      compiling_human: 'Waiting for the human-answer incremental Compile',
      awaiting_human:
        'Conflicts or evidence gaps found; waiting for human evidence before completion',
      loading_skill: 'Loading the llm-wiki Skill',
      collecting_context: 'Collecting source and target context',
      agent: 'VikingBot is reading, synthesizing, and writing',
      source_coverage: 'Phase 1/3 · validating per-document coverage',
      candidate_knowledge: 'Phase 2/3 · validating candidate knowledge',
      page_generation: 'Phase 3/3 · generating knowledge pages',
      rendering: 'Validating and rendering Wiki outputs',
      writing: 'Writing to the OpenViking target',
      refreshing: 'Generating semantic sidecars and refreshing indexes',
      salvaging: 'Saving usable partial outputs',
      completed: 'Knowledge Wiki is ready',
      cancelled: 'Task cancelled',
      failed: 'Task execution failed',
    },
    results: {
      title: 'Mining results',
      description:
        'Browse the navigation, entity, concept, and synthesis pages produced by llm-wiki.',
      completed: '{{count}} Wiki pages created or updated.',
      awaitingHuman:
        'A reviewable provisional knowledge base is ready and paused at the human-evidence gate. It becomes final only after the answers are applied.',
      partialTitle: 'This is a salvaged partial result',
      partialBadge: 'SALVAGED · validation failed',
      partial:
        'The task did not pass the complete OKF validation, so later Memory and human incremental stages were stopped. Saved pages, audit artifacts, and derived views remain reviewable, but this is not a final knowledge base.',
      waitingTitle: 'VikingBot is working',
      waitingDescription:
        'Long-running mining has no one-hour hard deadline by default. You may close or refresh this page; phase checkpoints persist and can be resumed after failure or cancellation.',
      queuedTitle: 'Number {{position}} in the queue',
      queuedDescription:
        'Documents and team Memory are saved under this job’s isolated directories. VikingBot starts it after the prior document, Memory, and human-evidence workflow ends.',
      emptyTitle: 'No mining result yet',
      emptyDescription:
        'Choose documents, describe the objective, and start. The result is persisted as an OpenViking Resource.',
    },
    views: {
      label: 'Knowledge organization views',
      main: 'Main view',
      mainDescription:
        'The main view mirrors the real OpenViking target directory. Derived views reorganize the same pages by OKF tags without copying knowledge.',
      mainStructure:
        'Configured path levels: {{structure}}. Facet must be one of {{categories}}; extra directories are rejected.',
      legacyStructure: 'legacy result without path_structure',
      missingConfig:
        'This result does not include OKF main-view metadata. Studio will not guess directories, facets, or views; import a task that includes Compile result metadata.',
      metaSummary:
        '{{units}} meta-knowledge units and {{files}} knowledge files. The main view and every configured derived view reference the same physical files.',
      incompleteMetaSummary:
        '{{count}} meta-knowledge units do not cover every configured facet ({{categories}}). Missing pages are not fabricated.',
      emptyGroup: 'No page is assigned to this group yet.',
      guides: {
        contentLabel: 'What is here',
        useLabel: 'When to use it',
        main: {
          title: 'Main view: physical files organized by OKF configuration',
          purpose:
            'This is the single source of truth and mirrors the folders and files actually stored in OpenViking, not a tag-generated copy.',
          content:
            'The root, facets, directory routes, meta_id position, and filename level all come from the current OKF configuration. Studio adds no preset directories.',
          use: 'Use it to understand scope, browse the complete hierarchy, or locate the physical home of a claim.',
        },
        configured: {
          empty:
            'The configuration does not declare any displayable group paths.',
          use: 'Browse the same physical knowledge files through the group hierarchy declared by the current OKF configuration.',
        },
        graph: {
          title: 'Knowledge cloud: a spatial view of units and relations',
          purpose:
            'Directly reuses the KG Explorer HTML from OpenViking’s knowledge-graph example and adapts configured facets, WikiLinks, and cross-knowledge references to its graph data.',
          content:
            'Preserves the official D3 force layout, type filters, relation legend, search, neighbor focus, evidence chains, and entity inspector. Colors and shapes distinguish units and facets.',
          use: 'Use it to discover clusters, isolated pages, cross-unit connections, and the overall shape of the knowledge base.',
        },
        coverage: {
          title: 'Source coverage: disposition of every upload',
          purpose:
            'Reconciles uploaded, actually inspected, cited, merged, and skipped sources as a hard Compile submission gate.',
          content:
            'Each upload-level source status, output pages, merge target, or specific skip reason.',
          use: 'Use it to find unread files, explain output counts, or audit why a source did not become an independent meta-knowledge unit.',
        },
        intermediates: {
          title: 'Intermediates: the mining audit trail',
          purpose:
            'These are not final knowledge pages. They expose how VikingBot read evidence, formed conclusions, and found conflicts or gaps.',
          content:
            'Run manifest, per-page evidence ledger, investigation report, and structured questionnaire.',
          use: 'Use it to trace provenance, audit generation, inspect omissions, or understand why a question was asked.',
        },
        questionnaire: {
          title: 'Human investigation: the pre-completion evidence gate',
          purpose:
            'The workflow pauses here when evidence conflicts or is incomplete; VikingBot does not guess and declare the run complete.',
          content:
            'Only questions that materially affect reliability, linked to their conflict or evidence-gap impact.',
          use: 'A knowledgeable teammate supplies verifiable answers; VikingBot then revises and completes the knowledge base.',
        },
      },
    },
    graph: {
      title: 'Knowledge cloud',
      legend: 'Knowledge legend',
      interactionHint:
        'Official KG Explorer: drag, zoom, search entities, and click nodes to inspect relations and evidence.',
      nodeCount: '{{count}} nodes',
      edgeCount: '{{count}} relations',
      reset: 'Reset view',
      openPage: 'Open knowledge page',
      emptyTitle: 'No knowledge nodes to draw',
      emptyDescription:
        'The knowledge cloud appears here after mining produces meta-knowledge pages.',
    },
    intermediates: {
      title: 'Intermediates',
      description:
        'Inspect knowledge candidates, per-document read coverage, cross-stage evidence history, evidence gaps, and the human-input questionnaire.',
      kinds: {
        run_manifest: 'Run manifest',
        evidence_ledger: 'Evidence ledger',
        investigation_report: 'Investigation report',
        questionnaire: 'Questionnaire',
        source_coverage: 'Source coverage',
        candidate_knowledge: 'Candidate knowledge',
        readlist: 'Per-document read ledger',
        evidence_history: 'Cross-stage evidence history',
      },
      candidates: 'Knowledge candidates',
      promoted: 'Promoted to meta-knowledge',
      readCoverage: 'Required fragment reads',
      documentCoverage: 'Documents fully inspected',
    },
    coverage: {
      title: 'Source coverage',
      uploaded: 'Uploaded',
      inspected: 'Inspected',
      cited: 'Cited',
      merged: 'Merged',
      skipped: 'Skipped',
      reason: 'Reason',
      mergedInto: 'Merged into',
      outputs: 'Outputs',
      loadError: 'Could not load source coverage',
      legacyTitle: 'No source coverage record for this legacy result',
      legacyDescription:
        'This result predates the source coverage gate. Run knowledge mining again to record every uploaded source.',
    },
    provenance: {
      sources: 'Sources and intermediate evidence',
      knowledgeLinks: 'Contextual cross-knowledge relations (many-to-many)',
      knowledgeLinksHint:
        'Different passages may reference different knowledge targets, and the same target may be cited by many pages. Body links show the actual reference position.',
      linkContext: 'Reference position: {{context}}',
      noKnowledgeLinks: 'This page body declares no cross-knowledge relation.',
    },
    questionnaire: {
      title: 'Human investigation',
      description:
        'VikingBot does not silently arbitrate unresolved conflicts or invent missing evidence. Answer the questionnaire to incrementally write verified human evidence back to the same knowledge base.',
      incrementalReason:
        'This is the human-knowledge incremental stage. Treat questionnaire answers as new human-answer evidence; resolve the linked conflicts or evidence gaps and update affected pages, the evidence ledger, investigation report, and questionnaire status while keeping the same target.',
      needsInput: 'Human knowledge required',
      clear: 'No open knowledge gaps',
      conflict: 'Evidence conflict',
      evidenceGap: 'Evidence gap',
      loadError: 'Could not load the questionnaire',
      formTitle: 'Knowledge supplement questionnaire',
      formDescription:
        'The knowledge base is still awaiting evidence. Answers are stored as human evidence and applied through an incremental Compile; the run completes only after conflicts and gaps are handled.',
      answerPlaceholder:
        'Provide a verifiable answer, time scope, and supporting basis…',
      submit: 'Submit answers and update',
      answered: 'Human questions resolved',
      answeredDescription:
        'Question history is retained; answers were written as a human-answer source and the investigation report was updated.',
      noQuestions: 'No human input is currently required',
      noQuestionsDescription:
        'The investigation report is clear and has no unresolved questions.',
    },
    errors: {
      title: 'Task failed',
      botUnavailable:
        'Could not connect to VikingBot. Start OpenViking with --with-bot and check the model configuration.',
      unsupportedFile: '{{name}} is not a supported document format.',
      unsupportedMemoryFile: '{{name}} is not a supported team Memory format.',
      fileTooLarge: '{{name}} exceeds the {{size}} per-file limit.',
      compileFailed: 'VikingBot Compile failed.',
      resultLoad: 'Could not load the result directory',
      pageLoad: 'Could not load the Wiki page',
      missingJob:
        'The current mining job is unavailable, so human answers cannot be submitted.',
      incompleteQueueJob:
        'This queued job is missing its Skill or OKF config and cannot start safely. Create a new job and upload it again.',
      queueBusy:
        'Another mining job is running or queued. This checkpoint cannot resume until the serial queue is clear.',
    },
    queue: {
      added: 'The isolated dataset was saved and added to the mining queue.',
      badge: 'Queued · No. {{position}}',
      position: 'No. {{position}}',
      started: 'Queued job started: {{name}}',
    },
  },
  monitoringPage: {
    title: 'Monitoring',
    description: 'View real-time health for OpenViking components.',
    version: 'v{{version}}',
    refresh: 'Refresh',
    updatedAt: 'Updated at {{time}}',
    loading: 'Loading monitoring data...',
    loadFailed: 'Could not load monitoring data',
    health: {
      healthy: 'Healthy',
      unhealthy: 'Unhealthy',
    },
    summary: {
      healthy: 'All components are healthy',
      unhealthy: 'Some components need attention',
      components: '{{healthy}} of {{total}} components healthy',
    },
    tabs: {
      label: 'Monitoring type',
      overview: 'Overview',
      queue: 'Task queue',
      vikingdb: 'VectorDB',
      models: 'Models',
      filesystem: 'Filesystem',
      lock: 'Locks',
      retrieval: 'Retrieval',
    },
    detail: {
      noData: 'No monitoring data',
      descriptions: {
        queue: 'Resource processing, semantic generation, and session queues.',
        vikingdb: 'Vector storage and indexing service.',
        models: 'VLM, embedding, and rerank model services.',
        filesystem: 'OpenViking filesystem and mount services.',
        lock: 'Transaction locks and concurrency control.',
        retrieval: 'Context retrieval service.',
      },
    },
    offline: {
      title: 'OpenViking is not connected',
      description:
        'Configure the server URL and credentials to view monitoring data.',
      action: 'Open connection settings',
    },
  },
  skillsPage: {
    title: 'Skills',
    description:
      'View Agent skills available to the current user and workspace.',
    refresh: 'Refresh',
    loading: 'Loading skills...',
    empty: 'No skills available',
    emptyDescription:
      'User and shared skills will appear in separate tabs after they are added.',
    emptyScope: 'No {{scope}} available',
    emptyScopeDescription:
      'Skills in this scope will appear here after they are added.',
    loadFailed: 'Could not load skills',
    networkError:
      'Could not connect to the OpenViking service. Check the server URL and connection status.',
    connectionSettings: 'Open connection settings',
    detail: 'Details',
    openPlayground: 'Open in Playground',
    viewDetail: 'View {{name}} details',
    detailLoading: 'Loading skill details...',
    detailLoadFailed: 'Could not load skill details',
    directory: 'Directory',
    none: 'None',
    metrics: {
      files: 'Files',
      scope: 'Scope',
    },
    sections: {
      allowedTools: 'Allowed tools',
      content: 'SKILL.md',
      description: 'Description',
      files: 'Files',
      overview: 'Overview',
      tags: 'Tags',
    },
    scopes: {
      user: 'User skill',
      agent: 'Shared skill',
    },
    tabs: {
      agent: 'Shared skills',
      label: 'Skill scope',
      user: 'User skills',
    },
  },
  tasksPage: {
    title: 'Task Center',
    description:
      'Track background work such as resource processing, session commits, and reindexing.',
    refresh: 'Refresh',
    loading: 'Loading tasks...',
    empty: 'No background tasks',
    emptyDescription:
      'Asynchronous work will appear here with its status and update time.',
    emptyFiltered: 'No matching tasks',
    emptyFilteredDescription: 'Adjust or clear the filters to see other tasks.',
    loadFailed: 'Could not load tasks',
    detail: {
      title: 'Task details',
      loading: 'Loading task details...',
      loadFailed: 'Could not load task details',
      retry: 'Retry',
      openLabel: 'View details for task {{taskId}}',
      fields: {
        status: 'Task status',
        type: 'Task type',
        stage: 'Current stage',
        resource: 'Resource',
        createdAt: 'Created',
        updatedAt: 'Updated',
      },
      error: 'Failure reason',
      result: 'Result',
      noResult: 'No result yet',
      noResultDescription:
        'Results returned by the API will appear here when the task completes.',
      noResultFailedDescription:
        'This task did not return a result. See the failure reason above.',
      noResultCancelledDescription:
        'This task was cancelled before it returned a result.',
    },
    filters: {
      label: 'Filter',
      type: 'Task type',
      status: 'Task status',
      allTypes: 'All types',
      allStatuses: 'All statuses',
      clear: 'Clear filters',
    },
    pagination: {
      next: 'Next',
      page: 'Page {{page}}',
      pageSize: 'Rows per page',
      pageSizeValue: '{{count}} per page',
      previous: 'Previous',
      scope:
        'Showing the latest {{count}} tasks (the API returns at most {{limit}})',
    },
    table: {
      task: 'Task',
      type: 'Type',
      resource: 'Resource',
      createdAt: 'Created',
      status: 'Status',
    },
    status: {
      cancelled: 'Cancelled',
      cancelling: 'Cancelling',
      completed: 'Completed',
      failed: 'Failed',
      pending: 'Pending',
      running: 'Running',
      unknown: 'Unknown',
    },
    types: {
      session_commit: 'Session commit',
      add_resource: 'Resource processing',
      add_skill: 'Skill import',
      connector_import: 'Connector import',
      admin_reindex: 'Reindex',
      snapshot_restore_reindex: 'Snapshot reindex',
      legacy_migration: 'Legacy migration',
      legacy_cleanup: 'Legacy cleanup',
    },
  },
  watchesPage: {
    title: 'Scheduled Sync',
    description:
      'Keep remote resources current with recurring Watch tasks and manage their schedules.',
    refresh: 'Refresh',
    add: 'Add',
    adding: 'Adding...',
    loading: 'Loading scheduled syncs...',
    loadFailed: 'Could not load scheduled syncs',
    empty: 'No scheduled syncs',
    emptyDescription:
      'Add a remote resource and enable scheduled sync to get started.',
    never: 'Not synced yet',
    cancel: 'Cancel',
    save: 'Save',
    creation: {
      title: 'Creating scheduled sync',
      description:
        'The resource was submitted in the background. The list will refresh automatically.',
    },
    columns: {
      resource: 'Resource',
      source: 'Source',
      status: 'Status',
      interval: 'Interval',
      lastRun: 'Last sync',
      nextRun: 'Next sync',
      actions: 'Actions',
    },
    status: {
      active: 'Enabled',
      disabled: 'Disabled',
    },
    actions: {
      trigger: 'Sync now',
      syncing: 'Syncing...',
      disable: 'Disable',
      enable: 'Enable',
      more: 'More',
      history: 'Processing history',
      edit: 'Edit',
      delete: 'Delete',
    },
    interval: {
      minutes_one: 'Every minute',
      minutes_other: 'Every {{count}} minutes',
      hours_one: 'Every hour',
      hours_other: 'Every {{count}} hours',
      days_one: 'Every day',
      days_other: 'Every {{count}} days',
    },
    addDialog: {
      title: 'Add scheduled sync',
      description:
        'Add a remote resource and configure how often OpenViking checks for updates.',
    },
    editDialog: {
      title: 'Edit scheduled sync',
      interval: 'Interval (minutes)',
      intervalHint: 'For example, 60 for hourly or 1440 for daily.',
      reason: 'Reason (optional)',
      reasonPlaceholder: 'Why should this resource stay synchronized?',
      instruction: 'Processing instruction (optional)',
      instructionPlaceholder:
        'Special processing instructions for this resource.',
    },
    deleteDialog: {
      title: 'Delete scheduled sync?',
      description:
        'The resource {{uri}} will remain available, but it will no longer update automatically.',
    },
    history: {
      title: 'Processing history',
      description:
        'Background tasks filtered by this resource. Results may include the initial import, manual processing, and scheduled syncs.',
      loading: 'Loading processing history...',
      loadFailed: 'Could not load processing history',
      empty: 'No processing history',
      emptyDescription:
        'No background processing tasks were found for this resource.',
      stage: 'Stage',
    },
    toast: {
      creating: 'Creating scheduled sync. Please wait...',
      created: 'Scheduled sync added',
      createTimeout: 'The new task is not visible yet. Refresh again shortly.',
      updated: 'Scheduled sync updated',
      triggered: 'Sync scheduled',
      deleted: 'Scheduled sync deleted',
    },
  },
  accountSwitcher: {
    create: 'Create account',
    dialog: {
      accountLabel: 'Account',
      accountPlaceholder: 'team-account',
      adminLabel: 'Initial admin user',
      cancel: 'Cancel',
      description:
        'Create a workspace and its first administrator. Studio switches to it after creation.',
      submit: 'Create and switch',
      title: 'Create account',
    },
    empty: 'No matching accounts',
    errors: {
      loadAccounts: 'Could not load accounts',
      noCreatedKey:
        'The account was created, but the server did not return a data credential.',
      noUsableKey:
        'This account has no plaintext user API key available for data access.',
      noUsers: 'This account has no available users.',
    },
    loading: 'Loading accounts...',
    manualSwitch: {
      description:
        'The server did not expose a plaintext credential for {{account}}. Enter a User API Key from that account.',
      hint: 'Studio only verifies the key and switches the active data identity. It will not modify or rotate the server credential.',
      keyLabel: 'User API Key',
      keyPlaceholder: 'Paste a User API Key for the target account',
      manageOnly: 'Manage without a User Key',
      submit: 'Verify and switch',
      title: 'Enter a User API Key',
    },
    memberCount: '{{count}} users',
    searchPlaceholder: 'Search accounts',
    toast: {
      created: 'Created and switched to {{account}}',
      createdSwitchFailed:
        'Created {{account}}, but data identity switching failed: {{error}}. The Account remains available for management.',
      managementSwitched:
        'Switched management to {{account}}. Select or create a User Key before opening tenant data.',
      switched: 'Switched to {{account}}',
    },
    unset: 'No account selected',
  },
  common: {
    action: {
      cancel: 'Cancel',
      saveConnection: 'Save Connection',
      showAdvancedIdentityFields: 'Show Advanced Identity Fields',
    },
    errorBoundary: {
      description:
        'An unhandled exception occurred while rendering the route. Try again first; if it persists, inspect the error details below.',
      reload: 'Reload Page',
      retry: 'Retry',
      title: 'Something went wrong',
    },
    language: {
      current: 'Current',
      label: 'Language',
    },
    theme: {
      toggle: 'Toggle theme',
    },
  },
  connection: {
    devMode: {
      description:
        'This server provides identity automatically, so account, user, and API key are usually not required.',
      title: 'Server-managed identity',
    },
    dialog: {
      title: 'Connection & Identity',
    },
    identitySummary: {
      dev: 'Server-managed identity',
      named: '{{identity}}',
      unset: 'Identity not set',
    },
    fields: {
      accountId: {
        label: 'Account',
        placeholder: 'default',
      },
      apiKey: {
        label: 'API Key',
        placeholder: 'Enter X-API-Key or Bearer token',
      },
      adminApiKey: {
        label: 'Admin API key',
        placeholder: 'Root or account-admin key',
      },
      baseUrl: {
        label: 'Service URL',
        placeholder: 'http://127.0.0.1:1933',
      },
      credentials: {
        title: 'Identity & Credentials',
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
      addAccount: 'Add account',
      addUser: 'Add user',
      cancel: 'Cancel',
      changeRole: 'Change the role for {{user}}',
      confirmDeleteAccount: 'Delete account permanently',
      confirmRemoveUser: 'Delete user',
      confirmRoleChange: 'Confirm change',
      copy: 'Copy',
      currentIdentity: 'Current identity',
      deleteAccount: 'Delete account',
      refresh: 'Refresh',
      regenerate: 'Regenerate',
      removeUser: 'Delete {{user}}',
      save: 'Save',
      switchIdentity: 'Switch identity',
      use: 'Use',
    },
    connection: {
      accountListLimited:
        'This key cannot list all accounts, but it can still manage the selected account if it has account-admin access.',
      adminError: 'Could not verify the Root API Key: {{message}}',
      description:
        'Use a User API Key for tenant data APIs and an optional Root or account-admin key for control APIs.',
      devMode:
        'Development mode is active — identity is automatic and no API key is required.',
      keyGuide: {
        control: {
          primary:
            'Your User API Key already enables the Playground and data access. Regular users do not need a control credential.',
          secondary:
            'To switch Accounts or manage users, request a Root Key from the deployment admin or an Admin Key from the current Account admin. The Root Key is stored at server.root_api_key in the server-side ov.conf.',
          title: 'Need to manage Accounts or users?',
        },
        data: {
          primary:
            'The Root/Admin API Key is mainly for management. The Playground and tenant data APIs require a User API Key bound to a user identity.',
          secondary:
            'Select or create a user in User Management, or regenerate its key, then use it as the User API Key.',
          title: 'A User API Key is still required',
        },
        empty: {
          primary:
            'Regular users should request a User API Key from their Account admin.',
          secondary:
            'Deployment admins can find the Root API Key at server.root_api_key in the server-side ov.conf. Add it here, then create or regenerate a User Key in User Management.',
          title: 'No OpenViking API Key yet?',
        },
        learnMore: 'Learn how to get an API Key',
        trusted: {
          primary:
            'This trusted server enforces Root Key validation. The browser needs the same Root API Key for management and tenant data requests.',
          secondary:
            'Request the Root Key from the deployment admin; it is stored at server.root_api_key in the server-side ov.conf. Trusted-mode data identity comes from Account/User assertions and does not need a User API Key.',
          title: 'This trusted server requires a Root API Key',
        },
      },
      rootHint: 'Lists accounts and users, and mints or rotates keys.',
      title: 'Connection settings',
      unsupportedAuthMode: {
        description:
          'Web Studio does not support the {{mode}} authentication mode. Please use the {{ov}} CLI or Python SDK to interact with this server.',
        primary: 'This server is configured with {{mode}} authentication.',
        title: 'Unsupported authentication mode',
      },
      userHint: 'Used by the Playground and tenant data APIs.',
    },
    connectionPage: {
      description:
        'Configure the OpenViking server connection, control credential, and active data credential.',
      title: 'Connection settings',
    },
    dialogs: {
      addAccount: {
        description:
          'Create a workspace account and its first admin user. The new key will be shown once.',
        title: 'Add account',
      },
      addUser: {
        currentAccountDescription:
          'Create a user in {{accountId}}. The generated key is shown only once.',
        description:
          'Register a user under an existing account. The generated key will be shown once.',
        title: 'Add user',
      },
      changeRole: {
        description:
          'Change the role for {{account}} / {{user}} to {{role}}. The new permissions take effect immediately.',
        title: 'Change user role?',
      },
      deleteAccount: {
        confirmHint: 'The account name must match exactly.',
        confirmLabel: 'Enter {{account}} to confirm',
        description:
          'This permanently deletes {{account}} and removes access to it. This action cannot be undone.',
        title: 'Delete this account?',
      },
      regenerate: {
        description:
          'Regenerate the API key for {{account}} / {{user}}. The current key stops working immediately.',
        title: 'Regenerate API key?',
      },
      removeUser: {
        description:
          'Remove {{user}} from {{account}}? Their API key stops working immediately. This action cannot be undone.',
        title: 'Delete user?',
      },
    },
    empty: {
      adminDescription:
        'Use a root or account admin API key to list users, copy keys, add identities, or regenerate credentials.',
      adminTitle: 'Admin access required',
      usersDescription: 'Create a user to mint the first API key.',
      usersTitle: 'No users in the selected accounts',
    },
    fields: {
      account: 'Account',
      adminUser: 'Admin user',
      adminApiKey: 'Admin API key',
      apiKey: 'API key',
      baseUrl: 'Server URL',
      dataApiKey: 'User API key',
      rootApiKey: 'Root or Admin API Key',
      userApiKey: 'User API Key',
      role: 'Role',
      user: 'User',
    },
    health: {
      admin: 'Admin control',
      data: 'Data access',
      state: {
        checking: 'Checking',
        error: 'Error',
        ok: 'OK',
        skipped: 'Not checked',
      },
    },
    keyResult: {
      description:
        'Copy it now. OpenViking may only show a prefix after you leave this state.',
      dismiss: 'Dismiss',
      title: 'New API key',
    },
    loading: 'Loading identities...',
    management: {
      accountFilter: 'Accounts',
      accessDeniedDescription:
        'User management requires a validated Root or Account Admin API key.',
      accessDeniedTitle: 'User management unavailable',
      currentAccountDescription:
        'Manage users and access credentials in the {{account}} workspace.',
      description:
        'Review users and credentials for selected accounts, then add users or rotate keys from the web UI.',
      memberListDescription:
        '"Switch identity" uses that user for data pages such as Playground and Retrieval without changing the active Root/Admin management credential.',
      memberListDescriptionRoot:
        'You can change member roles here. "Switch identity" only changes the user used by data pages such as Playground and Retrieval; it does not change the active Root management credential.',
      memberListTitle: 'Workspace members',
      cannotRemoveCurrentIdentity: 'The active identity cannot be deleted.',
      cannotRemoveLastManager:
        'The last workspace administrator cannot be deleted.',
      noUsableKey:
        'This user has no plaintext API key available for data access.',
      openConnection: 'Open connection settings',
      title: 'User management',
    },
    page: {
      adminDescription:
        'Configure the active OpenViking Studio identity and manage accounts, users, and API keys.',
      description:
        'Configure the OpenViking Studio server URL and API key, then view data for the current identity.',
      title: 'Connection & Identity',
    },
    placeholders: {
      account: 'team-account',
      adminApiKey: 'Root or account-admin key',
      apiKey: 'Enter X-API-Key or Bearer token',
      baseUrl: 'http://127.0.0.1:1933',
      devModeApiKey: '[dev mode, no api key required]',
      userApiKey: 'User API key',
      user: 'default',
    },
    roles: {
      admin: 'Admin',
      root: 'Root',
      user: 'User',
    },
    serverMode: {
      api_key: 'API key mode',
      checking: 'Checking...',
      dev: 'Development mode',
      ldap: 'LDAP mode',
      offline: 'Offline',
      oidc: 'OIDC mode',
      trusted: 'Trusted mode',
    },
    stats: {
      accounts: 'Total accounts',
      apiKeys: 'Visible API keys',
      users: 'Users',
    },
    table: {
      account: 'Account',
      actions: 'Actions',
      apiKey: 'API key',
      role: 'Role',
      user: 'User',
    },
    toast: {
      accountCreated: 'Account created',
      accountDeleted: '{{account}} deleted',
      accountDeletedRecoveryFailed:
        'The account was deleted, but the remaining account list could not be loaded: {{error}}',
      connectionSaved: 'Connection saved',
      copyFailed: 'Copy failed',
      copied: 'Copied',
      dataKeySelected: 'Data access identity switched',
      keyRegenerated: 'API key regenerated',
      roleUpdated: "{{user}}'s role changed to {{role}}",
      userCreated: 'User created',
      userRemoved: '{{user}} deleted',
    },
  },
  home: {
    contextCommits: {
      description:
        'Groups resource, skill, session message, and session commit writes into 4-hour buckets. Hover a cell for details.',
      empty: 'No context commits in the last year',
      hourRange: '{{start}}-{{end}}',
      legend: {
        high: 'High',
        intense: 'Intense',
        low: 'Low',
        medium: 'Medium',
        more: 'More',
        none: 'Less',
        title: 'Commit intensity',
      },
      operations: {
        addResource: 'Resource writes',
        addSkill: 'Skill writes',
        sessionAddMessage: 'Session messages',
        sessionCommit: 'Session commits',
      },
      stats: {
        activeDays: 'Active days',
        peakDay: 'Peak day',
        recentDay: 'Recent commit',
      },
      title: 'Context Commit Stats',
      yearlyEmpty: 'No context commits',
      yearlyTotal: '{{count}} context commits',
      tooltip: {
        total: 'Total commits',
      },
    },
    contextData: {
      description:
        'Includes files, skills, and user memories to show the current context resource scale.',
      files: 'Files',
      memories: 'Memories',
      skills: 'Skills',
      title: 'Context Data Volume',
    },
    page: {
      description:
        'Aligned with the product overview: menu entries, context data volume, today tokens, today retrievals, agent access, token trend, and context commit stats.',
      eyebrow: 'OpenViking Studio',
      settings: 'Connection & Settings',
      title: 'Overview',
    },
    requestFailed: 'Request failed',
    todayRetrievals: {
      description:
        'Shows successful semantic retrieval calls for find() and search() today. Resets at midnight.',
      find: 'find',
      search: 'search',
      title: 'Retrievals Today',
    },
    todayTokens: {
      description:
        'Shows real-time token consumption today. Resets at midnight.',
      embeddingInput: 'Embedding input tokens',
      title: 'Tokens Today',
      vlmInput: 'VLM input tokens',
      vlmOutput: 'VLM output tokens',
    },
    tokenTrend: {
      description:
        'Shows daily token usage over the last 14 days, including VLM input, VLM output, and embedding input.',
      empty: 'No token usage in the last 14 days',
      title: 'Total Token Consumption',
    },
    usageDisabled:
      'Usage/Audit is not initialized, so live usage stats are unavailable.',
    usageAccessRequired:
      'Current connection has no admin/root role. Configure an API key with Console Usage/Audit access in Connection & Identity.',
  },
} as const

export default workspace

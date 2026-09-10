import type { CompileResult, CompileTaskHistoryItem } from './api'

export type MiningPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'queued'
  | 'compiling_documents'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type FileProgress = {
  name: string
  percent: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed'
}

export type MiningJob = {
  createdAt: string
  documentFiles: FileProgress[]
  documentSourceUri: string
  documentTaskId: string | null
  error: string | null
  id: string
  okfConfigUri: string | null
  origin: 'cli' | 'imported' | 'studio'
  phase: MiningPhase
  reason: string
  result: CompileResult | null
  skillUri: string | null
  targetUri: string
  taskId: string | null
  updatedAt: string
  runId?: string
  windowByteLimit?: number
  windowCount?: number
  windowFileLimit?: number
  windowPageLimit?: number
  windowProbeLimit?: number
  windowIndex?: number
  windowLogUri?: string
  windowSizeBytes?: number
  oversizedSingleton?: boolean
  windowPdfPages?: number
  windowEstimatedProbes?: number
}

export type MiningHistory = {
  jobs: MiningJob[]
  selectedJobId: string | null
  version: 2
}

const KNOWLEDGE_MINING_ROOT = 'viking://resources/knowledge-mining/'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim()
  return text || null
}

function phaseValue(value: unknown): MiningPhase | null {
  if (value === 'compiling') return 'compiling_documents'
  return [
    'idle',
    'preparing',
    'uploading',
    'queued',
    'compiling_documents',
    'partial',
    'completed',
    'failed',
    'cancelled',
  ].includes(String(value))
    ? (value as MiningPhase)
    : null
}

function jobIdForTarget(targetUri: string): string {
  if (!targetUri.startsWith(KNOWLEDGE_MINING_ROOT)) return `cli:${targetUri}`
  const root = targetUri.replace(/\/wiki\/?$/, '')
  return root.split('/').filter(Boolean).at(-1) || targetUri
}

function timestampForTarget(targetUri: string, fallback: string): string {
  const match = jobIdForTarget(targetUri).match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
  )
  if (!match) return fallback
  const [, year, month, day, hour, minute, second] = match
  const parsed = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
  )
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

function fileProgress(value: unknown): FileProgress[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !stringValue(entry.name)) return []
    const status = [
      'pending',
      'uploading',
      'processing',
      'completed',
      'failed',
    ].includes(String(entry.status))
      ? (entry.status as FileProgress['status'])
      : 'completed'
    return [
      {
        name: stringValue(entry.name),
        percent:
          typeof entry.percent === 'number'
            ? Math.max(0, Math.min(100, entry.percent))
            : status === 'completed'
              ? 100
              : 0,
        status,
      },
    ]
  })
}

export function normalizeMiningJob(value: unknown): MiningJob | null {
  if (!isRecord(value)) return null
  const targetUri = stringValue(value.targetUri)
  const documentSourceUri =
    stringValue(value.documentSourceUri) || stringValue(value.sourceUri)
  const phase = phaseValue(value.phase)
  if (!targetUri || !documentSourceUri || !phase) return null
  const now = new Date().toISOString()
  const createdAt =
    nullableString(value.createdAt) || timestampForTarget(targetUri, now)
  return {
    createdAt,
    documentFiles: fileProgress(value.documentFiles || value.files),
    documentSourceUri,
    documentTaskId:
      nullableString(value.documentTaskId) || nullableString(value.taskId),
    error: nullableString(value.error),
    id: nullableString(value.id) || jobIdForTarget(targetUri),
    okfConfigUri: nullableString(value.okfConfigUri),
    origin:
      value.origin === 'cli' || value.origin === 'imported'
        ? value.origin
        : 'studio',
    phase,
    reason: stringValue(value.reason),
    result: isRecord(value.result) ? (value.result as CompileResult) : null,
    skillUri: nullableString(value.skillUri),
    targetUri,
    taskId: nullableString(value.taskId),
    updatedAt: nullableString(value.updatedAt) || createdAt,
    runId: nullableString(value.runId) || jobIdForTarget(targetUri),
    windowByteLimit:
      typeof value.windowByteLimit === 'number' ? value.windowByteLimit : 0,
    windowCount: typeof value.windowCount === 'number' ? value.windowCount : 1,
    windowFileLimit:
      typeof value.windowFileLimit === 'number' ? value.windowFileLimit : 0,
    windowPageLimit:
      typeof value.windowPageLimit === 'number' ? value.windowPageLimit : 0,
    windowProbeLimit:
      typeof value.windowProbeLimit === 'number' ? value.windowProbeLimit : 0,
    windowIndex: typeof value.windowIndex === 'number' ? value.windowIndex : 1,
    windowLogUri: stringValue(value.windowLogUri),
    windowSizeBytes:
      typeof value.windowSizeBytes === 'number' ? value.windowSizeBytes : 0,
    oversizedSingleton: value.oversizedSingleton === true,
    windowPdfPages:
      typeof value.windowPdfPages === 'number' ? value.windowPdfPages : 0,
    windowEstimatedProbes:
      typeof value.windowEstimatedProbes === 'number'
        ? value.windowEstimatedProbes
        : 0,
  }
}

function emptyHistory(): MiningHistory {
  return { jobs: [], selectedJobId: null, version: 2 }
}

export function parseMiningHistory(
  storedValue: string | null,
  legacyValue: string | null = null,
): MiningHistory {
  try {
    const parsed = storedValue ? (JSON.parse(storedValue) as unknown) : null
    if (isRecord(parsed) && Array.isArray(parsed.jobs)) {
      const jobs = parsed.jobs
        .map(normalizeMiningJob)
        .filter((job): job is MiningJob => job !== null)
      const requested = nullableString(parsed.selectedJobId)
      return {
        jobs,
        selectedJobId:
          requested && jobs.some((job) => job.id === requested)
            ? requested
            : jobs[0]?.id || null,
        version: 2,
      }
    }
  } catch {
    // Fall through to the former single-job storage format.
  }
  try {
    const legacy = legacyValue
      ? normalizeMiningJob(JSON.parse(legacyValue) as unknown)
      : null
    return legacy
      ? { jobs: [legacy], selectedJobId: legacy.id, version: 2 }
      : emptyHistory()
  } catch {
    return emptyHistory()
  }
}

function phaseForTask(task: CompileTaskHistoryItem): MiningPhase {
  if (task.status === 'failed') return 'failed'
  if (task.status === 'cancelled') return 'cancelled'
  if (task.status === 'completed') {
    return task.stage === 'salvaged' ? 'partial' : 'completed'
  }
  return 'compiling_documents'
}

export function jobsFromCompileTasks(
  tasks: CompileTaskHistoryItem[],
): MiningJob[] {
  const grouped = new Map<string, CompileTaskHistoryItem[]>()
  for (const task of tasks) {
    const isStudioTask = task.request.to.startsWith(KNOWLEDGE_MINING_ROOT)
    const isLlmWikiTask =
      task.request.skill
        .replace(/\/SKILL\.md\/?$/i, '')
        .split('/')
        .filter(Boolean)
        .at(-1) === 'llm-wiki' || Boolean(task.result?.main_view)
    if (!isStudioTask && !isLlmWikiTask) continue
    const source = task.request.from[0] || ''
    const windowMatch = source.match(/\/windows\/(\d{4,})\/document-sources/)
    const groupingKey = windowMatch
      ? `${task.request.to}#window-${windowMatch[1]}`
      : task.request.to
    const current = grouped.get(groupingKey) || []
    current.push(task)
    grouped.set(groupingKey, current)
  }
  return [...grouped.values()].map((group) => {
    group.sort((left, right) => left.created_at.localeCompare(right.created_at))
    const latest = group.at(-1)!
    const first = group[0]
    const targetUri = latest.request.to
    const isStudioTask = targetUri.startsWith(KNOWLEDGE_MINING_ROOT)
    const root = isStudioTask ? targetUri.replace(/\/wiki\/?$/, '') : targetUri
    const sourceUri = first.request.from[0] || ''
    const windowMatch = sourceUri.match(/\/windows\/(\d{4,})\/document-sources/)
    const windowIndex = windowMatch ? Number(windowMatch[1]) : 1
    const runId = jobIdForTarget(targetUri)
    const latestResult = [...group]
      .reverse()
      .find((task) => Boolean(task.result))?.result
    return {
      createdAt: first.created_at,
      documentFiles: [],
      documentSourceUri: sourceUri || `${root}/document-sources`,
      documentTaskId: latest.task_id,
      error: latest.error
        ? `${latest.error.code}: ${latest.error.message}`
        : null,
      id: windowMatch
        ? `${runId}-w${windowMatch[1]}`
        : jobIdForTarget(targetUri),
      okfConfigUri: latest.request.okf_config || null,
      origin: isStudioTask ? 'studio' : 'cli',
      phase: phaseForTask(latest),
      reason: first.request.reason,
      result: latest.result || latestResult || null,
      skillUri: latest.request.skill,
      targetUri,
      taskId: latest.task_id,
      updatedAt: latest.updated_at,
      runId,
      windowByteLimit: 0,
      windowCount: 1,
      windowFileLimit: 0,
      windowPageLimit: 0,
      windowProbeLimit: 0,
      windowIndex,
      windowLogUri: windowMatch
        ? `${root}/logs/windows/${windowMatch[1]}.json`
        : '',
      windowSizeBytes: 0,
      oversizedSingleton: false,
      windowPdfPages: 0,
      windowEstimatedProbes: 0,
    }
  })
}

export function mergeMiningJobs(
  localJobs: MiningJob[],
  serverJobs: MiningJob[],
): MiningJob[] {
  const merged = new Map(localJobs.map((job) => [job.id, job]))
  for (const server of serverJobs) {
    const local = merged.get(server.id)
    merged.set(
      server.id,
      local
        ? {
            ...local,
            ...server,
            documentFiles: local.documentFiles,
            reason: local.reason || server.reason,
            result: server.result || local.result,
            runId: local.runId || server.runId,
            windowByteLimit: local.windowByteLimit || server.windowByteLimit,
            windowCount: local.windowCount || server.windowCount,
            windowFileLimit: local.windowFileLimit || server.windowFileLimit,
            windowPageLimit: local.windowPageLimit || server.windowPageLimit,
            windowProbeLimit: local.windowProbeLimit || server.windowProbeLimit,
            windowIndex: local.windowIndex || server.windowIndex,
            windowLogUri: local.windowLogUri || server.windowLogUri,
            windowSizeBytes: local.windowSizeBytes || server.windowSizeBytes,
            oversizedSingleton:
              local.oversizedSingleton || server.oversizedSingleton,
            windowPdfPages: local.windowPdfPages || server.windowPdfPages,
            windowEstimatedProbes:
              local.windowEstimatedProbes || server.windowEstimatedProbes,
          }
        : server,
    )
  }
  return [...merged.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 1000)
}

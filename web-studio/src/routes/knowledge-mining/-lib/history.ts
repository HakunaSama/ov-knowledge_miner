import type { CompileResult, CompileTaskHistoryItem } from './api'

export type MiningPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'queued'
  | 'compiling_documents'
  | 'compiling_memory'
  | 'compiling_human'
  | 'awaiting_human'
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
  humanTaskId: string | null
  id: string
  memoryFiles: FileProgress[]
  memorySourceUri: string
  memoryTaskId: string | null
  okfConfigUri: string | null
  phase: MiningPhase
  reason: string
  result: CompileResult | null
  skillUri: string | null
  targetUri: string
  taskId: string | null
  updatedAt: string
}

export type MiningHistory = {
  jobs: MiningJob[]
  selectedJobId: string | null
  version: 1
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
    'compiling_memory',
    'compiling_human',
    'awaiting_human',
    'partial',
    'completed',
    'failed',
    'cancelled',
  ].includes(String(value))
    ? (value as MiningPhase)
    : null
}

function jobIdForTarget(targetUri: string): string {
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
  const legacySourceUri = stringValue(value.sourceUri)
  const documentSourceUri =
    stringValue(value.documentSourceUri) || legacySourceUri
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
    humanTaskId: nullableString(value.humanTaskId),
    id: nullableString(value.id) || jobIdForTarget(targetUri),
    memoryFiles: fileProgress(value.memoryFiles),
    memorySourceUri:
      stringValue(value.memorySourceUri) ||
      `${documentSourceUri.replace(/\/document-sources\/?$/, '')}/team-memory`,
    memoryTaskId: nullableString(value.memoryTaskId),
    okfConfigUri: nullableString(value.okfConfigUri),
    phase,
    reason: stringValue(value.reason),
    result: isRecord(value.result) ? (value.result as CompileResult) : null,
    skillUri: nullableString(value.skillUri),
    targetUri,
    taskId: nullableString(value.taskId),
    updatedAt: nullableString(value.updatedAt) || createdAt,
  }
}

function emptyHistory(): MiningHistory {
  return { jobs: [], selectedJobId: null, version: 1 }
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
        version: 1,
      }
    }
  } catch {
    // Fall through to legacy migration.
  }
  try {
    const legacy = legacyValue
      ? normalizeMiningJob(JSON.parse(legacyValue) as unknown)
      : null
    return legacy
      ? { jobs: [legacy], selectedJobId: legacy.id, version: 1 }
      : emptyHistory()
  } catch {
    return emptyHistory()
  }
}

function phaseForTask(task: CompileTaskHistoryItem): MiningPhase {
  if (task.status === 'failed') return 'failed'
  if (task.status === 'cancelled') return 'cancelled'
  if (task.status === 'completed') {
    if (task.stage === 'salvaged' || task.result?.validation_passed === false)
      return 'partial'
    if (task.result?.investigation_status === 'needs_human_input')
      return 'awaiting_human'
    return 'completed'
  }
  const source = task.request.from.join(' ').toLowerCase()
  if (source.includes('human-answers-')) return 'compiling_human'
  if (source.includes('/team-memory')) return 'compiling_memory'
  return 'compiling_documents'
}

function taskKind(
  task: CompileTaskHistoryItem,
): 'documents' | 'memory' | 'human' {
  const source = task.request.from.join(' ').toLowerCase()
  if (source.includes('human-answers-')) return 'human'
  if (source.includes('/team-memory')) return 'memory'
  return 'documents'
}

export function jobsFromCompileTasks(
  tasks: CompileTaskHistoryItem[],
): MiningJob[] {
  const grouped = new Map<string, CompileTaskHistoryItem[]>()
  for (const task of tasks) {
    if (!task.request.to.startsWith(KNOWLEDGE_MINING_ROOT)) continue
    const current = grouped.get(task.request.to) || []
    current.push(task)
    grouped.set(task.request.to, current)
  }
  return [...grouped.entries()].map(([targetUri, group]) => {
    group.sort((left, right) => left.created_at.localeCompare(right.created_at))
    const latest = group.at(-1)!
    const first = group[0]
    const root = targetUri.replace(/\/wiki\/?$/, '')
    const documents = group.filter((task) => taskKind(task) === 'documents')
    const memory = group.filter((task) => taskKind(task) === 'memory')
    const human = group.filter((task) => taskKind(task) === 'human')
    const documentTask = documents.at(-1)
    const memoryTask = memory.at(-1)
    const humanTask = human.at(-1)
    const latestResult = [...group]
      .reverse()
      .find((task) => Boolean(task.result))?.result
    return {
      createdAt: first.created_at,
      documentFiles: [],
      documentSourceUri: `${root}/document-sources`,
      documentTaskId: documentTask?.task_id || null,
      error: latest.error
        ? `${latest.error.code}: ${latest.error.message}`
        : null,
      humanTaskId: humanTask?.task_id || null,
      id: jobIdForTarget(targetUri),
      memoryFiles: [],
      memorySourceUri: `${root}/team-memory`,
      memoryTaskId: memoryTask?.task_id || null,
      okfConfigUri: latest.request.okf_config || null,
      phase: phaseForTask(latest),
      reason: documents[0]?.request.reason || latest.request.reason,
      result: latest.result || latestResult || null,
      skillUri: latest.request.skill,
      targetUri,
      taskId: latest.task_id,
      updatedAt: latest.updated_at,
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
            memoryFiles: local.memoryFiles,
            reason: local.reason || server.reason,
            result: server.result || local.result,
          }
        : server,
    )
  }
  return [...merged.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 100)
}

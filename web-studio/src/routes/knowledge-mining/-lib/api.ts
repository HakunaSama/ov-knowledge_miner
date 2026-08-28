import llmWikiSkill from '../../../../../examples/compile/ov-compile-skills/llm-wiki/SKILL.md?raw'
import defaultOkfConfig from '../../../../../examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml?raw'

import {
  getOvResult,
  ovClient,
  postFsMkdir,
  postPackImport,
  postResourcesTempUpload,
} from '#/lib/ov-client'

export const LLM_WIKI_SKILL_NAME = 'llm-wiki'
export const DEFAULT_OKF_CONFIG = defaultOkfConfig
const LLM_WIKI_SKILL_VERSION_MARKER =
  'OPENVIKING_KNOWLEDGE_MINING_SKILL_VERSION: 4.3'

export type CompileStatus =
  | 'accepted'
  | 'running'
  | 'committing'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CompileResult = {
  created: string[]
  from: string[]
  link_count: number
  okf_version: string
  page_count: number
  validation_passed?: boolean
  skill: string
  to: string
  unchanged: string[]
  updated: string[]
  warnings: string[]
  views?: CompileView[]
  main_view?: CompileMainView | null
  intermediate_artifacts?: CompileIntermediateArtifact[]
  investigation_status?: 'clear' | 'needs_human_input' | null
  question_count?: number
  source_coverage?: {
    artifact_uri: string
    cited: number
    inspected: number
    merged: number
    skipped: number
    uploaded: number
  } | null
}

export type CompileMainView = {
  derived_views_include_exempt?: boolean
  exempt_paths: string[]
  leaf_categories: string[]
  meta_knowledge?: {
    group_by: 'frontmatter_field'
    id_field: string
    require_complete: boolean
    require_id_directory?: boolean
    shared_view_tags: boolean
  } | null
  root_path: string
  single_source_of_truth: boolean
}

export type CompileIntermediateArtifact = {
  kind:
    | 'run_manifest'
    | 'evidence_ledger'
    | 'investigation_report'
    | 'questionnaire'
    | 'source_coverage'
    | 'candidate_knowledge'
    | 'readlist'
    | 'evidence_history'
  path: string
  uri: string
}

export type CompileViewGroup = {
  description: string
  id: string
  tag: string
  title: string
}

export type CompileView = {
  description: string
  groups: CompileViewGroup[]
  id: string
  selection: 'one_or_more' | 'exactly_one'
  title: string
}

export type CompileTask = {
  checkpoint_available?: boolean
  checkpoint_stage?: string | null
  created_at: string
  error?: {
    code: string
    message: string
  }
  result?: CompileResult
  resumed_from_task_id?: string
  stage: string
  status: CompileStatus
  task_id: string
  updated_at: string
}

export type CompileTaskHistoryItem = CompileTask & {
  request: {
    from: string[]
    okf_config?: string
    reason: string
    skill: string
    to: string
  }
}

type CompileTaskHistory = {
  tasks: CompileTaskHistoryItem[]
  total: number
}

type CompileAccepted = {
  status: 'accepted'
  task_id: string
  to: string
}

type SkillSummary = {
  name?: unknown
  root_uri?: unknown
  uri?: unknown
}

type SkillListResult = {
  skills?: unknown[]
}

type AddResourceResult = {
  errors?: string[]
  root_uri?: string
  status?: string
  task_id?: string
}

type AddSkillResult = {
  root_uri?: string
  uri?: string
}

type SkillDetailResult = {
  content?: string
  root_uri?: string
  uri?: string
}

type TempUploadResult = {
  temp_file_id: string
}

type ImportOvpackResult = {
  uri?: string
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function skillUri(skill: SkillSummary): string {
  if (isString(skill.uri)) return skill.uri
  if (isString(skill.root_uri)) return skill.root_uri
  return ''
}

export function findLlmWikiSkill(value: unknown): string | null {
  const result = value as SkillListResult | null
  const skills = (Array.isArray(result?.skills) ? result.skills : []).filter(
    (skill): skill is SkillSummary =>
      skill !== null && typeof skill === 'object',
  )
  const matches = skills.filter(
    (skill) => skill.name === LLM_WIKI_SKILL_NAME && skillUri(skill),
  )
  const userSkill = matches.find((skill) =>
    skillUri(skill).startsWith('viking://user/'),
  )
  return userSkill
    ? skillUri(userSkill)
    : matches[0]
      ? skillUri(matches[0])
      : null
}

export async function checkVikingBot(): Promise<void> {
  await getOvResult(
    ovClient.client.get({
      url: '/bot/v1/health',
    }),
  )
}

export async function ensureLlmWikiSkill(): Promise<string> {
  const listed = await getOvResult<SkillListResult>(
    ovClient.client.get({
      query: { node_limit: 1000 },
      url: '/api/v1/skills',
    }),
  )
  const existing = findLlmWikiSkill(listed)
  if (existing?.startsWith('viking://user/')) {
    const detail = await getOvResult<SkillDetailResult>(
      ovClient.client.get({
        query: { include_content: true, include_files: false },
        url: `/api/v1/skills/${LLM_WIKI_SKILL_NAME}`,
      }),
    )
    if (detail.content?.includes(LLM_WIKI_SKILL_VERSION_MARKER)) {
      return existing
    }
    const updated = await getOvResult<AddSkillResult>(
      ovClient.client.put({
        body: {
          data: llmWikiSkill,
          source_metadata: {
            operation: 'update',
            source: 'openviking_knowledge_mining',
            type: 'bundled_example',
            version: 5,
          },
          telemetry: true,
          timeout: 300,
          wait: true,
        },
        url: `/api/v1/skills/${LLM_WIKI_SKILL_NAME}`,
      }),
    )
    return updated.root_uri || updated.uri || existing
  }

  const installed = await getOvResult<AddSkillResult>(
    ovClient.client.post({
      body: {
        data: llmWikiSkill,
        source_metadata: {
          operation: 'install',
          source: 'openviking_knowledge_mining',
          type: 'bundled_example',
          version: 5,
        },
        telemetry: true,
        timeout: 300,
        wait: true,
      },
      url: '/api/v1/skills',
    }),
  )
  const uri = installed.root_uri || installed.uri
  if (!isString(uri)) {
    throw new Error('The llm-wiki Skill was installed without a root URI.')
  }
  return uri
}

export async function uploadKnowledgeFile(
  file: File,
  parentUri: string,
  onUploadProgress?: (percent: number) => void,
): Promise<string> {
  const uploaded = await getOvResult<TempUploadResult>(
    postResourcesTempUpload({
      body: {
        file,
        telemetry: true,
      },
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        if (!event.total) return
        onUploadProgress?.(Math.round((event.loaded / event.total) * 100))
      },
    }),
  )
  if (!isString(uploaded.temp_file_id)) {
    throw new Error('Temporary upload did not return a file ID.')
  }

  const imported = await getOvResult<AddResourceResult>(
    ovClient.client.post({
      body: {
        create_parent: true,
        parent: parentUri,
        processing_mode: 'semantic_and_vectors',
        source_name: file.name,
        strict: false,
        telemetry: true,
        temp_file_id: uploaded.temp_file_id,
        timeout: 900,
        wait: true,
      },
      url: '/api/v1/resources',
    }),
  )

  if (imported.status === 'error') {
    throw new Error(
      imported.errors?.join('; ') || `Failed to process ${file.name}.`,
    )
  }
  return imported.root_uri || parentUri
}

function importedResultParentUri(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `viking://resources/knowledge-mining-imports/${timestamp}-${suffix}`
}

export async function importCliResultOvpack(file: File): Promise<string> {
  const uploaded = await getOvResult<TempUploadResult>(
    postResourcesTempUpload({
      body: { file, telemetry: true },
    }),
  )
  if (!isString(uploaded.temp_file_id)) {
    throw new Error('Temporary upload did not return a file ID.')
  }

  const parent = importedResultParentUri()
  await getOvResult(
    postFsMkdir({
      body: {
        description: 'Imported CLI knowledge-mining result',
        uri: parent,
      },
    }),
  )
  const imported = await getOvResult<ImportOvpackResult>(
    postPackImport({
      body: {
        on_conflict: 'fail',
        parent,
        temp_file_id: uploaded.temp_file_id,
        vector_mode: 'auto',
      },
    }),
  )
  if (!isString(imported.uri)) {
    throw new Error('OVPack import did not return a result URI.')
  }
  return imported.uri.replace(/\/$/, '')
}

export type StartCompileInput = {
  from: string[]
  okfConfig: string
  reason: string
  skill: string
  to: string
}

export function buildTeamMemoryCompileInput(input: {
  memorySourceUri: string
  okfConfig: string
  reason: string
  skill: string
  targetUri: string
}): StartCompileInput {
  return {
    from: [input.memorySourceUri],
    okfConfig: input.okfConfig,
    reason: input.reason,
    skill: input.skill,
    to: input.targetUri,
  }
}

export function buildHumanAnswerCompileInput(input: {
  answerSourceUri: string
  okfConfig: string
  reason: string
  skill: string
  targetUri: string
}): StartCompileInput {
  return {
    from: [input.answerSourceUri],
    okfConfig: input.okfConfig,
    reason: input.reason,
    skill: input.skill,
    to: input.targetUri,
  }
}

export async function startCompile(
  input: StartCompileInput,
): Promise<CompileAccepted> {
  return getOvResult<CompileAccepted>(
    ovClient.client.post({
      body: {
        from: input.from,
        okf_config: input.okfConfig,
        reason: input.reason,
        skill: input.skill,
        to: input.to,
      },
      url: '/bot/v1/compile',
    }),
  )
}

export async function writeOkfConfig(
  parentUri: string,
  content: string,
): Promise<string> {
  const uri = `${parentUri.replace(/\/$/, '')}/OKF_CONFIG.yaml`
  await getOvResult(
    ovClient.client.post({
      body: {
        operations: [{ content, mode: 'upsert', uri }],
        root_uri: parentUri,
        telemetry: true,
        wait: false,
      },
      url: '/api/v1/content/batch-write',
    }),
  )
  return uri
}

export async function getCompileTask(taskId: string): Promise<CompileTask> {
  return getOvResult<CompileTask>(
    ovClient.client.get({
      url: `/bot/v1/compile/${encodeURIComponent(taskId)}`,
    }),
  )
}

export async function listCompileTasks(): Promise<CompileTaskHistoryItem[]> {
  const history = await getOvResult<CompileTaskHistory>(
    ovClient.client.get({
      query: { limit: 1000 },
      url: '/bot/v1/compile',
    }),
  )
  return history.tasks
}

export async function cancelCompile(taskId: string): Promise<CompileTask> {
  return getOvResult<CompileTask>(
    ovClient.client.post({
      body: {},
      url: `/bot/v1/compile/${encodeURIComponent(taskId)}/cancel`,
    }),
  )
}

export async function resumeCompile(taskId: string): Promise<CompileAccepted> {
  return getOvResult<CompileAccepted>(
    ovClient.client.post({
      body: {},
      url: `/bot/v1/compile/${encodeURIComponent(taskId)}/resume`,
    }),
  )
}

export function isCompileTerminal(status: CompileStatus | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

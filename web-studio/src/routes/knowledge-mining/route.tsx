import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  BotIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  CircleStopIcon,
  FileIcon,
  FileCogIcon,
  FileTextIcon,
  FileSearchIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  Layers3Icon,
  LoaderCircleIcon,
  NetworkIcon,
  TagsIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import ReactMarkdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Textarea } from '#/components/ui/textarea'
import { useAppConnection } from '#/hooks/use-app-connection'
import { isOvClientError } from '#/lib/ov-client'
import { cn } from '#/lib/utils'
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  formatFileSize,
} from '#/routes/resources/-lib/upload'
import { fetchFileContent, fetchFsTree } from '#/routes/resources/-lib/api'
import type { VikingFsEntry } from '#/routes/resources/-types/viking-fm'

import {
  cancelCompile,
  buildTeamMemoryCompileInput,
  buildHumanAnswerCompileInput,
  checkVikingBot,
  DEFAULT_OKF_CONFIG,
  ensureLlmWikiSkill,
  getCompileTask,
  isCompileTerminal,
  startCompile,
  uploadKnowledgeFile,
  writeOkfConfig,
} from './-lib/api'
import type {
  CompileIntermediateArtifact,
  CompileResult,
  CompileTask,
  CompileView,
} from './-lib/api'
import {
  DOCUMENT_EXTENSIONS,
  MEMORY_EXTENSIONS,
  classifyResourceFolderFiles,
  getFileDisplayName,
  hasSupportedExtension,
} from './-lib/folder-files'
import {
  buildHumanAnswersMarkdown,
  hasAnswer,
  parseCandidateKnowledge,
  parseInvestigationReport,
  parseQuestionnaire,
  parseReadLedger,
  parseSourceCoverage,
} from './-lib/intermediates'
import type {
  CandidateKnowledge,
  Questionnaire,
  QuestionnaireAnswers,
  ReadLedger,
  SourceCoverage,
} from './-lib/intermediates'
import {
  buildMetaKnowledgeUnits,
  buildMetaKnowledgeTree,
  buildMetaKnowledgeViewSections,
} from './-lib/meta-knowledge'
import type {
  MetaKnowledgeTreeNode,
  MetaKnowledgeUnit,
} from './-lib/meta-knowledge'
import { parseWikiPageMetadata } from './-lib/views'
import type { WikiPageMetadata } from './-lib/views'
import { transitionAfterCompletedCompile } from './-lib/workflow'
import {
  findWikiLinkTarget,
  renderDoubleBracketWikiLinks,
} from './-lib/wiki-links'
import { KnowledgeCloudGraph } from './-components/knowledge-cloud-graph'
import { buildKnowledgeGraph } from './-lib/knowledge-graph'

export const Route = createFileRoute('/knowledge-mining')({
  component: KnowledgeMiningRoute,
})

type MiningPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'compiling_documents'
  | 'compiling_memory'
  | 'compiling_human'
  | 'awaiting_human'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'cancelled'

type FileProgress = {
  name: string
  percent: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed'
}

type MiningJob = {
  documentFiles: FileProgress[]
  documentSourceUri: string
  documentTaskId: string | null
  error: string | null
  memoryFiles: FileProgress[]
  memorySourceUri: string
  memoryTaskId: string | null
  humanTaskId: string | null
  phase: MiningPhase
  reason: string
  result: CompileResult | null
  okfConfigUri: string | null
  skillUri: string | null
  targetUri: string
  taskId: string | null
}

function getErrorMessage(error: unknown): string {
  if (isOvClientError(error) || error instanceof Error) return error.message
  return String(error)
}

function createJobUris(): {
  documentSourceUri: string
  memorySourceUri: string
  targetUri: string
} {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
  const root = `viking://resources/knowledge-mining/${timestamp}-${suffix}`
  return {
    documentSourceUri: `${root}/document-sources`,
    memorySourceUri: `${root}/team-memory`,
    targetUri: `${root}/wiki`,
  }
}

function progressFor(files: File[]): FileProgress[] {
  return files.map((file) => ({
    name: getFileDisplayName(file),
    percent: 0,
    status: 'pending',
  }))
}

function newJob(
  documentFiles: File[],
  memoryFiles: File[],
  reason: string,
): MiningJob {
  const { documentSourceUri, memorySourceUri, targetUri } = createJobUris()
  return {
    documentFiles: progressFor(documentFiles),
    documentSourceUri,
    documentTaskId: null,
    error: null,
    memoryFiles: progressFor(memoryFiles),
    memorySourceUri,
    memoryTaskId: null,
    humanTaskId: null,
    phase: 'preparing',
    reason,
    result: null,
    okfConfigUri: null,
    skillUri: null,
    targetUri,
    taskId: null,
  }
}

function readStoredJob(storageKey: string): MiningJob | null {
  try {
    const value = window.sessionStorage.getItem(storageKey)
    if (!value) return null
    const raw = JSON.parse(value) as Omit<Partial<MiningJob>, 'phase'> & {
      files?: FileProgress[]
      sourceUri?: string
      phase?: MiningPhase | 'compiling'
    }
    const job: Partial<MiningJob> = {
      ...raw,
      documentFiles: raw.documentFiles || raw.files || [],
      documentSourceUri: raw.documentSourceUri || raw.sourceUri,
      documentTaskId: raw.documentTaskId || raw.taskId,
      memoryFiles: raw.memoryFiles || [],
      memorySourceUri:
        raw.memorySourceUri || `${raw.sourceUri || ''}/team-memory`,
      memoryTaskId: raw.memoryTaskId || null,
      humanTaskId: raw.humanTaskId || null,
      phase: raw.phase === 'compiling' ? 'compiling_documents' : raw.phase,
      reason: raw.reason || '',
      result: raw.result || null,
    }
    if (
      !job.taskId ||
      !job.documentSourceUri ||
      !job.targetUri ||
      !job.phase ||
      !Array.isArray(job.documentFiles) ||
      !Array.isArray(job.memoryFiles)
    ) {
      return null
    }
    return job as MiningJob
  } catch {
    return null
  }
}

function orderWikiEntries(entries: VikingFsEntry[]): VikingFsEntry[] {
  return entries
    .filter((entry) => !entry.isDir && entry.name.toLowerCase().endsWith('.md'))
    .sort((left, right) => {
      if (left.name === 'index.md') return -1
      if (right.name === 'index.md') return 1
      return left.uri.localeCompare(right.uri)
    })
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

function phaseProgress(phase: MiningPhase, compileTask?: CompileTask): number {
  if (phase === 'idle') return 0
  if (phase === 'preparing') return 5
  if (phase === 'uploading') return 28
  if (phase === 'awaiting_human') return 96
  if (phase === 'partial') return 100
  if (phase === 'completed') return 100
  if (phase === 'failed' || phase === 'cancelled') return 100
  const stage = compileTask?.stage
  const incremental =
    phase === 'compiling_memory' || phase === 'compiling_human'
  if (stage === 'loading_skill') return incremental ? 76 : 38
  if (stage === 'collecting_context') return incremental ? 80 : 44
  if (stage === 'agent') return incremental ? 88 : 56
  if (stage === 'rendering') return incremental ? 93 : 64
  if (stage === 'writing') return incremental ? 96 : 68
  if (stage === 'refreshing' || stage === 'salvaging')
    return incremental ? 98 : 71
  return 38
}

function MetaKnowledgeTreeBranch({
  categoryLabels,
  depth,
  expandedPaths,
  facets,
  metadata,
  node,
  onSelect,
  selectedUri,
  toggleExpanded,
}: {
  categoryLabels: Record<string, string>
  depth: number
  expandedPaths: Set<string>
  facets: string[]
  metadata: Partial<Record<string, WikiPageMetadata>>
  node: MetaKnowledgeTreeNode
  onSelect: (uri: string) => void
  selectedUri: string | null
  toggleExpanded: (path: string) => void
}) {
  const expanded = expandedPaths.has(node.path)
  const unit = node.unit
  const firstEntry = unit
    ? facets.map((facet) => unit.entries[facet]).find(Boolean)
    : undefined
  const title = firstEntry
    ? metadata[firstEntry.uri]?.title || unit?.name || node.name
    : node.name
  const presentCount = unit
    ? facets.filter((facet) => unit.entries[facet]).length
    : 0
  const descendantUnits = unit
    ? 1
    : node.children.reduce(
        (count, child) => count + (child.unit ? 1 : child.children.length),
        0,
      )

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors hover:bg-muted"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => toggleExpanded(node.path)}
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {expanded ? (
          <FolderOpenIcon className="size-4 shrink-0 text-primary" />
        ) : (
          <FolderIcon className="size-4 shrink-0 text-primary" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {unit ? (
          <Badge
            variant={
              presentCount === facets.length ? 'secondary' : 'destructive'
            }
            className="h-5 shrink-0 px-1.5 text-[9px]"
          >
            {presentCount}/{facets.length}
          </Badge>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {descendantUnits}
          </span>
        )}
      </button>
      {expanded ? (
        <div>
          {node.children.map((child) => (
            <MetaKnowledgeTreeBranch
              key={child.path}
              categoryLabels={categoryLabels}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              facets={facets}
              metadata={metadata}
              node={child}
              onSelect={onSelect}
              selectedUri={selectedUri}
              toggleExpanded={toggleExpanded}
            />
          ))}
          {unit ? (
            <div
              className="grid grid-cols-3 gap-1 pb-2 pr-2"
              style={{ paddingLeft: `${28 + depth * 14}px` }}
            >
              {facets.map((facet) => {
                const entry = unit.entries[facet]
                return entry ? (
                  <button
                    key={`${unit.id}-${facet}`}
                    type="button"
                    className={cn(
                      'rounded-md border px-1.5 py-1.5 text-left text-[10px] transition-colors hover:bg-muted',
                      selectedUri === entry.uri &&
                        'border-primary bg-primary/10 text-primary',
                    )}
                    onClick={() => onSelect(entry.uri)}
                  >
                    <span className="block font-semibold">{facet}</span>
                    <span className="block truncate opacity-70">
                      {categoryLabels[facet] || facet}
                    </span>
                  </button>
                ) : (
                  <div
                    key={`${unit.id}-${facet}`}
                    className="rounded-md border border-dashed px-1.5 py-1.5 text-[10px] text-muted-foreground"
                  >
                    <span className="block font-semibold">{facet}</span>
                    <span className="block truncate">—</span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function MetaKnowledgeTreeView({
  categoryLabels,
  facets,
  metadata,
  units,
  onSelect,
  selectedUri,
}: {
  categoryLabels: Record<string, string>
  facets: string[]
  metadata: Partial<Record<string, WikiPageMetadata>>
  units: MetaKnowledgeUnit[]
  onSelect: (uri: string) => void
  selectedUri: string | null
}) {
  const tree = React.useMemo(() => buildMetaKnowledgeTree(units), [units])
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
    () => new Set(),
  )

  React.useEffect(() => {
    setExpandedPaths((current) => {
      const next = new Set(current)
      for (const root of tree) {
        next.add(root.path)
        for (const child of root.children) next.add(child.path)
      }
      return next
    })
  }, [tree])

  const toggleExpanded = React.useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return tree.map((node) => (
    <MetaKnowledgeTreeBranch
      key={node.path}
      categoryLabels={categoryLabels}
      depth={0}
      expandedPaths={expandedPaths}
      facets={facets}
      metadata={metadata}
      node={node}
      onSelect={onSelect}
      selectedUri={selectedUri}
      toggleExpanded={toggleExpanded}
    />
  ))
}

function SourceCoveragePanel({
  coverage,
  labels,
}: {
  coverage: SourceCoverage
  labels: Record<string, string>
}) {
  const { summary } = coverage
  const metrics = [
    ['uploaded', summary.uploaded],
    ['inspected', summary.inspected],
    ['cited', summary.cited],
    ['merged', summary.merged],
    ['skipped', summary.skipped],
  ] as const
  return (
    <div className="space-y-4 rounded-xl border bg-background p-4 md:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metrics.map(([key, value]) => (
          <div key={key} className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">{labels[key]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {coverage.sources.map((source) => (
          <div key={source.resource} className="rounded-lg border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  source.status === 'skipped' ? 'destructive' : 'secondary'
                }
              >
                {labels[source.status]}
              </Badge>
              <Badge variant="outline">{labels.inspected}</Badge>
              <span className="min-w-0 flex-1 break-all font-mono text-[11px]">
                {source.resource}
              </span>
            </div>
            {source.reason ? (
              <p className="mt-2 leading-5 text-muted-foreground">
                {labels.reason}：{source.reason}
              </p>
            ) : null}
            {source.merged_into ? (
              <p className="mt-1 break-all leading-5 text-muted-foreground">
                {labels.mergedInto}：{source.merged_into}
              </p>
            ) : null}
            {source.page_paths.length > 0 ? (
              <p className="mt-1 leading-5 text-muted-foreground">
                {labels.outputs}：{source.page_paths.join('、')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function KnowledgeMiningRoute() {
  const navigate = useNavigate()
  const { t } = useTranslation('knowledgeMining')
  const { identityScopeKey } = useAppConnection()
  const jobStorageKey = `openviking.knowledge-mining.${identityScopeKey}`
  const [documentFiles, setDocumentFiles] = React.useState<File[]>([])
  const [memoryFiles, setMemoryFiles] = React.useState<File[]>([])
  const [okfConfigFile, setOkfConfigFile] = React.useState<File | null>(null)
  const [reason, setReason] = React.useState(() => t('reason.default'))
  const [job, setJob] = React.useState<MiningJob | null>(() =>
    readStoredJob(jobStorageKey),
  )
  const [selectedUri, setSelectedUri] = React.useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = React.useState('main')
  const [questionnaireAnswers, setQuestionnaireAnswers] =
    React.useState<QuestionnaireAnswers>({})
  const previousDefaultReasonRef = React.useRef(t('reason.default'))
  const okfConfigInputRef = React.useRef<HTMLInputElement>(null)
  const resourceFolderInputRef = React.useRef<HTMLInputElement>(null)

  const setResourceFolderInputRef = React.useCallback(
    (input: HTMLInputElement | null) => {
      resourceFolderInputRef.current = input
      input?.setAttribute('webkitdirectory', '')
      input?.setAttribute('directory', '')
    },
    [],
  )

  React.useEffect(() => {
    const previousDefault = previousDefaultReasonRef.current
    const nextDefault = t('reason.default')
    previousDefaultReasonRef.current = nextDefault
    setReason((current) =>
      current === previousDefault ? nextDefault : current,
    )
  }, [t])

  React.useEffect(() => {
    try {
      if (job?.taskId) {
        window.sessionStorage.setItem(jobStorageKey, JSON.stringify(job))
      } else {
        window.sessionStorage.removeItem(jobStorageKey)
      }
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [job, jobStorageKey])

  const addDocumentFiles = React.useCallback(
    (incoming: File[]) => {
      const next = [...documentFiles]
      for (const file of incoming) {
        if (!hasSupportedExtension(file, DOCUMENT_EXTENSIONS)) {
          toast.error(t('errors.unsupportedFile', { name: file.name }))
          continue
        }
        if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
          toast.error(
            t('errors.fileTooLarge', {
              name: file.name,
              size: formatFileSize(MAX_UPLOAD_FILE_SIZE_BYTES),
            }),
          )
          continue
        }
        if (
          next.some(
            (current) =>
              current.name === file.name &&
              current.size === file.size &&
              current.lastModified === file.lastModified,
          )
        ) {
          continue
        }
        next.push(file)
      }
      setDocumentFiles(next)
    },
    [documentFiles, t],
  )

  const documentDropzone = useDropzone({
    accept: {
      'application/msword': ['.doc'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx',
      ],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'text/markdown': ['.md', '.markdown'],
    },
    disabled: Boolean(
      job &&
      !['partial', 'completed', 'failed', 'cancelled'].includes(job.phase),
    ),
    multiple: true,
    onDrop: addDocumentFiles,
  })

  const addMemoryFiles = React.useCallback(
    (incoming: File[]) => {
      const next = [...memoryFiles]
      for (const file of incoming) {
        if (!hasSupportedExtension(file, MEMORY_EXTENSIONS)) {
          toast.error(t('errors.unsupportedMemoryFile', { name: file.name }))
          continue
        }
        if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
          toast.error(
            t('errors.fileTooLarge', {
              name: file.name,
              size: formatFileSize(MAX_UPLOAD_FILE_SIZE_BYTES),
            }),
          )
          continue
        }
        if (
          next.some(
            (current) =>
              current.name === file.name &&
              current.size === file.size &&
              current.lastModified === file.lastModified,
          )
        ) {
          continue
        }
        next.push(file)
      }
      setMemoryFiles(next)
    },
    [memoryFiles, t],
  )

  const memoryDropzone = useDropzone({
    accept: {
      'application/json': ['.json'],
      'application/yaml': ['.yaml', '.yml'],
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt', '.text'],
    },
    disabled: Boolean(
      job &&
      !['partial', 'completed', 'failed', 'cancelled'].includes(job.phase),
    ),
    multiple: true,
    onDrop: addMemoryFiles,
  })

  const addResourceFolderFiles = React.useCallback(
    (incoming: File[]) => {
      const classified = classifyResourceFolderFiles(incoming)
      addDocumentFiles(classified.documents)
      addMemoryFiles(classified.memory)
      toast.success(
        t('upload.folder.summary', {
          documents: classified.documents.length,
          memory: classified.memory.length,
          skipped: classified.skipped.length,
        }),
      )
    },
    [addDocumentFiles, addMemoryFiles, t],
  )

  const compileQuery = useQuery({
    enabled: Boolean(job?.taskId),
    queryFn: () => getCompileTask(job?.taskId || ''),
    queryKey: ['knowledge-mining-compile', identityScopeKey, job?.taskId],
    refetchInterval: (query) =>
      isCompileTerminal(query.state.data?.status) ? false : 2_000,
    retry: 2,
  })
  const compileTask = compileQuery.data
  const effectiveCompileResult = compileTask?.result || job?.result || null
  const hasVisibleResults = Boolean(
    job &&
    ['awaiting_human', 'compiling_human', 'partial', 'completed'].includes(
      job.phase,
    ) &&
    effectiveCompileResult,
  )

  const incrementalMutation = useMutation({
    mutationFn: async (currentJob: MiningJob) =>
      startCompile(
        buildTeamMemoryCompileInput({
          memorySourceUri: currentJob.memorySourceUri,
          okfConfig: currentJob.okfConfigUri || '',
          reason: `${currentJob.reason}\n\n${t('memory.incrementalReason')}`,
          skill: currentJob.skillUri || '',
          targetUri: currentJob.targetUri,
        }),
      ),
    onError: (error) => {
      const message = getErrorMessage(error)
      setJob((current) =>
        current ? { ...current, error: message, phase: 'failed' } : current,
      )
      toast.error(message)
    },
    onSuccess: (accepted) => {
      setJob((current) =>
        current
          ? {
              ...current,
              error: null,
              memoryTaskId: accepted.task_id,
              phase: 'compiling_memory',
              taskId: accepted.task_id,
            }
          : current,
      )
    },
  })

  const humanAnswerMutation = useMutation({
    mutationFn: async (questionnaire: Questionnaire) => {
      if (!job) throw new Error(t('errors.missingJob'))
      const answeredAt = new Date().toISOString()
      const content = buildHumanAnswersMarkdown(
        questionnaire,
        questionnaireAnswers,
        answeredAt,
      )
      const fileName = `human-answers-${answeredAt.replace(/[^0-9]/g, '').slice(0, 14)}.md`
      const answerSourceUri = await uploadKnowledgeFile(
        new File([content], fileName, {
          lastModified: Date.now(),
          type: 'text/markdown',
        }),
        job.memorySourceUri,
      )
      return startCompile(
        buildHumanAnswerCompileInput({
          answerSourceUri,
          okfConfig: job.okfConfigUri || '',
          reason: `${job.reason}\n\n${t('questionnaire.incrementalReason')}`,
          skill: job.skillUri || '',
          targetUri: job.targetUri,
        }),
      )
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: (accepted) => {
      setJob((current) =>
        current
          ? {
              ...current,
              error: null,
              humanTaskId: accepted.task_id,
              phase: 'compiling_human',
              taskId: accepted.task_id,
            }
          : current,
      )
    },
  })

  React.useEffect(() => {
    if (!compileTask || !isCompileTerminal(compileTask.status)) return
    if (compileTask.task_id !== job?.taskId) return
    if (compileTask.status === 'completed') {
      const transition = transitionAfterCompletedCompile({
        hasMemoryFiles: job.memoryFiles.length > 0,
        memoryTaskStarted: Boolean(job.memoryTaskId),
        phase: job.phase,
        result: compileTask.result,
        taskStage: compileTask.stage,
      })
      if (transition === 'show_partial_result') {
        setJob((current) =>
          current
            ? {
                ...current,
                error: null,
                phase: 'partial',
                result: compileTask.result || current.result,
              }
            : current,
        )
        return
      }
      if (transition === 'start_memory_compile') {
        if (!incrementalMutation.isPending && !job.memoryTaskId) {
          setJob((current) =>
            current
              ? { ...current, result: compileTask.result || current.result }
              : current,
          )
          incrementalMutation.mutate(job)
        }
        return
      }
      if (transition === 'await_human_evidence') {
        setJob((current) =>
          current
            ? {
                ...current,
                error: null,
                phase: 'awaiting_human',
                result: compileTask.result || current.result,
              }
            : current,
        )
        setSelectedViewId('questionnaire')
        return
      }
      if (transition !== 'complete_workflow') return
      setJob((current) =>
        current
          ? {
              ...current,
              error: null,
              phase: 'completed',
              result: compileTask.result || current.result,
            }
          : current,
      )
      return
    }
    const error = compileTask.error
      ? `${compileTask.error.code}: ${compileTask.error.message}`
      : compileTask.status === 'cancelled'
        ? t('status.cancelledDescription')
        : t('errors.compileFailed')
    setJob((current) =>
      current
        ? {
            ...current,
            error,
            phase: compileTask.status === 'cancelled' ? 'cancelled' : 'failed',
          }
        : current,
    )
  }, [
    compileTask,
    incrementalMutation.isPending,
    incrementalMutation.mutate,
    job,
    t,
  ])

  React.useEffect(() => {
    if (!compileQuery.error) return
    setJob((current) =>
      current
        ? {
            ...current,
            error: getErrorMessage(compileQuery.error),
            phase: 'failed',
          }
        : current,
    )
  }, [compileQuery.error])

  const wikiQuery = useQuery({
    enabled: hasVisibleResults,
    queryFn: () =>
      fetchFsTree(job?.targetUri || '', {
        levelLimit: 8,
        nodeLimit: 1000,
      }),
    queryKey: ['knowledge-mining-result', identityScopeKey, job?.targetUri],
  })
  const wikiEntries = React.useMemo(
    () => orderWikiEntries(wikiQuery.data?.nodes || []),
    [wikiQuery.data],
  )
  const mainViewFacets = React.useMemo(
    () =>
      effectiveCompileResult?.main_view?.leaf_categories || [
        'what',
        'why',
        'how',
      ],
    [effectiveCompileResult?.main_view?.leaf_categories],
  )
  const metadataQuery = useQuery({
    enabled: hasVisibleResults && wikiEntries.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(
        wikiEntries.map(async (entry) => {
          const page = await fetchFileContent(entry.uri, { raw: true })
          return [entry.uri, parseWikiPageMetadata(page.content)] as const
        }),
      )
      return Object.fromEntries(pages) as Record<string, WikiPageMetadata>
    },
    queryKey: [
      'knowledge-mining-page-metadata',
      identityScopeKey,
      job?.targetUri,
      wikiEntries.map((entry) => entry.uri).join('|'),
    ],
  })
  const metaKnowledgeUnits = React.useMemo(
    () =>
      buildMetaKnowledgeUnits(
        job?.targetUri || '',
        wikiEntries.map((entry) => ({ name: entry.name, uri: entry.uri })),
        mainViewFacets,
        metadataQuery.data || {},
      ),
    [job?.targetUri, mainViewFacets, metadataQuery.data, wikiEntries],
  )
  const knowledgeEntries = React.useMemo(
    () =>
      metaKnowledgeUnits.flatMap((unit) =>
        mainViewFacets.flatMap((facet) => {
          const entry = unit.entries[facet]
          return entry ? [entry] : []
        }),
      ),
    [mainViewFacets, metaKnowledgeUnits],
  )
  const incompleteMetaKnowledgeCount = React.useMemo(
    () =>
      metaKnowledgeUnits.filter(
        (unit) =>
          mainViewFacets.filter((facet) => unit.entries[facet]).length !==
          mainViewFacets.length,
      ).length,
    [mainViewFacets, metaKnowledgeUnits],
  )
  const knowledgeGraph = React.useMemo(
    () =>
      buildKnowledgeGraph(
        metaKnowledgeUnits,
        metadataQuery.data || {},
        mainViewFacets,
      ),
    [mainViewFacets, metadataQuery.data, metaKnowledgeUnits],
  )
  const compileViews = React.useMemo<CompileView[]>(
    () => effectiveCompileResult?.views || [],
    [effectiveCompileResult?.views],
  )
  const intermediateArtifacts = React.useMemo<CompileIntermediateArtifact[]>(
    () => effectiveCompileResult?.intermediate_artifacts || [],
    [effectiveCompileResult?.intermediate_artifacts],
  )
  const questionnaireArtifact = intermediateArtifacts.find(
    (artifact) => artifact.kind === 'questionnaire',
  )
  const investigationArtifact = intermediateArtifacts.find(
    (artifact) => artifact.kind === 'investigation_report',
  )
  const sourceCoverageArtifact = intermediateArtifacts.find(
    (artifact) => artifact.kind === 'source_coverage',
  )
  const candidateKnowledgeArtifact = intermediateArtifacts.find(
    (artifact) => artifact.kind === 'candidate_knowledge',
  )
  const readlistArtifact = intermediateArtifacts.find(
    (artifact) => artifact.kind === 'readlist',
  )
  const sourceCoverageQuery = useQuery<SourceCoverage>({
    enabled: hasVisibleResults && Boolean(sourceCoverageArtifact),
    queryFn: async () => {
      const file = await fetchFileContent(sourceCoverageArtifact?.uri || '', {
        raw: true,
      })
      return parseSourceCoverage(file.content)
    },
    queryKey: [
      'knowledge-mining-source-coverage',
      identityScopeKey,
      sourceCoverageArtifact?.uri,
      compileTask?.task_id,
    ],
  })
  const candidateKnowledgeQuery = useQuery<CandidateKnowledge>({
    enabled: hasVisibleResults && Boolean(candidateKnowledgeArtifact),
    queryFn: async () => {
      const file = await fetchFileContent(
        candidateKnowledgeArtifact?.uri || '',
        {
          raw: true,
        },
      )
      return parseCandidateKnowledge(file.content)
    },
    queryKey: [
      'knowledge-mining-candidates',
      identityScopeKey,
      candidateKnowledgeArtifact?.uri,
      compileTask?.task_id,
    ],
  })
  const readLedgerQuery = useQuery<ReadLedger>({
    enabled: hasVisibleResults && Boolean(readlistArtifact),
    queryFn: async () => {
      const file = await fetchFileContent(readlistArtifact?.uri || '', {
        raw: true,
      })
      return parseReadLedger(file.content)
    },
    queryKey: [
      'knowledge-mining-read-ledger',
      identityScopeKey,
      readlistArtifact?.uri,
      compileTask?.task_id,
    ],
  })
  const questionnaireQuery = useQuery<Questionnaire>({
    enabled: hasVisibleResults && Boolean(questionnaireArtifact),
    queryFn: async () => {
      const file = await fetchFileContent(questionnaireArtifact?.uri || '', {
        raw: true,
      })
      return parseQuestionnaire(file.content)
    },
    queryKey: [
      'knowledge-mining-questionnaire',
      identityScopeKey,
      questionnaireArtifact?.uri,
      compileTask?.task_id,
    ],
  })
  const investigationQuery = useQuery({
    enabled: hasVisibleResults && Boolean(investigationArtifact),
    queryFn: async () => {
      const file = await fetchFileContent(investigationArtifact?.uri || '', {
        raw: true,
      })
      return parseInvestigationReport(file.content)
    },
    queryKey: [
      'knowledge-mining-investigation',
      identityScopeKey,
      investigationArtifact?.uri,
      compileTask?.task_id,
    ],
  })
  const questionnaireComplete = Boolean(
    questionnaireQuery.data &&
    questionnaireQuery.data.questions.every((question) =>
      hasAnswer(question, questionnaireAnswers[question.id]),
    ),
  )
  const selectedView = compileViews.find((view) => view.id === selectedViewId)
  const viewGuideKey =
    selectedViewId === 'intermediates'
      ? 'intermediates'
      : selectedViewId === 'coverage'
        ? 'coverage'
        : selectedViewId === 'questionnaire'
          ? 'questionnaire'
          : selectedViewId === 'graph'
            ? 'graph'
            : selectedViewId === 'domain'
              ? 'domain'
              : selectedViewId === 'usage'
                ? 'usage'
                : 'main'
  const viewSections = React.useMemo(
    () =>
      selectedView
        ? buildMetaKnowledgeViewSections(
            metaKnowledgeUnits,
            metadataQuery.data || {},
            selectedView,
            mainViewFacets,
          )
        : [],
    [mainViewFacets, metadataQuery.data, metaKnowledgeUnits, selectedView],
  )

  React.useEffect(() => {
    if (knowledgeEntries.length === 0) return
    setSelectedUri((current) =>
      current && knowledgeEntries.some((entry) => entry.uri === current)
        ? current
        : knowledgeEntries[0].uri,
    )
  }, [knowledgeEntries])

  React.useEffect(() => {
    if (
      selectedViewId === 'main' ||
      selectedViewId === 'graph' ||
      selectedViewId === 'intermediates' ||
      selectedViewId === 'coverage' ||
      selectedViewId === 'questionnaire' ||
      metadataQuery.isLoading
    )
      return
    const entries = viewSections.flatMap((section) => section.entries)
    if (entries.length === 0) return
    setSelectedUri((current) =>
      current && entries.some((entry) => entry.uri === current)
        ? current
        : entries[0].uri,
    )
  }, [metadataQuery.isLoading, selectedViewId, viewSections])

  React.useEffect(() => {
    if (
      selectedViewId === 'intermediates' &&
      intermediateArtifacts.length > 0
    ) {
      setSelectedUri((current) =>
        current &&
        intermediateArtifacts.some((artifact) => artifact.uri === current)
          ? current
          : intermediateArtifacts[0].uri,
      )
    }
    if (selectedViewId === 'questionnaire' && questionnaireArtifact) {
      setSelectedUri(questionnaireArtifact.uri)
    }
  }, [intermediateArtifacts, questionnaireArtifact, selectedViewId])

  const contentQuery = useQuery({
    enabled: Boolean(selectedUri),
    queryFn: () => fetchFileContent(selectedUri || '', { raw: true }),
    queryKey: ['knowledge-mining-page', identityScopeKey, selectedUri],
  })
  const selectedMetadata = React.useMemo(
    () =>
      contentQuery.data
        ? parseWikiPageMetadata(contentQuery.data.content)
        : null,
    [contentQuery.data],
  )

  const startMutation = useMutation({
    mutationFn: async () => {
      const effectiveReason = reason.trim() || t('reason.default')
      const nextJob = newJob(documentFiles, memoryFiles, effectiveReason)
      setSelectedUri(null)
      setSelectedViewId('main')
      setQuestionnaireAnswers({})
      setJob(nextJob)
      try {
        try {
          await checkVikingBot()
        } catch (error) {
          throw new Error(t('errors.botUnavailable'), { cause: error })
        }
        const skillUri = await ensureLlmWikiSkill()
        setJob((current) =>
          current ? { ...current, phase: 'uploading', skillUri } : current,
        )

        const uploadBatch = async (
          batch: File[],
          parentUri: string,
          field: 'documentFiles' | 'memoryFiles',
        ) => {
          for (const [index, file] of batch.entries()) {
            setJob((current) =>
              current
                ? {
                    ...current,
                    [field]: current[field].map((progress, progressIndex) =>
                      progressIndex === index
                        ? { ...progress, percent: 0, status: 'uploading' }
                        : progress,
                    ),
                  }
                : current,
            )
            await uploadKnowledgeFile(file, parentUri, (percent) => {
              setJob((current) =>
                current
                  ? {
                      ...current,
                      [field]: current[field].map((progress, progressIndex) =>
                        progressIndex === index
                          ? { ...progress, percent, status: 'uploading' }
                          : progress,
                      ),
                    }
                  : current,
              )
            })
            setJob((current) =>
              current
                ? {
                    ...current,
                    [field]: current[field].map((progress, progressIndex) =>
                      progressIndex === index
                        ? { ...progress, percent: 100, status: 'completed' }
                        : progress,
                    ),
                  }
                : current,
            )
          }
        }

        await uploadBatch(
          documentFiles,
          nextJob.documentSourceUri,
          'documentFiles',
        )
        if (memoryFiles.length > 0) {
          await uploadBatch(memoryFiles, nextJob.memorySourceUri, 'memoryFiles')
        }

        const okfConfigUri = await writeOkfConfig(
          nextJob.documentSourceUri,
          okfConfigFile ? await okfConfigFile.text() : DEFAULT_OKF_CONFIG,
        )
        setJob((current) => (current ? { ...current, okfConfigUri } : current))

        const accepted = await startCompile({
          from: [nextJob.documentSourceUri],
          okfConfig: okfConfigUri,
          reason: effectiveReason,
          skill: skillUri,
          to: nextJob.targetUri,
        })
        setJob((current) =>
          current
            ? {
                ...current,
                documentTaskId: accepted.task_id,
                phase: 'compiling_documents',
                skillUri,
                taskId: accepted.task_id,
              }
            : current,
        )
        return accepted
      } catch (error) {
        const message = getErrorMessage(error)
        setJob((current) =>
          current ? { ...current, error: message, phase: 'failed' } : current,
        )
        throw error
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompile(job?.taskId || ''),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const isActive = Boolean(
    job &&
    [
      'preparing',
      'uploading',
      'compiling_documents',
      'compiling_memory',
      'compiling_human',
    ].includes(job.phase),
  )
  const progress = phaseProgress(job?.phase || 'idle', compileTask)
  const currentStage =
    job?.phase === 'awaiting_human'
      ? 'awaiting_human'
      : compileTask?.stage || job?.phase || 'idle'

  function reset(): void {
    setJob(null)
    setDocumentFiles([])
    setMemoryFiles([])
    setOkfConfigFile(null)
    setSelectedUri(null)
    setSelectedViewId('main')
    setQuestionnaireAnswers({})
    setReason(t('reason.default'))
  }

  return (
    <main className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <BrainCircuitIcon className="size-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                {t('eyebrow')}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {t('title')}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>
          {job ? (
            <Button variant="outline" onClick={reset} disabled={isActive}>
              <RotateCcwIcon />
              {t('actions.newJob')}
            </Button>
          ) : null}
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UploadCloudIcon className="size-4" />
                  {t('upload.title')}
                </CardTitle>
                <CardDescription>{t('upload.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-primary/[0.03] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <FolderTreeIcon className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('upload.folder.title')}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t('upload.folder.hint')}
                        </p>
                        {documentFiles.length > 0 || memoryFiles.length > 0 ? (
                          <p className="mt-1.5 text-xs font-medium text-primary">
                            {t('upload.folder.selected', {
                              documents: documentFiles.length,
                              memory: memoryFiles.length,
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <input
                      ref={setResourceFolderInputRef}
                      className="hidden"
                      type="file"
                      multiple
                      disabled={isActive}
                      onChange={(event) => {
                        addResourceFolderFiles(
                          Array.from(event.currentTarget.files || []),
                        )
                        event.currentTarget.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={isActive}
                      onClick={() => resourceFolderInputRef.current?.click()}
                    >
                      <FolderTreeIcon />
                      {t('upload.folder.choose')}
                    </Button>
                  </div>
                </div>

                <div
                  {...documentDropzone.getRootProps()}
                  className={cn(
                    'rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
                    isActive
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:border-primary/60 hover:bg-primary/[0.03]',
                    documentDropzone.isDragActive &&
                      'border-primary bg-primary/5',
                  )}
                >
                  <input {...documentDropzone.getInputProps()} />
                  <UploadCloudIcon className="mx-auto mb-3 size-9 text-primary/70" />
                  <p className="font-medium">{t('upload.dropzone')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('upload.formats', {
                      size: formatFileSize(MAX_UPLOAD_FILE_SIZE_BYTES),
                    })}
                  </p>
                </div>

                {documentFiles.length > 0 ? (
                  <div className="divide-y overflow-hidden rounded-lg border">
                    {documentFiles.map((file, index) => {
                      const fileProgress = job?.documentFiles[index]
                      return (
                        <div
                          key={`${getFileDisplayName(file)}-${file.lastModified}`}
                          className="p-3"
                        >
                          <div className="flex items-center gap-3">
                            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {getFileDisplayName(file)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                            {fileProgress?.status === 'completed' ? (
                              <CheckCircle2Icon className="size-4 text-emerald-600" />
                            ) : fileProgress?.status === 'uploading' ? (
                              <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                            ) : !isActive ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t('actions.removeFile', {
                                  name: file.name,
                                })}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDocumentFiles((current) =>
                                    current.filter(
                                      (_, currentIndex) =>
                                        currentIndex !== index,
                                    ),
                                  )
                                }}
                              >
                                <XIcon />
                              </Button>
                            ) : null}
                          </div>
                          {fileProgress?.status === 'uploading' ? (
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-[width]"
                                style={{
                                  width: `${Math.max(4, fileProgress.percent)}%`,
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <Layers3Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{t('memory.title')}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('memory.description')}
                      </p>
                    </div>
                  </div>
                  <div
                    {...memoryDropzone.getRootProps()}
                    className={cn(
                      'rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
                      isActive
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:border-primary/60 hover:bg-primary/[0.03]',
                      memoryDropzone.isDragActive &&
                        'border-primary bg-primary/5',
                    )}
                  >
                    <input {...memoryDropzone.getInputProps()} />
                    <p className="text-sm font-medium">
                      {t('memory.dropzone')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('memory.formats')}
                    </p>
                  </div>
                  {memoryFiles.length > 0 ? (
                    <div className="divide-y overflow-hidden rounded-lg border bg-background">
                      {memoryFiles.map((file, index) => {
                        const fileProgress = job?.memoryFiles[index]
                        return (
                          <div
                            key={`memory-${getFileDisplayName(file)}-${file.lastModified}`}
                            className="p-3"
                          >
                            <div className="flex items-center gap-3">
                              <TagsIcon className="size-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {getFileDisplayName(file)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                              {fileProgress?.status === 'completed' ? (
                                <CheckCircle2Icon className="size-4 text-emerald-600" />
                              ) : fileProgress?.status === 'uploading' ? (
                                <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                              ) : !isActive ? (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t('actions.removeFile', {
                                    name: file.name,
                                  })}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setMemoryFiles((current) =>
                                      current.filter(
                                        (_, currentIndex) =>
                                          currentIndex !== index,
                                      ),
                                    )
                                  }}
                                >
                                  <XIcon />
                                </Button>
                              ) : null}
                            </div>
                            {fileProgress?.status === 'uploading' ? (
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-[width]"
                                  style={{
                                    width: `${Math.max(4, fileProgress.percent)}%`,
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                      {t('memory.pipeline.documents')}
                    </span>
                    <span>→</span>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                      {t('memory.pipeline.incremental')}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <FileCogIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t('okfConfig.label')}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {okfConfigFile?.name || t('okfConfig.defaultName')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isActive}
                      onClick={() => okfConfigInputRef.current?.click()}
                    >
                      {t('okfConfig.choose')}
                    </Button>
                    <input
                      ref={okfConfigInputRef}
                      id="knowledge-mining-okf-config"
                      className="hidden"
                      type="file"
                      accept=".yaml,.yml,application/yaml,text/yaml"
                      disabled={isActive}
                      onChange={(event) =>
                        setOkfConfigFile(event.target.files?.[0] || null)
                      }
                    />
                    {okfConfigFile && !isActive ? (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('okfConfig.useDefault')}
                        onClick={() => setOkfConfigFile(null)}
                      >
                        <XIcon />
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t('okfConfig.hint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="mining-reason"
                  >
                    {t('reason.label')}
                  </label>
                  <Textarea
                    id="mining-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={isActive}
                    rows={5}
                    placeholder={t('reason.placeholder')}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('reason.hint')}
                  </p>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={
                    documentFiles.length === 0 ||
                    isActive ||
                    job?.phase === 'awaiting_human' ||
                    job?.phase === 'completed'
                  }
                  onClick={() => startMutation.mutate()}
                >
                  {isActive ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <SparklesIcon />
                  )}
                  {isActive ? t('actions.running') : t('actions.start')}
                </Button>
              </CardContent>
            </Card>

            {job ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <BotIcon className="size-4" />
                      {t('status.title')}
                    </span>
                    <Badge
                      variant={
                        job.phase === 'failed' ? 'destructive' : 'secondary'
                      }
                    >
                      {t(`phases.${job.phase}`)}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{t('status.vikingBot')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                      <span>
                        {t(`stages.${currentStage}`, {
                          defaultValue: currentStage,
                        })}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          job.phase === 'failed'
                            ? 'bg-destructive'
                            : job.phase === 'cancelled'
                              ? 'bg-muted-foreground'
                              : 'bg-primary',
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <dl className="grid gap-2 text-xs text-muted-foreground">
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.documentTaskId')}</dt>
                      <dd className="truncate font-mono text-foreground">
                        {job.documentTaskId || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.memoryTaskId')}</dt>
                      <dd className="truncate font-mono text-foreground">
                        {job.memoryTaskId ||
                          (job.memoryFiles.length > 0
                            ? t('status.pending')
                            : t('status.skipped'))}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.humanTaskId')}</dt>
                      <dd className="truncate font-mono text-foreground">
                        {job.humanTaskId || t('status.skipped')}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.okfConfig')}</dt>
                      <dd className="break-all font-mono text-foreground">
                        {job.okfConfigUri || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.skill')}</dt>
                      <dd className="truncate font-mono text-foreground">
                        {job.skillUri || '—'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[5rem_1fr] gap-2">
                      <dt>{t('status.output')}</dt>
                      <dd className="break-all font-mono text-foreground">
                        {job.targetUri}
                      </dd>
                    </div>
                  </dl>

                  {job.error ? (
                    <Alert variant="destructive">
                      <TriangleAlertIcon />
                      <AlertTitle>{t('errors.title')}</AlertTitle>
                      <AlertDescription className="break-words">
                        {job.error}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {job.taskId &&
                  [
                    'compiling_documents',
                    'compiling_memory',
                    'compiling_human',
                    'cancelled',
                  ].includes(job.phase) ? (
                    <Button
                      variant="outline"
                      disabled={
                        job.phase === 'cancelled' || cancelMutation.isPending
                      }
                      onClick={() => cancelMutation.mutate()}
                    >
                      <CircleStopIcon />
                      {t('actions.cancel')}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="min-h-[620px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTreeIcon className="size-4" />
                {t('results.title')}
              </CardTitle>
              <CardDescription>
                {hasVisibleResults
                  ? job?.phase === 'awaiting_human'
                    ? t('results.awaitingHuman')
                    : job?.phase === 'partial'
                      ? t('results.partial')
                      : t('results.completed', {
                          count: wikiEntries.length,
                        })
                  : t('results.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              {!hasVisibleResults ? (
                <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
                  {isActive ? (
                    <LoaderCircleIcon className="mb-4 size-10 animate-spin text-primary/60" />
                  ) : (
                    <FileTextIcon className="mb-4 size-10 text-muted-foreground/40" />
                  )}
                  <p className="font-medium">
                    {isActive
                      ? t('results.waitingTitle')
                      : t('results.emptyTitle')}
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {isActive
                      ? t('results.waitingDescription')
                      : t('results.emptyDescription')}
                  </p>
                </div>
              ) : wikiQuery.isLoading ? (
                <div className="flex min-h-[480px] items-center justify-center">
                  <LoaderCircleIcon className="size-8 animate-spin text-primary" />
                </div>
              ) : wikiQuery.isError ? (
                <Alert variant="destructive">
                  <TriangleAlertIcon />
                  <AlertTitle>{t('errors.resultLoad')}</AlertTitle>
                  <AlertDescription>
                    {getErrorMessage(wikiQuery.error)}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {job?.phase === 'awaiting_human' ? (
                    <Alert>
                      <ClipboardListIcon />
                      <AlertTitle>{t('questionnaire.needsInput')}</AlertTitle>
                      <AlertDescription>
                        {t('results.awaitingHuman')}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {job?.phase === 'partial' ? (
                    <Alert>
                      <TriangleAlertIcon />
                      <AlertTitle>{t('results.partialTitle')}</AlertTitle>
                      <AlertDescription>
                        {t('results.partial')}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label={t('views.label')}
                  >
                    <Button
                      size="sm"
                      variant={
                        selectedViewId === 'main' ? 'default' : 'outline'
                      }
                      onClick={() => setSelectedViewId('main')}
                    >
                      <FolderTreeIcon />
                      {t('views.main')}
                      <Badge variant="secondary">
                        {knowledgeEntries.length}
                      </Badge>
                    </Button>
                    {sourceCoverageArtifact ? (
                      <Button
                        size="sm"
                        variant={
                          selectedViewId === 'coverage' ? 'default' : 'outline'
                        }
                        onClick={() => setSelectedViewId('coverage')}
                      >
                        <FileSearchIcon />
                        {t('coverage.title')}
                        <Badge variant="secondary">
                          {sourceCoverageQuery.data?.summary.uploaded ||
                            effectiveCompileResult?.source_coverage?.uploaded ||
                            0}
                        </Badge>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={
                        selectedViewId === 'graph' ? 'default' : 'outline'
                      }
                      onClick={() => setSelectedViewId('graph')}
                    >
                      <NetworkIcon />
                      {t('graph.title')}
                      <Badge variant="secondary">
                        {knowledgeGraph.nodes.length}
                      </Badge>
                    </Button>
                    {compileViews.map((view) => (
                      <Button
                        key={view.id}
                        size="sm"
                        variant={
                          selectedViewId === view.id ? 'default' : 'outline'
                        }
                        onClick={() => setSelectedViewId(view.id)}
                      >
                        <TagsIcon />
                        {view.title}
                        <Badge variant="secondary">
                          {knowledgeEntries.length}
                        </Badge>
                      </Button>
                    ))}
                    {intermediateArtifacts.length > 0 ? (
                      <Button
                        size="sm"
                        variant={
                          selectedViewId === 'intermediates'
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => setSelectedViewId('intermediates')}
                      >
                        <FileSearchIcon />
                        {t('intermediates.title')}
                      </Button>
                    ) : null}
                    {questionnaireArtifact ? (
                      <Button
                        size="sm"
                        variant={
                          selectedViewId === 'questionnaire'
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => setSelectedViewId('questionnaire')}
                      >
                        <ClipboardListIcon />
                        {t('questionnaire.title')}
                        {(effectiveCompileResult?.question_count || 0) > 0 ? (
                          <Badge variant="secondary">
                            {effectiveCompileResult?.question_count}
                          </Badge>
                        ) : null}
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-xl border bg-muted/15 p-4">
                    <p className="text-sm font-semibold">
                      {t(`views.guides.${viewGuideKey}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(`views.guides.${viewGuideKey}.purpose`)}
                    </p>
                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.contentLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {t(`views.guides.${viewGuideKey}.content`)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.useLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {t(`views.guides.${viewGuideKey}.use`)}
                        </p>
                      </div>
                    </div>
                    {viewGuideKey === 'main' &&
                    effectiveCompileResult?.main_view ? (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-md bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                          {t('views.mainStructure', {
                            categories:
                              effectiveCompileResult.main_view.leaf_categories.join(
                                ' / ',
                              ),
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('views.metaSummary', {
                            files: knowledgeEntries.length,
                            units: metaKnowledgeUnits.length,
                          })}
                        </p>
                        {incompleteMetaKnowledgeCount > 0 ? (
                          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {t('views.incompleteMetaSummary', {
                              count: incompleteMetaKnowledgeCount,
                            })}
                          </p>
                        ) : null}
                      </div>
                    ) : selectedView ? (
                      <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                        <p>{selectedView.description}</p>
                        <p>
                          {t('views.metaSummary', {
                            files: knowledgeEntries.length,
                            units: metaKnowledgeUnits.length,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {selectedViewId === 'intermediates' &&
                    (candidateKnowledgeQuery.data || readLedgerQuery.data) ? (
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-muted-foreground">
                            {t('intermediates.candidates')}
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {candidateKnowledgeQuery.data?.summary.total ?? '—'}
                          </p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-muted-foreground">
                            {t('intermediates.promoted')}
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {candidateKnowledgeQuery.data?.summary.promoted ??
                              '—'}
                          </p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-muted-foreground">
                            {t('intermediates.readCoverage')}
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {readLedgerQuery.data
                              ? `${readLedgerQuery.data.summary.completed_required_reads}/${readLedgerQuery.data.summary.required_reads}`
                              : '—'}
                          </p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-muted-foreground">
                            {t('intermediates.documentCoverage')}
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {readLedgerQuery.data
                              ? `${readLedgerQuery.data.summary.complete_source_units}/${readLedgerQuery.data.summary.source_units}`
                              : '—'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {selectedViewId === 'graph' ? (
                    <KnowledgeCloudGraph
                      graph={knowledgeGraph}
                      sourceName={job?.targetUri || 'OpenViking Wiki'}
                    />
                  ) : selectedViewId === 'coverage' ? (
                    sourceCoverageQuery.isLoading ? (
                      <div className="flex min-h-[480px] items-center justify-center rounded-xl border">
                        <LoaderCircleIcon className="size-8 animate-spin text-primary" />
                      </div>
                    ) : sourceCoverageQuery.isError ? (
                      <Alert variant="destructive">
                        <TriangleAlertIcon />
                        <AlertTitle>{t('coverage.loadError')}</AlertTitle>
                        <AlertDescription>
                          {getErrorMessage(sourceCoverageQuery.error)}
                        </AlertDescription>
                      </Alert>
                    ) : sourceCoverageQuery.data ? (
                      <SourceCoveragePanel
                        coverage={sourceCoverageQuery.data}
                        labels={{
                          cited: t('coverage.cited'),
                          inspected: t('coverage.inspected'),
                          merged: t('coverage.merged'),
                          mergedInto: t('coverage.mergedInto'),
                          outputs: t('coverage.outputs'),
                          reason: t('coverage.reason'),
                          skipped: t('coverage.skipped'),
                          uploaded: t('coverage.uploaded'),
                        }}
                      />
                    ) : (
                      <Alert>
                        <FileSearchIcon />
                        <AlertTitle>{t('coverage.legacyTitle')}</AlertTitle>
                        <AlertDescription>
                          {t('coverage.legacyDescription')}
                        </AlertDescription>
                      </Alert>
                    )
                  ) : (
                    <div className="grid min-h-[520px] overflow-hidden rounded-xl border lg:grid-cols-[240px_minmax(0,1fr)]">
                      <ScrollArea className="max-h-[680px] border-b bg-muted/20 lg:border-b-0 lg:border-r">
                        <div className="space-y-1 p-2">
                          {selectedViewId === 'main' ? (
                            <MetaKnowledgeTreeView
                              categoryLabels={{
                                how: t('views.leafLabels.how'),
                                what: t('views.leafLabels.what'),
                                why: t('views.leafLabels.why'),
                              }}
                              facets={mainViewFacets}
                              metadata={metadataQuery.data || {}}
                              units={metaKnowledgeUnits}
                              onSelect={setSelectedUri}
                              selectedUri={selectedUri}
                            />
                          ) : selectedViewId === 'intermediates' ? (
                            intermediateArtifacts.map((artifact) => (
                              <button
                                key={artifact.uri}
                                type="button"
                                className={cn(
                                  'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                                  selectedUri === artifact.uri &&
                                    'bg-primary/10 text-primary',
                                )}
                                onClick={() => setSelectedUri(artifact.uri)}
                              >
                                <FileCogIcon className="mt-0.5 size-4 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">
                                    {t(`intermediates.kinds.${artifact.kind}`)}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {artifact.path}
                                  </span>
                                </span>
                              </button>
                            ))
                          ) : selectedViewId === 'questionnaire' ? (
                            <div className="space-y-3 p-3">
                              <Badge
                                variant={
                                  investigationQuery.data?.status ===
                                  'needs_human_input'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {investigationQuery.data?.status ===
                                'needs_human_input'
                                  ? t('questionnaire.needsInput')
                                  : t('questionnaire.clear')}
                              </Badge>
                              {investigationQuery.data?.conflicts.map(
                                (issue) => (
                                  <div
                                    key={issue.id}
                                    className="rounded-lg border p-3"
                                  >
                                    <p className="text-xs font-semibold">
                                      {t('questionnaire.conflict')} · {issue.id}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                      {issue.summary}
                                    </p>
                                  </div>
                                ),
                              )}
                              {investigationQuery.data?.evidence_gaps.map(
                                (issue) => (
                                  <div
                                    key={issue.id}
                                    className="rounded-lg border p-3"
                                  >
                                    <p className="text-xs font-semibold">
                                      {t('questionnaire.evidenceGap')} ·{' '}
                                      {issue.id}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                      {issue.summary}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : metadataQuery.isLoading ? (
                            <div className="flex justify-center p-6">
                              <LoaderCircleIcon className="size-5 animate-spin text-primary" />
                            </div>
                          ) : (
                            viewSections.map((section) => (
                              <div key={section.id} className="pb-3">
                                <div className="px-3 pb-1 pt-2">
                                  <p className="text-xs font-semibold">
                                    {section.title}
                                  </p>
                                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                    {section.description}
                                  </p>
                                </div>
                                {section.units.length > 0 ? (
                                  <MetaKnowledgeTreeView
                                    categoryLabels={{
                                      how: t('views.leafLabels.how'),
                                      what: t('views.leafLabels.what'),
                                      why: t('views.leafLabels.why'),
                                    }}
                                    facets={mainViewFacets}
                                    metadata={metadataQuery.data || {}}
                                    units={section.units}
                                    onSelect={setSelectedUri}
                                    selectedUri={selectedUri}
                                  />
                                ) : (
                                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                    {t('views.emptyGroup')}
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                      <ScrollArea className="max-h-[680px] bg-background">
                        {selectedViewId === 'questionnaire' ? (
                          questionnaireQuery.isLoading ? (
                            <div className="flex min-h-[480px] items-center justify-center">
                              <LoaderCircleIcon className="size-8 animate-spin text-primary" />
                            </div>
                          ) : questionnaireQuery.isError ? (
                            <div className="p-5">
                              <Alert variant="destructive">
                                <TriangleAlertIcon />
                                <AlertTitle>
                                  {t('questionnaire.loadError')}
                                </AlertTitle>
                                <AlertDescription>
                                  {getErrorMessage(questionnaireQuery.error)}
                                </AlertDescription>
                              </Alert>
                            </div>
                          ) : questionnaireQuery.data?.status === 'open' &&
                            questionnaireQuery.data.questions.length ? (
                            <div className="space-y-5 p-5 md:p-7">
                              <div>
                                <h3 className="font-semibold">
                                  {t('questionnaire.formTitle')}
                                </h3>
                                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                  {t('questionnaire.formDescription')}
                                </p>
                              </div>
                              {questionnaireQuery.data.questions.map(
                                (question, index) => {
                                  const answer =
                                    questionnaireAnswers[question.id]
                                  return (
                                    <div
                                      key={question.id}
                                      className="space-y-3 rounded-xl border p-4"
                                    >
                                      <div>
                                        <p className="text-sm font-semibold">
                                          {index + 1}. {question.prompt}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                          {question.reason}
                                        </p>
                                      </div>
                                      {question.kind === 'free_text' ? (
                                        <Textarea
                                          disabled={isActive}
                                          value={
                                            typeof answer === 'string'
                                              ? answer
                                              : ''
                                          }
                                          placeholder={t(
                                            'questionnaire.answerPlaceholder',
                                          )}
                                          onChange={(event) =>
                                            setQuestionnaireAnswers(
                                              (current) => ({
                                                ...current,
                                                [question.id]:
                                                  event.target.value,
                                              }),
                                            )
                                          }
                                        />
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {question.options.map((option) => {
                                            const selected =
                                              question.kind ===
                                              'multiple_choice'
                                                ? Array.isArray(answer) &&
                                                  answer.includes(option)
                                                : answer === option
                                            return (
                                              <Button
                                                key={option}
                                                type="button"
                                                size="sm"
                                                variant={
                                                  selected
                                                    ? 'default'
                                                    : 'outline'
                                                }
                                                disabled={isActive}
                                                onClick={() =>
                                                  setQuestionnaireAnswers(
                                                    (current) => {
                                                      if (
                                                        question.kind !==
                                                        'multiple_choice'
                                                      ) {
                                                        return {
                                                          ...current,
                                                          [question.id]: option,
                                                        }
                                                      }
                                                      const answer =
                                                        current[question.id]
                                                      const values: string[] =
                                                        Array.isArray(answer)
                                                          ? answer
                                                          : []
                                                      return {
                                                        ...current,
                                                        [question.id]:
                                                          values.includes(
                                                            option,
                                                          )
                                                            ? values.filter(
                                                                (value) =>
                                                                  value !==
                                                                  option,
                                                              )
                                                            : [
                                                                ...values,
                                                                option,
                                                              ],
                                                      }
                                                    },
                                                  )
                                                }
                                              >
                                                {option}
                                              </Button>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                },
                              )}
                              <Button
                                disabled={
                                  !questionnaireComplete ||
                                  humanAnswerMutation.isPending ||
                                  isActive
                                }
                                onClick={() => {
                                  if (questionnaireQuery.data) {
                                    humanAnswerMutation.mutate(
                                      questionnaireQuery.data,
                                    )
                                  }
                                }}
                              >
                                {humanAnswerMutation.isPending ? (
                                  <LoaderCircleIcon className="animate-spin" />
                                ) : (
                                  <SparklesIcon />
                                )}
                                {t('questionnaire.submit')}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex min-h-[480px] flex-col items-center justify-center p-6 text-center">
                              <CheckCircle2Icon className="mb-3 size-9 text-emerald-600" />
                              <p className="font-medium">
                                {questionnaireQuery.data?.status === 'answered'
                                  ? t('questionnaire.answered')
                                  : t('questionnaire.noQuestions')}
                              </p>
                              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                                {questionnaireQuery.data?.status === 'answered'
                                  ? t('questionnaire.answeredDescription')
                                  : t('questionnaire.noQuestionsDescription')}
                              </p>
                            </div>
                          )
                        ) : contentQuery.isLoading ? (
                          <div className="flex min-h-[480px] items-center justify-center">
                            <LoaderCircleIcon className="size-8 animate-spin text-primary" />
                          </div>
                        ) : contentQuery.isError ? (
                          <div className="p-5">
                            <Alert variant="destructive">
                              <TriangleAlertIcon />
                              <AlertTitle>{t('errors.pageLoad')}</AlertTitle>
                              <AlertDescription>
                                {getErrorMessage(contentQuery.error)}
                              </AlertDescription>
                            </Alert>
                          </div>
                        ) : contentQuery.data &&
                          selectedViewId === 'intermediates' ? (
                          <pre className="min-h-[480px] overflow-x-auto p-5 font-mono text-xs leading-6 md:p-7">
                            {prettyJson(contentQuery.data.content)}
                          </pre>
                        ) : contentQuery.data ? (
                          <div>
                            {selectedMetadata &&
                              (selectedMetadata.sources.length > 0 ||
                                selectedMetadata.knowledgeLinks.length > 0) && (
                                <div className="grid gap-4 border-b bg-muted/20 p-5 text-sm md:grid-cols-2 md:p-7">
                                  <div>
                                    <p className="mb-2 font-medium">
                                      {t('provenance.sources')}
                                    </p>
                                    <div className="space-y-2">
                                      {selectedMetadata.sources.map(
                                        (source, index) => (
                                          <button
                                            className="block w-full rounded-md border bg-background p-2 text-left hover:border-primary"
                                            key={`${source.resource}-${index}`}
                                            onClick={() =>
                                              navigate({
                                                to: '/playground',
                                                search: {
                                                  file: source.resource,
                                                },
                                              })
                                            }
                                            type="button"
                                          >
                                            <span className="block font-medium">
                                              {source.title || source.resource}
                                            </span>
                                            <span className="mt-1 block font-mono text-xs text-muted-foreground">
                                              {source.kind} · {source.stage}
                                            </span>
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="mb-2 font-medium">
                                      {t('provenance.knowledgeLinks')}
                                    </p>
                                    <p className="mb-2 text-xs leading-5 text-muted-foreground">
                                      {t('provenance.knowledgeLinksHint')}
                                    </p>
                                    {selectedMetadata.knowledgeLinks.length >
                                    0 ? (
                                      <div className="space-y-2">
                                        {selectedMetadata.knowledgeLinks.map(
                                          (link, index) => (
                                            <button
                                              className="block w-full rounded-md border bg-background p-2 text-left hover:border-primary"
                                              key={`${link.resource}-${index}`}
                                              onClick={() =>
                                                navigate({
                                                  to: '/playground',
                                                  search: {
                                                    file: link.resource,
                                                  },
                                                })
                                              }
                                              type="button"
                                            >
                                              <span className="block font-medium">
                                                {link.title || link.resource}
                                              </span>
                                              <span className="mt-1 block text-xs text-muted-foreground">
                                                {link.relation} ·{' '}
                                                {link.direction}
                                              </span>
                                              {link.context ? (
                                                <span className="mt-1 block text-xs text-muted-foreground">
                                                  {t('provenance.linkContext', {
                                                    context: link.context,
                                                  })}
                                                </span>
                                              ) : null}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-muted-foreground">
                                        {t('provenance.noKnowledgeLinks')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            <article className="prose prose-sm max-w-none p-5 text-foreground dark:prose-invert md:p-7 prose-headings:scroll-mt-20 prose-a:text-primary prose-pre:overflow-x-auto">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ href, node: _node, ...props }) => {
                                    const target = findWikiLinkTarget(
                                      href,
                                      selectedUri,
                                      wikiEntries.map((entry) => entry.uri),
                                    )
                                    const externalKnowledgeUri =
                                      !target && href?.startsWith('viking://')
                                    return (
                                      <a
                                        {...props}
                                        href={href}
                                        onClick={
                                          target
                                            ? (event) => {
                                                event.preventDefault()
                                                setSelectedUri(target)
                                              }
                                            : externalKnowledgeUri
                                              ? (event) => {
                                                  event.preventDefault()
                                                  navigate({
                                                    to: '/playground',
                                                    search: { file: href },
                                                  })
                                                }
                                              : undefined
                                        }
                                      />
                                    )
                                  },
                                }}
                              >
                                {renderDoubleBracketWikiLinks(
                                  stripFrontmatter(contentQuery.data.content),
                                  wikiEntries.map((entry) => ({
                                    name: entry.name,
                                    uri: entry.uri,
                                  })),
                                )}
                              </ReactMarkdown>
                            </article>
                          </div>
                        ) : null}
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

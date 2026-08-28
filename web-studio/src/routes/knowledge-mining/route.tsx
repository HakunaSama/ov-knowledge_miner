import * as React from 'react'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  BotIcon,
  BrainCircuitIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  ClipboardListIcon,
  CircleStopIcon,
  FileIcon,
  FileCogIcon,
  FileTextIcon,
  FileSearchIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  HistoryIcon,
  Layers3Icon,
  LoaderCircleIcon,
  NetworkIcon,
  PlusIcon,
  TagsIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  TerminalIcon,
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
  importCliResultOvpack,
  isCompileTerminal,
  listCompileTasks,
  resumeCompile,
  startCompile,
  uploadKnowledgeFile,
  writeOkfConfig,
} from './-lib/api'
import type {
  CompileIntermediateArtifact,
  CompileTask,
  CompileView,
} from './-lib/api'
import {
  jobsFromCompileTasks,
  mergeMiningJobs,
  parseMiningHistory,
} from './-lib/history'
import type {
  FileProgress,
  MiningHistory,
  MiningJob,
  MiningPhase,
} from './-lib/history'
import {
  hasOtherPendingMiningJob,
  miningQueuePosition,
  nextQueuedMiningJob,
} from './-lib/queue'
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
  buildFacetFirstMetaKnowledgeTree,
  buildMetaKnowledgeUnits,
  buildMetaKnowledgeViewSections,
  buildPerspectiveMetaKnowledgeTree,
} from './-lib/meta-knowledge'
import type {
  FacetFirstMetaKnowledgeTreeNode,
  MetaKnowledgeUnit,
  MetaKnowledgeViewSection,
} from './-lib/meta-knowledge'
import { parseWikiPageMetadata } from './-lib/views'
import type { WikiPageMetadata } from './-lib/views'
import { importedMiningJob, inspectCliResult } from './-lib/result-import'
import { transitionAfterCompletedCompile } from './-lib/workflow'
import {
  findWikiLinkTarget,
  renderDoubleBracketWikiLinks,
} from './-lib/wiki-links'
import { KnowledgeCloudGraph } from './-components/knowledge-cloud-graph'
import { CliResultImportCard } from './-components/cli-result-import-card'
import { buildKnowledgeGraph } from './-lib/knowledge-graph'

export const Route = createFileRoute('/knowledge-mining')({
  component: KnowledgeMiningRoute,
})

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
  const now = new Date().toISOString()
  return {
    createdAt: now,
    documentFiles: progressFor(documentFiles),
    documentSourceUri,
    documentTaskId: null,
    error: null,
    memoryFiles: progressFor(memoryFiles),
    memorySourceUri,
    memoryTaskId: null,
    humanTaskId: null,
    id:
      targetUri
        .replace(/\/wiki$/, '')
        .split('/')
        .at(-1) || targetUri,
    phase: 'preparing',
    reason,
    result: null,
    okfConfigUri: null,
    origin: 'studio',
    skillUri: null,
    targetUri,
    taskId: null,
    updatedAt: now,
  }
}

function readMiningHistory(
  historyStorageKey: string,
  legacyJobStorageKey: string,
): MiningHistory {
  try {
    return parseMiningHistory(
      window.localStorage.getItem(historyStorageKey),
      window.sessionStorage.getItem(legacyJobStorageKey),
    )
  } catch {
    return parseMiningHistory(null, null)
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
  if (phase === 'queued') return 34
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
  if (stage === 'source_coverage') return incremental ? 84 : 48
  if (stage === 'candidate_knowledge') return incremental ? 89 : 58
  if (stage === 'page_generation') return incremental ? 93 : 66
  if (stage === 'rendering') return incremental ? 93 : 64
  if (stage === 'writing') return incremental ? 96 : 68
  if (stage === 'refreshing' || stage === 'salvaging')
    return incremental ? 98 : 71
  return 38
}

function FacetFirstKnowledgeTreeBranch({
  depth,
  expandedPaths,
  metadata,
  node,
  onSelect,
  selectedUri,
  toggleExpanded,
}: {
  depth: number
  expandedPaths: Set<string>
  metadata: Partial<Record<string, WikiPageMetadata>>
  node: FacetFirstMetaKnowledgeTreeNode
  onSelect: (uri: string) => void
  selectedUri: string | null
  toggleExpanded: (path: string) => void
}) {
  if (node.entry) {
    const title = metadata[node.entry.uri]?.title || node.entry.name
    return (
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs transition-colors hover:bg-muted',
          selectedUri === node.entry.uri && 'bg-primary/10 text-primary',
        )}
        style={{ paddingLeft: `${28 + depth * 14}px` }}
        onClick={() => onSelect(node.entry?.uri || '')}
      >
        <FileTextIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
    )
  }

  const expanded = expandedPaths.has(node.path)
  const descendantFiles = (
    candidate: FacetFirstMetaKnowledgeTreeNode,
  ): number =>
    candidate.entry
      ? 1
      : candidate.children.reduce(
          (count, child) => count + descendantFiles(child),
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
        <span className="min-w-0 flex-1 truncate font-medium">
          {node.name}
          {node.label ? (
            <span className="ml-1 font-normal text-muted-foreground">
              {node.label}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {descendantFiles(node)}
        </span>
      </button>
      {expanded ? (
        <div>
          {node.children.map((child) => (
            <FacetFirstKnowledgeTreeBranch
              key={child.path}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              metadata={metadata}
              node={child}
              onSelect={onSelect}
              selectedUri={selectedUri}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MetaKnowledgeTreeView({
  facets,
  metadata,
  rootPath,
  sections,
  units = [],
  onSelect,
  selectedUri,
}: {
  facets: string[]
  metadata: Partial<Record<string, WikiPageMetadata>>
  rootPath: string
  sections?: MetaKnowledgeViewSection[]
  units?: MetaKnowledgeUnit[]
  onSelect: (uri: string) => void
  selectedUri: string | null
}) {
  const facetKey = facets.join('|')
  const tree = React.useMemo(
    () =>
      sections
        ? buildPerspectiveMetaKnowledgeTree(sections, facets)
        : buildFacetFirstMetaKnowledgeTree(units, facets, {
            rootPath,
          }),
    [facetKey, facets, rootPath, sections, units],
  )
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
    () => new Set(),
  )

  React.useEffect(() => {
    setExpandedPaths((current) => {
      const next = new Set(current)
      const expand = (node: FacetFirstMetaKnowledgeTreeNode, depth: number) => {
        if (!node.entry && depth < 2) next.add(node.path)
        for (const child of node.children) expand(child, depth + 1)
      }
      for (const root of tree) expand(root, 0)
      return next.size === current.size &&
        [...next].every((path) => current.has(path))
        ? current
        : next
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
    <FacetFirstKnowledgeTreeBranch
      key={node.path}
      depth={0}
      expandedPaths={expandedPaths}
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
  const legacyJobStorageKey = `openviking.knowledge-mining.${identityScopeKey}`
  const historyStorageKey = `openviking.knowledge-mining.history.${identityScopeKey}`
  const [documentFiles, setDocumentFiles] = React.useState<File[]>([])
  const [memoryFiles, setMemoryFiles] = React.useState<File[]>([])
  const [okfConfigFile, setOkfConfigFile] = React.useState<File | null>(null)
  const [reason, setReason] = React.useState(() => t('reason.default'))
  const [history, setHistory] = React.useState<MiningHistory>(() =>
    readMiningHistory(historyStorageKey, legacyJobStorageKey),
  )
  const job = React.useMemo(
    () =>
      history.jobs.find(
        (candidate) => candidate.id === history.selectedJobId,
      ) || null,
    [history.jobs, history.selectedJobId],
  )
  const [selectedUri, setSelectedUri] = React.useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = React.useState('main')
  const [questionnaireAnswers, setQuestionnaireAnswers] =
    React.useState<QuestionnaireAnswers>({})
  const previousDefaultReasonRef = React.useRef(t('reason.default'))
  const okfConfigInputRef = React.useRef<HTMLInputElement>(null)
  const resourceFolderInputRef = React.useRef<HTMLInputElement>(null)
  const historyHydratedRef = React.useRef(false)
  const advancingJobsRef = React.useRef(new Set<string>())
  const queueStartingJobsRef = React.useRef(new Set<string>())

  const updateJob = React.useCallback(
    (
      jobId: string,
      updater: (current: MiningJob) => MiningJob,
      options?: { select?: boolean },
    ) => {
      setHistory((current) => {
        const index = current.jobs.findIndex(
          (candidate) => candidate.id === jobId,
        )
        if (index < 0) return current
        const existing = current.jobs[index]
        const updated = updater(existing)
        if (updated === existing && !options?.select) return current
        const jobs = [...current.jobs]
        jobs[index] = {
          ...updated,
          createdAt: existing.createdAt,
          id: existing.id,
          updatedAt: new Date().toISOString(),
        }
        return {
          ...current,
          jobs,
          selectedJobId: options?.select ? jobId : current.selectedJobId,
        }
      })
    },
    [],
  )

  const addJob = React.useCallback((nextJob: MiningJob) => {
    setHistory((current) => ({
      ...current,
      jobs: [nextJob, ...current.jobs.filter((item) => item.id !== nextJob.id)],
      selectedJobId: nextJob.id,
    }))
  }, [])

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
      window.localStorage.setItem(historyStorageKey, JSON.stringify(history))
      window.sessionStorage.removeItem(legacyJobStorageKey)
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [history, historyStorageKey, legacyJobStorageKey])

  const serverHistoryQuery = useQuery({
    queryFn: listCompileTasks,
    queryKey: ['knowledge-mining-history', identityScopeKey],
    refetchInterval: 15_000,
    retry: 2,
  })

  React.useEffect(() => {
    if (!serverHistoryQuery.data) return
    setHistory((current) => {
      const jobs = mergeMiningJobs(
        current.jobs,
        jobsFromCompileTasks(serverHistoryQuery.data),
      )
      const firstHydration = !historyHydratedRef.current
      historyHydratedRef.current = true
      return {
        ...current,
        jobs,
        selectedJobId:
          current.selectedJobId ||
          (firstHydration ? jobs[0]?.id || null : null),
      }
    })
  }, [serverHistoryQuery.data])

  const schedulingJobs = React.useMemo(
    () => [
      ...history.jobs,
      ...jobsFromCompileTasks(serverHistoryQuery.data || []),
    ],
    [history.jobs, serverHistoryQuery.data],
  )
  const discoveredCliJobCount = React.useMemo(
    () =>
      jobsFromCompileTasks(serverHistoryQuery.data || []).filter(
        (candidate) => candidate.origin === 'cli',
      ).length,
    [serverHistoryQuery.data],
  )

  const showImportedResult = React.useCallback(
    (nextJob: MiningJob) => {
      setSelectedUri(null)
      setSelectedViewId('main')
      setQuestionnaireAnswers({})
      addJob(nextJob)
    },
    [addJob],
  )

  const attachCliResultMutation = useMutation({
    mutationFn: async (targetUri: string) => {
      const inspected = await inspectCliResult(targetUri)
      return importedMiningJob({
        origin: 'cli',
        result: inspected.result,
        scopeSummary: inspected.scopeSummary,
        targetUri: inspected.result.to,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: (nextJob) => {
      showImportedResult(nextJob)
      toast.success(t('cliImport.success.uri'))
    },
  })

  const importCliOvpackMutation = useMutation({
    mutationFn: async (file: File) => {
      const targetUri = await importCliResultOvpack(file)
      const inspected = await inspectCliResult(targetUri)
      return importedMiningJob({
        label: file.name.replace(/\.ovpack$/i, ''),
        origin: 'imported',
        result: inspected.result,
        scopeSummary: inspected.scopeSummary,
        targetUri,
      })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: (nextJob) => {
      showImportedResult(nextJob)
      toast.success(t('cliImport.success.ovpack'))
    },
  })
  const cliImportBusy =
    attachCliResultMutation.isPending || importCliOvpackMutation.isPending

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

  const trackedJobs = React.useMemo(
    () => history.jobs.filter((candidate) => Boolean(candidate.taskId)),
    [history.jobs],
  )
  const compileQueries = useQueries({
    queries: trackedJobs.map((candidate) => ({
      queryFn: () => getCompileTask(candidate.taskId || ''),
      queryKey: [
        'knowledge-mining-compile',
        identityScopeKey,
        candidate.taskId,
      ],
      refetchInterval: (query: { state: { data?: CompileTask } }) =>
        isCompileTerminal(query.state.data?.status) ? false : 2_000,
      retry: 2,
    })),
  })
  const compileTasksByJobId = React.useMemo(
    () =>
      new Map(
        trackedJobs.flatMap((candidate, index) => {
          const task = compileQueries[index]?.data
          return task ? ([[candidate.id, task]] as const) : []
        }),
      ),
    [compileQueries, trackedJobs],
  )
  const compileTask = job ? compileTasksByJobId.get(job.id) : undefined
  const effectiveCompileResult = compileTask?.result || job?.result || null
  const hasVisibleResults = Boolean(
    job &&
    [
      'compiling_memory',
      'compiling_human',
      'awaiting_human',
      'partial',
      'completed',
      'failed',
      'cancelled',
    ].includes(job.phase) &&
    effectiveCompileResult,
  )

  const humanAnswerMutation = useMutation({
    mutationFn: async (questionnaire: Questionnaire) => {
      if (!job) throw new Error(t('errors.missingJob'))
      if (job.origin !== 'studio') {
        throw new Error(t('cliImport.readOnly'))
      }
      const jobId = job.id
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
      const accepted = await startCompile(
        buildHumanAnswerCompileInput({
          answerSourceUri,
          okfConfig: job.okfConfigUri || '',
          reason: `${job.reason}\n\n${t('questionnaire.incrementalReason')}`,
          skill: job.skillUri || '',
          targetUri: job.targetUri,
        }),
      )
      return { accepted, jobId }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: ({ accepted, jobId }) => {
      updateJob(jobId, (current) => ({
        ...current,
        error: null,
        humanTaskId: accepted.task_id,
        phase: 'compiling_human',
        taskId: accepted.task_id,
      }))
    },
  })

  React.useEffect(() => {
    trackedJobs.forEach((trackedJob, index) => {
      const taskQuery = compileQueries[index]
      const task = taskQuery.data
      if (taskQuery.error && !task) {
        updateJob(trackedJob.id, (current) =>
          current.phase === 'failed' &&
          current.error === getErrorMessage(taskQuery.error)
            ? current
            : {
                ...current,
                error: getErrorMessage(taskQuery.error),
                phase: 'failed',
              },
        )
        return
      }
      if (!task || !isCompileTerminal(task.status)) return
      if (task.task_id !== trackedJob.taskId) return
      if (task.status !== 'completed') {
        const error = task.error
          ? `${task.error.code}: ${task.error.message}`
          : task.status === 'cancelled'
            ? t('status.cancelledDescription')
            : t('errors.compileFailed')
        const phase = task.status === 'cancelled' ? 'cancelled' : 'failed'
        updateJob(trackedJob.id, (current) =>
          current.phase === phase && current.error === error
            ? current
            : { ...current, error, phase },
        )
        return
      }
      const transition = transitionAfterCompletedCompile({
        hasMemoryFiles: trackedJob.memoryFiles.length > 0,
        memoryTaskStarted: Boolean(trackedJob.memoryTaskId),
        phase: trackedJob.phase,
        result: task.result,
        taskStage: task.stage,
      })
      if (transition === 'show_partial_result') {
        updateJob(trackedJob.id, (current) =>
          current.phase === 'partial' && current.result === task.result
            ? current
            : {
                ...current,
                error: null,
                phase: 'partial',
                result: task.result || current.result,
              },
        )
        return
      }
      if (transition === 'start_memory_compile') {
        if (advancingJobsRef.current.has(trackedJob.id)) return
        advancingJobsRef.current.add(trackedJob.id)
        updateJob(trackedJob.id, (current) => ({
          ...current,
          result: task.result || current.result,
        }))
        void startCompile(
          buildTeamMemoryCompileInput({
            memorySourceUri: trackedJob.memorySourceUri,
            okfConfig: trackedJob.okfConfigUri || '',
            reason: `${trackedJob.reason}\n\n${t('memory.incrementalReason')}`,
            skill: trackedJob.skillUri || '',
            targetUri: trackedJob.targetUri,
          }),
        )
          .then((accepted) => {
            updateJob(trackedJob.id, (current) => ({
              ...current,
              error: null,
              memoryTaskId: accepted.task_id,
              phase: 'compiling_memory',
              taskId: accepted.task_id,
            }))
          })
          .catch((error: unknown) => {
            const message = getErrorMessage(error)
            updateJob(trackedJob.id, (current) => ({
              ...current,
              error: message,
              phase: 'failed',
            }))
            toast.error(message)
          })
          .finally(() => advancingJobsRef.current.delete(trackedJob.id))
        return
      }
      if (transition === 'await_human_evidence') {
        updateJob(trackedJob.id, (current) =>
          current.phase === 'awaiting_human' && current.result === task.result
            ? current
            : {
                ...current,
                error: null,
                phase: 'awaiting_human',
                result: task.result || current.result,
              },
        )
        if (trackedJob.id === history.selectedJobId) {
          setSelectedViewId('questionnaire')
        }
        return
      }
      if (transition !== 'complete_workflow') return
      updateJob(trackedJob.id, (current) =>
        current.phase === 'completed' && current.result === task.result
          ? current
          : {
              ...current,
              error: null,
              phase: 'completed',
              result: task.result || current.result,
            },
      )
    })
  }, [compileQueries, history.selectedJobId, t, trackedJobs, updateJob])

  React.useEffect(() => {
    if (!serverHistoryQuery.isSuccess) return
    const queuedJob = nextQueuedMiningJob(schedulingJobs)
    if (!queuedJob || queueStartingJobsRef.current.has(queuedJob.id)) return
    if (!queuedJob.okfConfigUri || !queuedJob.skillUri) {
      updateJob(queuedJob.id, (current) => ({
        ...current,
        error: t('errors.incompleteQueueJob'),
        phase: 'failed',
      }))
      return
    }

    queueStartingJobsRef.current.add(queuedJob.id)
    void startCompile({
      from: [queuedJob.documentSourceUri],
      okfConfig: queuedJob.okfConfigUri,
      reason: queuedJob.reason,
      skill: queuedJob.skillUri,
      to: queuedJob.targetUri,
    })
      .then((accepted) => {
        updateJob(queuedJob.id, (current) => ({
          ...current,
          documentTaskId: accepted.task_id,
          error: null,
          phase: 'compiling_documents',
          taskId: accepted.task_id,
        }))
        toast.success(t('queue.started', { name: queuedJob.reason }))
      })
      .catch((error: unknown) => {
        const message = getErrorMessage(error)
        updateJob(queuedJob.id, (current) => ({
          ...current,
          error: message,
          phase: 'failed',
        }))
        toast.error(message)
      })
      .finally(() => queueStartingJobsRef.current.delete(queuedJob.id))
  }, [schedulingJobs, serverHistoryQuery.isSuccess, t, updateJob])

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
      effectiveCompileResult?.main_view?.facet_categories ||
      effectiveCompileResult?.main_view?.leaf_categories ||
      [],
    [
      effectiveCompileResult?.main_view?.facet_categories,
      effectiveCompileResult?.main_view?.leaf_categories,
    ],
  )
  const mainViewRoot = effectiveCompileResult?.main_view?.root_path || ''
  const hasConfiguredMainView = Boolean(
    effectiveCompileResult?.main_view &&
    mainViewFacets.length > 0 &&
    mainViewRoot &&
    effectiveCompileResult.main_view.path_structure?.length,
  )
  const metadataQuery = useQuery({
    enabled: hasVisibleResults && wikiEntries.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(
        wikiEntries.map(async (entry) => {
          const page = await fetchFileContent(entry.uri, { raw: true })
          return [
            entry.uri,
            parseWikiPageMetadata(
              page.content,
              effectiveCompileResult?.main_view?.meta_knowledge?.id_field,
            ),
          ] as const
        }),
      )
      return Object.fromEntries(pages) as Record<string, WikiPageMetadata>
    },
    queryKey: [
      'knowledge-mining-page-metadata',
      identityScopeKey,
      job?.targetUri,
      effectiveCompileResult?.main_view?.meta_knowledge?.id_field,
      wikiEntries.map((entry) => entry.uri).join('|'),
    ],
  })
  const metaKnowledgeUnits = React.useMemo(
    () =>
      buildMetaKnowledgeUnits(
        job?.targetUri || '',
        wikiEntries.map((entry) => ({ name: entry.name, uri: entry.uri })),
        effectiveCompileResult?.main_view,
        metadataQuery.data || {},
      ),
    [
      effectiveCompileResult?.main_view,
      job?.targetUri,
      metadataQuery.data,
      wikiEntries,
    ],
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
  const compileViews = React.useMemo<CompileView[]>(() => {
    return effectiveCompileResult?.views || []
  }, [effectiveCompileResult?.views])
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
  const systemViewGuideKey =
    selectedViewId === 'intermediates'
      ? 'intermediates'
      : selectedViewId === 'coverage'
        ? 'coverage'
        : selectedViewId === 'questionnaire'
          ? 'questionnaire'
          : selectedViewId === 'graph'
            ? 'graph'
            : 'main'
  const selectedViewPaths = React.useMemo(
    () =>
      selectedView?.groups
        .map((group) =>
          group.path?.length
            ? group.path.map((segment) => segment.title).join(' / ')
            : group.title,
        )
        .join(' · ') || '',
    [selectedView],
  )
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
      addJob(nextJob)
      try {
        try {
          await checkVikingBot()
        } catch (error) {
          throw new Error(t('errors.botUnavailable'), { cause: error })
        }
        const skillUri = await ensureLlmWikiSkill()
        updateJob(nextJob.id, (current) => ({
          ...current,
          phase: 'uploading',
          skillUri,
        }))

        const uploadBatch = async (
          batch: File[],
          parentUri: string,
          field: 'documentFiles' | 'memoryFiles',
        ) => {
          for (const [index, file] of batch.entries()) {
            updateJob(nextJob.id, (current) => ({
              ...current,
              [field]: current[field].map((progress, progressIndex) =>
                progressIndex === index
                  ? { ...progress, percent: 0, status: 'uploading' }
                  : progress,
              ),
            }))
            await uploadKnowledgeFile(file, parentUri, (percent) => {
              updateJob(nextJob.id, (current) => ({
                ...current,
                [field]: current[field].map((progress, progressIndex) =>
                  progressIndex === index
                    ? { ...progress, percent, status: 'uploading' }
                    : progress,
                ),
              }))
            })
            updateJob(nextJob.id, (current) => ({
              ...current,
              [field]: current[field].map((progress, progressIndex) =>
                progressIndex === index
                  ? { ...progress, percent: 100, status: 'completed' }
                  : progress,
              ),
            }))
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
        updateJob(nextJob.id, (current) => ({
          ...current,
          okfConfigUri,
          phase: 'queued',
          skillUri,
        }))
        return nextJob.id
      } catch (error) {
        const message = getErrorMessage(error)
        updateJob(nextJob.id, (current) => ({
          ...current,
          error: message,
          phase: 'failed',
        }))
        throw error
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: () => toast.success(t('queue.added')),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompile(job?.taskId || ''),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!job?.taskId) throw new Error(t('errors.missingJob'))
      if (hasOtherPendingMiningJob(schedulingJobs, job.id)) {
        throw new Error(t('errors.queueBusy'))
      }
      const jobId = job.id
      await ensureLlmWikiSkill()
      const accepted = await resumeCompile(job.taskId)
      return { accepted, jobId }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: ({ accepted, jobId }) => {
      updateJob(jobId, (current) => {
        const resumesHuman = current.taskId === current.humanTaskId
        const resumesMemory = current.taskId === current.memoryTaskId
        return {
          ...current,
          documentTaskId:
            !resumesHuman && !resumesMemory
              ? accepted.task_id
              : current.documentTaskId,
          error: null,
          humanTaskId: resumesHuman ? accepted.task_id : current.humanTaskId,
          memoryTaskId: resumesMemory ? accepted.task_id : current.memoryTaskId,
          phase: resumesHuman
            ? 'compiling_human'
            : resumesMemory
              ? 'compiling_memory'
              : 'compiling_documents',
          taskId: accepted.task_id,
        }
      })
      toast.success(t('actions.resumeAccepted'))
    },
  })

  const isActive = Boolean(
    job &&
    [
      'preparing',
      'uploading',
      'queued',
      'compiling_documents',
      'compiling_memory',
      'compiling_human',
    ].includes(job.phase),
  )
  const queuePosition = job ? miningQueuePosition(schedulingJobs, job.id) : null
  const resumeBlocked = Boolean(
    job && hasOtherPendingMiningJob(schedulingJobs, job.id),
  )
  const progress = phaseProgress(job?.phase || 'idle', compileTask)
  const currentStage =
    job?.phase === 'awaiting_human'
      ? 'awaiting_human'
      : compileTask?.stage || job?.phase || 'idle'

  function reset(): void {
    setHistory((current) => ({ ...current, selectedJobId: null }))
    setDocumentFiles([])
    setMemoryFiles([])
    setOkfConfigFile(null)
    setSelectedUri(null)
    setSelectedViewId('main')
    setQuestionnaireAnswers({})
    setReason(t('reason.default'))
  }

  function selectHistoryJob(jobId: string): void {
    setHistory((current) => ({ ...current, selectedJobId: jobId }))
    setSelectedUri(null)
    setSelectedViewId('main')
    setQuestionnaireAnswers({})
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
            <Button
              variant="outline"
              disabled={startMutation.isPending}
              onClick={reset}
            >
              <PlusIcon />
              {t('actions.newJob')}
            </Button>
          ) : null}
        </header>

        <CliResultImportCard
          busy={cliImportBusy}
          discoveredCount={discoveredCliJobCount}
          onAttachUri={(uri) => attachCliResultMutation.mutate(uri)}
          onImportOvpack={(file) => importCliOvpackMutation.mutate(file)}
        />

        {history.jobs.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HistoryIcon className="size-4" />
                    {t('history.title')}
                    <Badge variant="secondary">{history.jobs.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    {t('history.description')}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={startMutation.isPending}
                  onClick={reset}
                >
                  <PlusIcon />
                  {t('history.newJob')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {history.jobs.map((historyJob) => {
                  const historyTask = compileTasksByJobId.get(historyJob.id)
                  const historyQueuePosition = miningQueuePosition(
                    schedulingJobs,
                    historyJob.id,
                  )
                  const historyProgress = phaseProgress(
                    historyJob.phase,
                    historyTask,
                  )
                  const sourceCount =
                    historyJob.documentFiles.length +
                      historyJob.memoryFiles.length ||
                    historyJob.result?.source_coverage?.uploaded ||
                    null
                  const selected = history.selectedJobId === historyJob.id
                  return (
                    <button
                      key={historyJob.id}
                      type="button"
                      className={cn(
                        'w-[18rem] shrink-0 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30',
                        selected &&
                          'border-primary bg-primary/[0.04] ring-1 ring-primary/20',
                      )}
                      onClick={() => selectHistoryJob(historyJob.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={
                            historyJob.phase === 'failed'
                              ? 'destructive'
                              : selected
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {[
                            'preparing',
                            'uploading',
                            'compiling_documents',
                            'compiling_memory',
                            'compiling_human',
                          ].includes(historyJob.phase) ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : historyJob.phase === 'queued' ? (
                            <Clock3Icon />
                          ) : null}
                          {historyQueuePosition
                            ? t('queue.badge', {
                                position: historyQueuePosition,
                              })
                            : t(`phases.${historyJob.phase}`)}
                        </Badge>
                        <span className="flex items-center gap-1.5">
                          {historyJob.origin !== 'studio' ? (
                            <Badge variant="outline">
                              {t(`cliImport.origins.${historyJob.origin}`)}
                            </Badge>
                          ) : null}
                          {selected ? (
                            <span className="text-[10px] font-medium text-primary">
                              {t('history.current')}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-10 text-sm font-medium leading-5">
                        {historyJob.reason || t('history.untitled')}
                      </p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${historyProgress}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {new Intl.DateTimeFormat(undefined, {
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            month: '2-digit',
                          }).format(new Date(historyJob.createdAt))}
                        </span>
                        <span>
                          {sourceCount === null
                            ? t('history.sourcesUnknown')
                            : t('history.sources', { count: sourceCount })}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[9px] text-muted-foreground/80">
                        {historyJob.taskId || historyJob.id}
                      </p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

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
                    startMutation.isPending ||
                    isActive ||
                    job?.phase === 'awaiting_human' ||
                    job?.phase === 'completed'
                  }
                  onClick={() => startMutation.mutate()}
                >
                  {job?.phase === 'queued' ? (
                    <Clock3Icon />
                  ) : isActive || startMutation.isPending ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <SparklesIcon />
                  )}
                  {job?.phase === 'queued'
                    ? t('actions.queued')
                    : isActive || startMutation.isPending
                      ? t('actions.running')
                      : t('actions.start')}
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
                      {queuePosition
                        ? t('queue.badge', { position: queuePosition })
                        : t(`phases.${job.phase}`)}
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
                    {queuePosition ? (
                      <div className="grid grid-cols-[5rem_1fr] gap-2">
                        <dt>{t('status.queuePosition')}</dt>
                        <dd className="font-medium text-foreground">
                          {t('queue.position', { position: queuePosition })}
                        </dd>
                      </div>
                    ) : null}
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
                  ].includes(job.phase) ? (
                    <Button
                      variant="outline"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate()}
                    >
                      <CircleStopIcon />
                      {t('actions.cancel')}
                    </Button>
                  ) : null}
                  {job.phase === 'queued' ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateJob(job.id, (current) => ({
                          ...current,
                          error: null,
                          phase: 'cancelled',
                        }))
                      }
                    >
                      <CircleStopIcon />
                      {t('actions.cancelQueued')}
                    </Button>
                  ) : null}
                  {job.taskId &&
                  ['failed', 'cancelled', 'partial'].includes(job.phase) ? (
                    <Button
                      className="w-full"
                      disabled={resumeMutation.isPending || resumeBlocked}
                      onClick={() => resumeMutation.mutate()}
                    >
                      {resumeMutation.isPending ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <RotateCcwIcon />
                      )}
                      {resumeMutation.isPending
                        ? t('actions.resuming')
                        : t('actions.resume')}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="min-h-[620px]">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2">
                  <FolderTreeIcon className="size-4" />
                  {t('results.title')}
                </span>
                {job?.phase === 'partial' ? (
                  <Badge variant="destructive">
                    {t('results.partialBadge')}
                  </Badge>
                ) : null}
                {job && job.origin !== 'studio' ? (
                  <Badge variant="outline">
                    {t(`cliImport.origins.${job.origin}`)}
                  </Badge>
                ) : null}
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
                  {job?.phase === 'queued' ? (
                    <Clock3Icon className="mb-4 size-10 text-primary/60" />
                  ) : isActive ? (
                    <LoaderCircleIcon className="mb-4 size-10 animate-spin text-primary/60" />
                  ) : (
                    <FileTextIcon className="mb-4 size-10 text-muted-foreground/40" />
                  )}
                  <p className="font-medium">
                    {job?.phase === 'queued'
                      ? t('results.queuedTitle', {
                          position: queuePosition || 1,
                        })
                      : isActive
                        ? t('results.waitingTitle')
                        : t('results.emptyTitle')}
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {job?.phase === 'queued'
                      ? t('results.queuedDescription')
                      : isActive
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
                      {selectedView?.title ||
                        t(`views.guides.${systemViewGuideKey}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {selectedView?.description ||
                        t(`views.guides.${systemViewGuideKey}.purpose`)}
                    </p>
                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.contentLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {selectedView
                            ? selectedViewPaths ||
                              t('views.guides.configured.empty')
                            : t(`views.guides.${systemViewGuideKey}.content`)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.useLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {selectedView
                            ? t('views.guides.configured.use')
                            : t(`views.guides.${systemViewGuideKey}.use`)}
                        </p>
                      </div>
                    </div>
                    {selectedViewId === 'main' &&
                    effectiveCompileResult?.main_view ? (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-md bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                          {t('views.mainStructure', {
                            categories: mainViewFacets.join(' / '),
                            structure:
                              effectiveCompileResult.main_view.path_structure?.join(
                                ' / ',
                              ) || t('views.legacyStructure'),
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
                              categories: mainViewFacets.join(' / '),
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
                            hasConfiguredMainView ? (
                              <MetaKnowledgeTreeView
                                facets={mainViewFacets}
                                metadata={metadataQuery.data || {}}
                                rootPath={mainViewRoot}
                                units={metaKnowledgeUnits}
                                onSelect={setSelectedUri}
                                selectedUri={selectedUri}
                              />
                            ) : (
                              <p className="p-3 text-xs leading-5 text-muted-foreground">
                                {t('views.missingConfig')}
                              </p>
                            )
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
                          ) : hasConfiguredMainView ? (
                            <MetaKnowledgeTreeView
                              facets={mainViewFacets}
                              metadata={metadataQuery.data || {}}
                              rootPath={mainViewRoot}
                              sections={viewSections}
                              onSelect={setSelectedUri}
                              selectedUri={selectedUri}
                            />
                          ) : (
                            <p className="p-3 text-xs leading-5 text-muted-foreground">
                              {t('views.missingConfig')}
                            </p>
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
                              {job?.origin !== 'studio' ? (
                                <Alert>
                                  <TerminalIcon />
                                  <AlertTitle>
                                    {t('cliImport.readOnlyTitle')}
                                  </AlertTitle>
                                  <AlertDescription>
                                    {t('cliImport.readOnly')}
                                  </AlertDescription>
                                </Alert>
                              ) : null}
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
                                          disabled={
                                            isActive || job?.origin !== 'studio'
                                          }
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
                                                disabled={
                                                  isActive ||
                                                  job?.origin !== 'studio'
                                                }
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
                                  isActive ||
                                  job?.origin !== 'studio'
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

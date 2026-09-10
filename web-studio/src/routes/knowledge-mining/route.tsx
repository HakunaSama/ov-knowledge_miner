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
  CircleStopIcon,
  FileIcon,
  FileCogIcon,
  FileTextIcon,
  FileSearchIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  HistoryIcon,
  LoaderCircleIcon,
  NetworkIcon,
  PlusIcon,
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
import { Input } from '#/components/ui/input'
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
import { formatFileSize } from '#/routes/resources/-lib/upload'
import { fetchFileContent, fetchFsTree } from '#/routes/resources/-lib/api'
import type { VikingFsEntry } from '#/routes/resources/-types/viking-fm'

import {
  cancelCompile,
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
  writeKnowledgeMiningLog,
  writeOkfConfig,
} from './-lib/api'
import type {
  CompileIntermediateArtifact,
  CompileMainView,
  CompileTask,
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
  classifyResourceFolderFiles,
  getFileDisplayName,
  hasSupportedExtension,
} from './-lib/folder-files'
import {
  parseCandidateKnowledge,
  parseReadLedger,
  parseSourceCoverage,
} from './-lib/intermediates'
import type {
  CandidateKnowledge,
  ReadLedger,
  SourceCoverage,
} from './-lib/intermediates'
import {
  buildPageRoleTree,
  buildKnowledgePageUnits,
} from './-lib/knowledge-pages'
import type {
  PageRoleTreeNode,
  KnowledgePageUnit,
} from './-lib/knowledge-pages'
import { parseWikiPageMetadata } from './-lib/views'
import type { WikiPageMetadata } from './-lib/views'
import { importedMiningJob, inspectCliResult } from './-lib/result-import'
import { findMarkdownLinkTarget } from './-lib/markdown-links'
import { KnowledgeCloudGraph } from './-components/knowledge-cloud-graph'
import { CliResultImportCard } from './-components/cli-result-import-card'
import { buildKnowledgeGraph } from './-lib/knowledge-graph'
import {
  DEFAULT_WINDOW_BYTE_LIMIT,
  DEFAULT_WINDOW_FILE_LIMIT,
  DEFAULT_WINDOW_PAGE_LIMIT,
  DEFAULT_WINDOW_PROBE_LIMIT,
  MAX_KNOWLEDGE_MINING_FILE_BYTES,
  inspectMiningFiles,
  planMiningWindows,
} from './-lib/windowing'

export const Route = createFileRoute('/knowledge-mining')({
  component: KnowledgeMiningRoute,
})

function getErrorMessage(error: unknown): string {
  if (isOvClientError(error) || error instanceof Error) return error.message
  return String(error)
}

function createRunUris(): {
  rootUri: string
  targetUri: string
} {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 8)
  const root = `viking://resources/knowledge-mining/${timestamp}-${suffix}`
  return {
    rootUri: root,
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

async function newJobs(
  documentFiles: File[],
  reason: string,
  windowFileLimit: number,
  windowByteLimit: number,
  windowPageLimit: number,
  windowProbeLimit: number,
): Promise<Array<{ files: File[]; job: MiningJob }>> {
  const { rootUri, targetUri } = createRunUris()
  const runId = rootUri.split('/').at(-1) || rootUri
  const now = new Date().toISOString()
  const inspectedDocuments = await inspectMiningFiles(documentFiles)
  const planned = planMiningWindows(inspectedDocuments, {
    byteLimit: windowByteLimit,
    fileLimit: windowFileLimit,
    pageLimit: windowPageLimit,
    probeLimit: windowProbeLimit,
  })
  return planned.map((window, offset) => {
    const windowIndex = offset + 1
    const sourceUri = `${rootUri}/windows/${String(windowIndex).padStart(4, '0')}/document-sources`
    const windowLogUri = `${rootUri}/logs/windows/${String(windowIndex).padStart(4, '0')}.json`
    const job: MiningJob = {
      createdAt: now,
      documentFiles: progressFor(window.files.map((item) => item.file)),
      documentSourceUri: sourceUri,
      documentTaskId: null,
      error: null,
      id: `${runId}-w${String(windowIndex).padStart(4, '0')}`,
      phase: 'preparing',
      reason,
      result: null,
      okfConfigUri: null,
      origin: 'studio',
      skillUri: null,
      targetUri,
      taskId: null,
      updatedAt: now,
      runId,
      windowByteLimit,
      windowCount: planned.length,
      windowFileLimit,
      windowPageLimit,
      windowProbeLimit,
      windowIndex,
      windowLogUri,
      windowSizeBytes: window.sizeBytes,
      windowPdfPages: window.pdfPages,
      windowEstimatedProbes: window.estimatedProbes,
      oversizedSingleton: window.oversizedSingleton,
    }
    return { files: window.files.map((item) => item.file), job }
  })
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
  if (phase === 'partial') return 100
  if (phase === 'completed') return 100
  if (phase === 'failed' || phase === 'cancelled') return 100
  const stage = compileTask?.stage
  if (stage === 'loading_skill') return 38
  if (stage === 'collecting_context') return 44
  if (stage === 'agent') return 56
  if (stage === 'source_coverage') return 48
  if (stage === 'candidate_knowledge') return 58
  if (stage === 'page_generation') return 66
  if (stage === 'rendering') return 64
  if (stage === 'writing') return 68
  if (stage === 'refreshing' || stage === 'salvaging') return 71
  return 38
}

function PageRoleKnowledgeTreeBranch({
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
  node: PageRoleTreeNode
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
  const descendantFiles = (candidate: PageRoleTreeNode): number =>
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
            <PageRoleKnowledgeTreeBranch
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

function KnowledgePageTreeView({
  pageRoles,
  metadata,
  rootPath,
  units = [],
  onSelect,
  selectedUri,
}: {
  pageRoles: string[]
  metadata: Partial<Record<string, WikiPageMetadata>>
  rootPath: string
  units?: KnowledgePageUnit[]
  onSelect: (uri: string) => void
  selectedUri: string | null
}) {
  const pageRoleKey = pageRoles.join('|')
  const tree = React.useMemo(
    () =>
      buildPageRoleTree(units, pageRoles, {
        rootPath,
      }),
    [pageRoleKey, pageRoles, rootPath, units],
  )
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
    () => new Set(),
  )

  React.useEffect(() => {
    setExpandedPaths((current) => {
      const next = new Set(current)
      const expand = (node: PageRoleTreeNode, depth: number) => {
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
    <PageRoleKnowledgeTreeBranch
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
                {labels.reason}
                {labels.valueSeparator}
                {source.reason}
              </p>
            ) : null}
            {source.merged_into ? (
              <p className="mt-1 break-all leading-5 text-muted-foreground">
                {labels.mergedInto}
                {labels.valueSeparator}
                {source.merged_into}
              </p>
            ) : null}
            {source.page_paths.length > 0 ? (
              <p className="mt-1 leading-5 text-muted-foreground">
                {labels.outputs}
                {labels.valueSeparator}
                {source.page_paths.join(labels.listSeparator)}
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
  const [okfConfigFile, setOkfConfigFile] = React.useState<File | null>(null)
  const [reason, setReason] = React.useState(() => t('reason.default'))
  const [windowFileLimit, setWindowFileLimit] = React.useState(
    DEFAULT_WINDOW_FILE_LIMIT,
  )
  const [windowByteLimitMiB, setWindowByteLimitMiB] = React.useState(
    DEFAULT_WINDOW_BYTE_LIMIT / 1024 / 1024,
  )
  const [windowPageLimit, setWindowPageLimit] = React.useState(
    DEFAULT_WINDOW_PAGE_LIMIT,
  )
  const [windowProbeLimit, setWindowProbeLimit] = React.useState(
    DEFAULT_WINDOW_PROBE_LIMIT,
  )
  const [history, setHistory] = React.useState<MiningHistory>(() =>
    readMiningHistory(historyStorageKey, legacyJobStorageKey),
  )
  const plannedWindowCount = React.useMemo(() => {
    const options = {
      byteLimit: Math.max(1, windowByteLimitMiB) * 1024 * 1024,
      fileLimit: Math.max(1, Math.floor(windowFileLimit)),
      pageLimit: Math.max(1, Math.floor(windowPageLimit)),
      probeLimit: Math.max(1, Math.floor(windowProbeLimit)),
    }
    return planMiningWindows(documentFiles, options).length
  }, [
    documentFiles,
    windowByteLimitMiB,
    windowFileLimit,
    windowPageLimit,
    windowProbeLimit,
  ])
  const job = React.useMemo(
    () =>
      history.jobs.find(
        (candidate) => candidate.id === history.selectedJobId,
      ) || null,
    [history.jobs, history.selectedJobId],
  )
  const [selectedUri, setSelectedUri] = React.useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = React.useState('main')
  const previousDefaultReasonRef = React.useRef(t('reason.default'))
  const okfConfigInputRef = React.useRef<HTMLInputElement>(null)
  const resourceFolderInputRef = React.useRef<HTMLInputElement>(null)
  const historyHydratedRef = React.useRef(false)
  const queueStartingJobsRef = React.useRef(new Set<string>())
  const uploadingWindowJobsRef = React.useRef(new Set<string>())
  const pendingWindowFilesRef = React.useRef(new Map<string, File[]>())
  const loggedWindowStatesRef = React.useRef(new Set<string>())

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

  const addJobs = React.useCallback((nextJobs: MiningJob[]) => {
    setHistory((current) => ({
      ...current,
      jobs: [
        ...nextJobs,
        ...current.jobs.filter(
          (item) => !nextJobs.some((nextJob) => nextJob.id === item.id),
        ),
      ],
      selectedJobId: nextJobs[0]?.id || current.selectedJobId,
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

  React.useEffect(() => {
    for (const terminalJob of history.jobs.filter((candidate) =>
      ['completed', 'partial', 'failed', 'cancelled'].includes(candidate.phase),
    )) {
      if (
        !terminalJob.windowLogUri ||
        !terminalJob.runId ||
        !terminalJob.windowFileLimit
      )
        continue
      const signature = `${terminalJob.id}:${terminalJob.phase}:${terminalJob.taskId || ''}`
      if (loggedWindowStatesRef.current.has(signature)) continue
      loggedWindowStatesRef.current.add(signature)
      const runJobs = history.jobs
        .filter((candidate) => candidate.runId === terminalJob.runId)
        .sort(
          (left, right) => (left.windowIndex || 1) - (right.windowIndex || 1),
        )
      const rootUri = terminalJob.targetUri.replace(/\/wiki\/?$/, '')
      const publicJob = (candidate: MiningJob) => ({
        error: candidate.error,
        files: candidate.documentFiles,
        oversized_singleton: candidate.oversizedSingleton || false,
        pdf_pages: candidate.windowPdfPages || 0,
        estimated_probes: candidate.windowEstimatedProbes || 0,
        phase: candidate.phase,
        run_id: candidate.runId,
        size_bytes: candidate.windowSizeBytes || 0,
        source_uri: candidate.documentSourceUri,
        target_uri: candidate.targetUri,
        task_id: candidate.taskId,
        updated_at: candidate.updatedAt,
        window_count: candidate.windowCount || 1,
        window_file_limit: candidate.windowFileLimit || 0,
        window_byte_limit: candidate.windowByteLimit || 0,
        window_page_limit: candidate.windowPageLimit || 0,
        window_probe_limit: candidate.windowProbeLimit || 0,
        window_index: candidate.windowIndex || 1,
      })
      void Promise.all([
        writeKnowledgeMiningLog(terminalJob.windowLogUri, {
          version: '1.0',
          window: publicJob(terminalJob),
        }),
        writeKnowledgeMiningLog(`${rootUri}/logs/run.json`, {
          run_id: terminalJob.runId,
          target_uri: terminalJob.targetUri,
          version: '1.0',
          windows: runJobs.map(publicJob),
        }),
      ]).catch(() => {
        loggedWindowStatesRef.current.delete(signature)
      })
    }
  }, [history.jobs])

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
        if (file.size > MAX_KNOWLEDGE_MINING_FILE_BYTES) {
          toast.error(
            t('errors.fileTooLarge', {
              name: file.name,
              size: formatFileSize(MAX_KNOWLEDGE_MINING_FILE_BYTES),
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

  const addResourceFolderFiles = React.useCallback(
    (incoming: File[]) => {
      const classified = classifyResourceFolderFiles(incoming)
      addDocumentFiles(classified.documents)
      toast.success(
        t('upload.folder.summary', {
          documents: classified.documents.length,
          skipped: classified.skipped.length,
        }),
      )
    },
    [addDocumentFiles, t],
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
    ['partial', 'completed', 'failed', 'cancelled'].includes(job.phase) &&
    effectiveCompileResult,
  )

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
      const phase = task.stage === 'salvaged' ? 'partial' : 'completed'
      updateJob(trackedJob.id, (current) =>
        current.phase === phase && current.result === task.result
          ? current
          : {
              ...current,
              error: null,
              phase,
              result: task.result || current.result,
            },
      )
    })
  }, [compileQueries, t, trackedJobs, updateJob])

  React.useEffect(() => {
    const strandedUpload = history.jobs.find(
      (candidate) =>
        candidate.phase === 'uploading' &&
        Boolean(candidate.windowFileLimit) &&
        !pendingWindowFilesRef.current.has(candidate.id),
    )
    if (strandedUpload) {
      updateJob(strandedUpload.id, (current) => ({
        ...current,
        error: t('errors.windowFilesUnavailable'),
        phase: 'failed',
      }))
      return
    }
    const active = schedulingJobs.some((candidate) =>
      ['uploading', 'queued', 'compiling_documents'].includes(candidate.phase),
    )
    if (active) return
    const nextWindow = history.jobs
      .filter((candidate) => candidate.phase === 'preparing')
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          (left.runId || left.id).localeCompare(right.runId || right.id) ||
          (left.windowIndex || 1) - (right.windowIndex || 1),
      )
      .find((candidate) => {
        const priorWindows = history.jobs.filter(
          (item) =>
            item.runId === candidate.runId &&
            (item.windowIndex || 1) < (candidate.windowIndex || 1),
        )
        return priorWindows.every((item) => item.phase === 'completed')
      })
    if (!nextWindow || uploadingWindowJobsRef.current.has(nextWindow.id)) return
    const files = pendingWindowFilesRef.current.get(nextWindow.id)
    if (!files) {
      updateJob(nextWindow.id, (current) => ({
        ...current,
        error: t('errors.windowFilesUnavailable'),
        phase: 'failed',
      }))
      return
    }
    uploadingWindowJobsRef.current.add(nextWindow.id)
    updateJob(nextWindow.id, (current) => ({
      ...current,
      error: null,
      phase: 'uploading',
    }))
    void (async () => {
      for (const [index, file] of files.entries()) {
        const progress = nextWindow.documentFiles[index]
        if (progress.status === 'completed') continue
        updateJob(nextWindow.id, (current) => ({
          ...current,
          documentFiles: current.documentFiles.map(
            (fileProgress, progressIndex) =>
              progressIndex === index
                ? { ...fileProgress, percent: 0, status: 'uploading' }
                : fileProgress,
          ),
        }))
        await uploadKnowledgeFile(
          file,
          nextWindow.documentSourceUri,
          (percent) => {
            updateJob(nextWindow.id, (current) => ({
              ...current,
              documentFiles: current.documentFiles.map(
                (fileProgress, progressIndex) =>
                  progressIndex === index
                    ? { ...fileProgress, percent, status: 'uploading' }
                    : fileProgress,
              ),
            }))
          },
          `${nextWindow.documentSourceUri}/${String(index + 1).padStart(6, '0')}`,
        )
        updateJob(nextWindow.id, (current) => ({
          ...current,
          documentFiles: current.documentFiles.map(
            (fileProgress, progressIndex) =>
              progressIndex === index
                ? { ...fileProgress, percent: 100, status: 'completed' }
                : fileProgress,
          ),
        }))
      }
    })()
      .then(() => {
        pendingWindowFilesRef.current.delete(nextWindow.id)
        updateJob(nextWindow.id, (current) => ({
          ...current,
          phase: 'queued',
        }))
      })
      .catch((error: unknown) => {
        updateJob(nextWindow.id, (current) => ({
          ...current,
          error: getErrorMessage(error),
          phase: 'failed',
        }))
        toast.error(getErrorMessage(error))
      })
      .finally(() => uploadingWindowJobsRef.current.delete(nextWindow.id))
  }, [history.jobs, schedulingJobs, t, updateJob])

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
      reason:
        (queuedJob.windowIndex || 1) > 1
          ? `${queuedJob.reason}\n\n${t('window.incrementalReason', {
              count: queuedJob.windowCount || 1,
              index: queuedJob.windowIndex || 1,
            })}`
          : queuedJob.reason,
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
  // Compile history can contain results produced by an older server schema.
  // Treat the main-view arrays as optional at this UI boundary so selecting a
  // legacy or partially validated result cannot crash the entire route.
  const compatibleMainView = effectiveCompileResult?.main_view as
    | Partial<CompileMainView>
    | null
    | undefined
  const mainViewPageRoles = React.useMemo(
    () =>
      compatibleMainView?.page_roles?.map((role) => role.id) || [],
    [compatibleMainView?.page_roles],
  )
  const mainViewRoot = compatibleMainView?.root_path || ''
  const mainViewPathStructure = compatibleMainView?.path_structure || []
  const hasConfiguredMainView = Boolean(
    compatibleMainView &&
    mainViewPageRoles.length > 0 &&
    mainViewRoot &&
    mainViewPathStructure.length,
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
  const knowledgePageUnits = React.useMemo(
    () =>
      buildKnowledgePageUnits(
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
      knowledgePageUnits.flatMap((unit) =>
        mainViewPageRoles.flatMap((role) => {
          const entry = unit.entries[role]
          return entry ? [entry] : []
        }),
      ),
    [mainViewPageRoles, knowledgePageUnits],
  )
  const knowledgeGraph = React.useMemo(
    () =>
      buildKnowledgeGraph(
        knowledgePageUnits,
        metadataQuery.data || {},
        mainViewPageRoles,
      ),
    [mainViewPageRoles, metadataQuery.data, knowledgePageUnits],
  )
  const intermediateArtifacts = React.useMemo<CompileIntermediateArtifact[]>(
    () => effectiveCompileResult?.intermediate_artifacts || [],
    [effectiveCompileResult?.intermediate_artifacts],
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
  const systemViewGuideKey =
    selectedViewId === 'intermediates'
      ? 'intermediates'
      : selectedViewId === 'coverage'
        ? 'coverage'
        : selectedViewId === 'graph'
          ? 'graph'
          : 'main'
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
  }, [intermediateArtifacts, selectedViewId])

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
      const windowByteLimit = Math.max(1, windowByteLimitMiB) * 1024 * 1024
      const plannedJobs = await newJobs(
        documentFiles,
        effectiveReason,
        Math.max(1, Math.floor(windowFileLimit)),
        windowByteLimit,
        Math.max(1, Math.floor(windowPageLimit)),
        Math.max(1, Math.floor(windowProbeLimit)),
      )
      if (plannedJobs.length === 0) throw new Error(t('errors.missingJob'))
      setSelectedUri(null)
      setSelectedViewId('main')
      try {
        await checkVikingBot()
      } catch (error) {
        throw new Error(t('errors.botUnavailable'), { cause: error })
      }
      const skillUri = await ensureLlmWikiSkill()
      const rootUri = plannedJobs[0].job.targetUri.replace(/\/wiki\/?$/, '')
      const okfConfigUri = await writeOkfConfig(
        rootUri,
        okfConfigFile ? await okfConfigFile.text() : DEFAULT_OKF_CONFIG,
      )
      for (const planned of plannedJobs) {
        pendingWindowFilesRef.current.set(planned.job.id, planned.files)
      }
      addJobs(
        plannedJobs.map(({ job: plannedJob }) => ({
          ...plannedJob,
          okfConfigUri,
          skillUri,
        })),
      )
      return plannedJobs[0].job.id
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
      if (!job) throw new Error(t('errors.missingJob'))
      if (hasOtherPendingMiningJob(schedulingJobs, job.id)) {
        throw new Error(t('errors.queueBusy'))
      }
      const jobId = job.id
      if (!job.taskId) {
        if (!pendingWindowFilesRef.current.has(job.id)) {
          throw new Error(t('errors.windowFilesUnavailable'))
        }
        return { accepted: null, jobId, uploadRetry: true as const }
      }
      await ensureLlmWikiSkill()
      const accepted = await resumeCompile(job.taskId)
      return { accepted, jobId, uploadRetry: false as const }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSuccess: ({ accepted, jobId, uploadRetry }) => {
      if (uploadRetry) {
        updateJob(jobId, (current) => ({
          ...current,
          error: null,
          phase: 'preparing',
        }))
        toast.success(t('actions.resumeAccepted'))
        return
      }
      updateJob(jobId, (current) => {
        return {
          ...current,
          documentTaskId: accepted.task_id,
          error: null,
          phase: 'compiling_documents',
          taskId: accepted.task_id,
        }
      })
      toast.success(t('actions.resumeAccepted'))
    },
  })

  const isActive = Boolean(
    job &&
    ['preparing', 'uploading', 'queued', 'compiling_documents'].includes(
      job.phase,
    ),
  )
  const queuePosition = job ? miningQueuePosition(schedulingJobs, job.id) : null
  const resumeBlocked = Boolean(
    job && hasOtherPendingMiningJob(schedulingJobs, job.id),
  )
  const progress = phaseProgress(job?.phase || 'idle', compileTask)
  const currentStage = compileTask?.stage || job?.phase || 'idle'

  function reset(): void {
    setHistory((current) => ({ ...current, selectedJobId: null }))
    setDocumentFiles([])
    setOkfConfigFile(null)
    setSelectedUri(null)
    setSelectedViewId('main')
    setReason(t('reason.default'))
  }

  function selectHistoryJob(jobId: string): void {
    setHistory((current) => ({ ...current, selectedJobId: jobId }))
    setSelectedUri(null)
    setSelectedViewId('main')
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
                    historyJob.documentFiles.length ||
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
                          {(historyJob.windowCount || 1) > 1 ? (
                            <Badge variant="outline">
                              {t('window.badge', {
                                count: historyJob.windowCount || 1,
                                index: historyJob.windowIndex || 1,
                              })}
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
                        {documentFiles.length > 0 ? (
                          <p className="mt-1.5 text-xs font-medium text-primary">
                            {t('upload.folder.selected', {
                              documents: documentFiles.length,
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
                      size: formatFileSize(MAX_KNOWLEDGE_MINING_FILE_BYTES),
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
                  <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium"
                        htmlFor="mining-window-files"
                      >
                        {t('window.fileLimit')}
                      </label>
                      <Input
                        id="mining-window-files"
                        type="number"
                        min={1}
                        step={1}
                        value={windowFileLimit}
                        disabled={isActive}
                        onChange={(event) =>
                          setWindowFileLimit(
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium"
                        htmlFor="mining-window-bytes"
                      >
                        {t('window.byteLimit')}
                      </label>
                      <Input
                        id="mining-window-bytes"
                        type="number"
                        min={1}
                        step={1}
                        value={windowByteLimitMiB}
                        disabled={isActive}
                        onChange={(event) =>
                          setWindowByteLimitMiB(
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium"
                        htmlFor="mining-window-pages"
                      >
                        {t('window.pageLimit')}
                      </label>
                      <Input
                        id="mining-window-pages"
                        type="number"
                        min={1}
                        step={1}
                        value={windowPageLimit}
                        disabled={isActive}
                        onChange={(event) =>
                          setWindowPageLimit(
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium"
                        htmlFor="mining-window-probes"
                      >
                        {t('window.probeLimit')}
                      </label>
                      <Input
                        id="mining-window-probes"
                        type="number"
                        min={1}
                        step={1}
                        value={windowProbeLimit}
                        disabled={isActive}
                        onChange={(event) =>
                          setWindowProbeLimit(
                            Math.max(1, Number(event.target.value) || 1),
                          )
                        }
                      />
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                      {t('window.preview', { count: plannedWindowCount })}
                    </p>
                  </div>

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
                    {job.windowFileLimit ? (
                      <div className="grid grid-cols-[5rem_1fr] gap-2">
                        <dt>{t('status.window')}</dt>
                        <dd className="font-medium text-foreground">
                          {t('window.badge', {
                            count: job.windowCount || 1,
                            index: job.windowIndex || 1,
                          })}
                          {job.oversizedSingleton
                            ? t('window.singletonSuffix')
                            : ''}
                        </dd>
                      </div>
                    ) : null}
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
                    {job.windowLogUri ? (
                      <div className="grid grid-cols-[5rem_1fr] gap-2">
                        <dt>{t('status.windowLog')}</dt>
                        <dd className="break-all font-mono text-foreground">
                          {job.windowLogUri}
                        </dd>
                      </div>
                    ) : null}
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

                  {job.taskId && job.phase === 'compiling_documents' ? (
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
                  {(job.taskId || pendingWindowFilesRef.current.has(job.id)) &&
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
                  ? job?.phase === 'partial'
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
                  </div>
                  <div className="rounded-xl border bg-muted/15 p-4">
                    <p className="text-sm font-semibold">
                      {t(`views.guides.${systemViewGuideKey}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(`views.guides.${systemViewGuideKey}.purpose`)}
                    </p>
                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.contentLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {t(`views.guides.${systemViewGuideKey}.content`)}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">
                          {t('views.guides.useLabel')}
                        </p>
                        <p className="mt-1 leading-5 text-muted-foreground">
                          {t(`views.guides.${systemViewGuideKey}.use`)}
                        </p>
                      </div>
                    </div>
                    {selectedViewId === 'main' &&
                    effectiveCompileResult?.main_view ? (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-md bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
                          {t('views.mainStructure', {
                            categories: mainViewPageRoles.join(' / '),
                            structure:
                              mainViewPathStructure.join(' / ') ||
                              t('views.legacyStructure'),
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('views.pageSummary', {
                            files: knowledgeEntries.length,
                            units: knowledgePageUnits.length,
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
                          listSeparator: t('coverage.listSeparator'),
                          outputs: t('coverage.outputs'),
                          reason: t('coverage.reason'),
                          skipped: t('coverage.skipped'),
                          uploaded: t('coverage.uploaded'),
                          valueSeparator: t('coverage.valueSeparator'),
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
                              <KnowledgePageTreeView
                                pageRoles={mainViewPageRoles}
                                metadata={metadataQuery.data || {}}
                                rootPath={mainViewRoot}
                                units={knowledgePageUnits}
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
                          ) : (
                            <p className="p-3 text-xs leading-5 text-muted-foreground">
                              {t('views.missingConfig')}
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                      <ScrollArea className="max-h-[680px] bg-background">
                        {contentQuery.isLoading ? (
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
                              selectedMetadata.sources.length > 0 && (
                                <div className="border-b bg-muted/20 p-5 text-sm md:p-7">
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
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            <article className="prose prose-sm max-w-none p-5 text-foreground dark:prose-invert md:p-7 prose-headings:scroll-mt-20 prose-a:text-primary prose-pre:overflow-x-auto">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ href, node: _node, ...props }) => {
                                    const target = findMarkdownLinkTarget(
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
                                {stripFrontmatter(contentQuery.data.content)}
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

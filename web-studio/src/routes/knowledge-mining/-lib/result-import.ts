import { fetchFileContent, fetchFsTree } from '#/routes/resources/-lib/api'

import type {
  CompileIntermediateArtifact,
  CompileResult,
  CompileView,
} from './api'
import type { MiningJob, MiningPhase } from './history'

const ARTIFACTS = [
  ['run_manifest', '_mining/run-manifest.json'],
  ['evidence_ledger', '_mining/evidence-ledger.json'],
  ['investigation_report', '_mining/investigation-report.json'],
  ['questionnaire', '_mining/questionnaire.json'],
  ['source_coverage', '_mining/source-coverage.json'],
  ['candidate_knowledge', '_mining/candidate-knowledge.json'],
  ['readlist', '_mining/readlist.json'],
  ['evidence_history', '_mining/evidence-history.json'],
] as const satisfies ReadonlyArray<
  readonly [CompileIntermediateArtifact['kind'], string]
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function relativePath(rootUri: string, uri: string): string {
  const normalizedRoot = rootUri.replace(/\/$/, '')
  return uri.startsWith(`${normalizedRoot}/`)
    ? uri.slice(normalizedRoot.length + 1)
    : uri
}

function normalizeTargetUri(value: string): string {
  const targetUri = value.trim().replace(/\/$/, '')
  if (!targetUri.startsWith('viking://') || targetUri === 'viking://') {
    throw new Error('A concrete viking:// result directory is required.')
  }
  return targetUri
}

async function readJson(
  uri: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (!uri) return null
  try {
    const content = await fetchFileContent(uri, { raw: true })
    const parsed = JSON.parse(content.content) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function inferMainView(
  pagePaths: string[],
): NonNullable<CompileResult['main_view']> {
  const observedFacets = ['what', 'why', 'how'].filter((facet) =>
    pagePaths.some((path) => {
      const segments = path.split('/').filter(Boolean)
      return segments.at(-2) === facet || segments[1] === facet
    }),
  )
  const rootPath = pagePaths.some((path) => path.startsWith('knowledge/'))
    ? 'knowledge'
    : ''
  const facetFirst = pagePaths.some((path) => {
    const segments = path.split('/').filter(Boolean)
    return observedFacets.includes(segments[1] || '')
  })
  const facets =
    observedFacets.length > 0 ? observedFacets : ['what', 'why', 'how']
  const directoryRoutes = Object.fromEntries(
    facets.map((facet) => [
      facet,
      [
        ...new Set(
          pagePaths.flatMap((path) => {
            const segments = path.split('/').filter(Boolean)
            return segments[1] === facet && segments.length > 4
              ? [segments.slice(2, -2).join('/')]
              : []
          }),
        ),
      ],
    ]),
  )
  const routeBased = Object.values(directoryRoutes).every(
    (routes) => routes.length > 0,
  )
  return {
    derived_views_include_exempt: false,
    exempt_paths: ['index.md'],
    ...(facetFirst
      ? {
          facet_categories: facets,
          ...(routeBased ? { directory_routes: directoryRoutes } : {}),
          path_structure: routeBased
            ? (['facet', 'route', 'meta_id', 'filename'] as const)
            : (['facet', 'meta_id', 'filename'] as const),
        }
      : { leaf_categories: facets }),
    meta_knowledge: {
      group_by: 'frontmatter_field',
      id_field: 'meta_id',
      require_complete: observedFacets.length === 3,
      require_id_directory: true,
      shared_view_tags: true,
    },
    root_path: rootPath,
    single_source_of_truth: true,
  }
}

function sourceCoverageSummary(
  artifact: Record<string, unknown> | null,
  artifactUri: string | undefined,
): CompileResult['source_coverage'] {
  if (!artifact || !artifactUri) return null
  const summary = isRecord(artifact.summary) ? artifact.summary : artifact
  return {
    artifact_uri: artifactUri,
    cited: numberValue(summary.cited),
    inspected: numberValue(summary.inspected),
    merged: numberValue(summary.merged),
    skipped: numberValue(summary.skipped),
    uploaded: numberValue(summary.uploaded),
  }
}

export type InspectedCliResult = {
  result: CompileResult
  scopeSummary: string
}

export async function inspectCliResult(
  requestedTargetUri: string,
  hint?: CompileResult | null,
): Promise<InspectedCliResult> {
  const targetUri = normalizeTargetUri(requestedTargetUri)
  const tree = await fetchFsTree(targetUri, {
    levelLimit: 16,
    nodeLimit: 10_000,
  })
  const fileUris = new Set(
    tree.nodes.filter((entry) => !entry.isDir).map((entry) => entry.uri),
  )
  const indexUri = `${targetUri}/index.md`
  if (!fileUris.has(indexUri)) {
    throw new Error('The selected result does not contain index.md.')
  }

  const pageUris = [...fileUris]
    .filter((uri) => {
      const path = relativePath(targetUri, uri)
      return (
        path.toLowerCase().endsWith('.md') &&
        !path.startsWith('_mining/') &&
        !path.split('/').at(-1)?.startsWith('.')
      )
    })
    .sort()
  if (pageUris.length < 2) {
    throw new Error(
      'The selected result needs index.md and at least one knowledge page.',
    )
  }

  const intermediateArtifacts = ARTIFACTS.flatMap(([kind, path]) => {
    const uri = `${targetUri}/${path}`
    return fileUris.has(uri) ? [{ kind, path, uri }] : []
  })
  const artifactUri = (kind: CompileIntermediateArtifact['kind']) =>
    intermediateArtifacts.find((artifact) => artifact.kind === kind)?.uri
  const [manifest, coverage, investigation, questionnaire] = await Promise.all([
    readJson(artifactUri('run_manifest')),
    readJson(artifactUri('source_coverage')),
    readJson(artifactUri('investigation_report')),
    readJson(artifactUri('questionnaire')),
  ])

  const sourceRoots = stringList(manifest?.source_roots)
  const investigationStatus =
    investigation?.status === 'needs_human_input'
      ? 'needs_human_input'
      : investigation?.status === 'clear'
        ? 'clear'
        : hint?.investigation_status || null
  const questions = Array.isArray(questionnaire?.questions)
    ? questionnaire.questions.length
    : hint?.question_count || 0
  const paths = pageUris.map((uri) => relativePath(targetUri, uri))
  const hintedArtifacts = hint?.intermediate_artifacts
  const scopeSummary =
    stringValue(manifest?.scope_summary) ||
    stringValue(manifest?.summary) ||
    stringValue(manifest?.stage)

  return {
    result: {
      created: hint?.created || pageUris,
      from: hint?.from.length ? hint.from : sourceRoots,
      intermediate_artifacts:
        hintedArtifacts && hintedArtifacts.length > 0
          ? hintedArtifacts
          : intermediateArtifacts,
      investigation_status: investigationStatus,
      link_count: hint?.link_count || 0,
      main_view: hint?.main_view || inferMainView(paths),
      okf_version: hint?.okf_version || stringValue(manifest?.version) || '1.0',
      page_count: hint?.page_count || pageUris.length,
      question_count: questions,
      skill: hint?.skill || 'llm-wiki',
      source_coverage:
        hint?.source_coverage ||
        sourceCoverageSummary(coverage, artifactUri('source_coverage')),
      to: targetUri,
      unchanged: hint?.unchanged || [],
      updated: hint?.updated || [],
      validation_passed: hint?.validation_passed ?? true,
      views: hint?.views || [],
      warnings: hint?.warnings || [],
    },
    scopeSummary,
  }
}

export function importedMiningJob(input: {
  label?: string
  origin: 'cli' | 'imported'
  result: CompileResult
  scopeSummary?: string
  targetUri: string
}): MiningJob {
  const now = new Date().toISOString()
  const targetUri = normalizeTargetUri(input.targetUri)
  const phase: MiningPhase =
    input.result.validation_passed === false
      ? 'partial'
      : input.result.investigation_status === 'needs_human_input'
        ? 'awaiting_human'
        : 'completed'
  return {
    createdAt: now,
    documentFiles: [],
    documentSourceUri: input.result.from[0] || targetUri,
    documentTaskId: null,
    error: null,
    humanTaskId: null,
    id: `${input.origin}:${targetUri}`,
    memoryFiles: [],
    memorySourceUri: `${targetUri}/_human-input`,
    memoryTaskId: null,
    okfConfigUri: null,
    origin: input.origin,
    phase,
    reason:
      input.label?.trim() ||
      input.scopeSummary?.trim() ||
      targetUri.split('/').filter(Boolean).at(-1) ||
      targetUri,
    result: input.result,
    skillUri: null,
    targetUri,
    taskId: null,
    updatedAt: now,
  }
}

function humanize(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function inferCompileViewsFromTags(tags: string[]): CompileView[] {
  const groups = new Map<string, Set<string>>()
  for (const tag of tags) {
    const match = tag.match(/^view\/([^/]+)\/(.+)$/)
    if (!match) continue
    const current = groups.get(match[1]) || new Set<string>()
    current.add(match[2])
    groups.set(match[1], current)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([viewId, groupIds]) => ({
      description: '',
      groups: [...groupIds].sort().map((groupId) => ({
        description: '',
        id: groupId,
        path: groupId.split('/').map((segment, index) => ({
          description: '',
          id: segment,
          title:
            index === 0 &&
            ['topic', 'reference', 'procedure', 'synthesis'].includes(segment)
              ? segment.toUpperCase()
              : segment,
        })),
        tag: `view/${viewId}/${groupId}`,
        title: humanize(groupId),
      })),
      id: viewId,
      selection: 'exactly_one',
      title: humanize(viewId),
    }))
}

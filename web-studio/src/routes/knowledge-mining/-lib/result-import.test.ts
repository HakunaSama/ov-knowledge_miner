import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchFileContent, fetchFsTree } from '#/routes/resources/-lib/api'

import { importedMiningJob, inspectCliResult } from './result-import'

vi.mock('#/routes/resources/-lib/api', () => ({
  fetchFileContent: vi.fn(),
  fetchFsTree: vi.fn(),
}))

const target = 'viking://resources/cli-wiki'

function node(path: string) {
  return {
    abstract: '',
    isDir: false,
    modTime: '',
    modTimestamp: null,
    name: path.split('/').at(-1) || path,
    overview: '',
    size: '1 B',
    sizeBytes: 1,
    uri: `${target}/${path}`,
  }
}

describe('CLI knowledge result import', () => {
  beforeEach(() => {
    vi.mocked(fetchFileContent).mockReset()
    vi.mocked(fetchFsTree).mockReset()
  })

  it('does not invent rendering metadata from a CLI Wiki directory', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [
        node('index.md'),
        node('configured-root/definition/catalog/rag/rag.md'),
        node('configured-root/rationale/policy/rag/rag.md'),
        node('configured-root/execution/runtime/rag/rag.md'),
        node('_mining/run-manifest.json'),
        node('_mining/source-coverage.json'),
        node('_mining/investigation-report.json'),
        node('_mining/questionnaire.json'),
      ],
      rootUri: target,
    })
    vi.mocked(fetchFileContent).mockImplementation(async (uri) => {
      const json = uri.endsWith('run-manifest.json')
        ? {
            scope_summary: 'CLI RAG wiki',
            source_roots: ['viking://resources/source'],
            stage: 'documents',
            version: '1.0',
          }
        : uri.endsWith('source-coverage.json')
          ? {
              summary: {
                cited: 8,
                inspected: 10,
                merged: 1,
                skipped: 1,
                uploaded: 10,
              },
            }
          : uri.endsWith('investigation-report.json')
            ? { status: 'clear' }
            : { questions: [] }
      return {
        content: JSON.stringify(json),
        limit: -1,
        offset: 0,
        truncated: false,
        uri,
      }
    })

    const inspected = await inspectCliResult(`${target}/`)

    expect(inspected.scopeSummary).toBe('CLI RAG wiki')
    expect(inspected.result).toMatchObject({
      from: ['viking://resources/source'],
      investigation_status: 'clear',
      main_view: null,
      page_count: 4,
      source_coverage: {
        cited: 8,
        inspected: 10,
        merged: 1,
        skipped: 1,
        uploaded: 10,
      },
      to: target,
    })
    expect(inspected.result.intermediate_artifacts).toHaveLength(4)
    expect(inspected.result.warnings).toContain(
      'The imported result has no OKF main_view metadata. Studio will not infer a directory schema.',
    )
  })

  it('preserves custom main-view and derived-view metadata from Compile', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [
        node('index.md'),
        node('configured-root/definition/catalog/rag/rag.md'),
      ],
      rootUri: target,
    })
    const hint = {
      created: [],
      from: [],
      link_count: 0,
      main_view: {
        derived_views_include_exempt: false,
        exempt_paths: ['index.md'],
        facet_categories: ['definition'],
        meta_knowledge: {
          group_by: 'frontmatter_field' as const,
          id_field: 'meta_id',
          require_complete: true,
          shared_view_tags: true,
        },
        path_structure: [
          'facet' as const,
          'route' as const,
          'meta_id' as const,
          'filename' as const,
        ],
        root_path: 'configured-root',
        single_source_of_truth: true,
      },
      okf_version: '1.2',
      page_count: 1,
      skill: 'llm-wiki',
      to: target,
      unchanged: [],
      updated: [],
      validation_passed: true,
      views: [
        {
          description: 'Configured view',
          groups: [
            {
              description: 'Configured group',
              id: 'catalog',
              tag: 'view/catalog/catalog',
              title: 'Catalog',
            },
          ],
          id: 'catalog',
          selection: 'exactly_one' as const,
          title: 'Catalog',
        },
      ],
      warnings: [],
    }

    const inspected = await inspectCliResult(target, hint)

    expect(inspected.result.main_view).toEqual(hint.main_view)
    expect(inspected.result.views).toEqual(hint.views)
    expect(inspected.result.warnings).toEqual([])
  })

  it('rejects a directory that is not a rendered Wiki result', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [node('notes.md')],
      rootUri: target,
    })

    await expect(inspectCliResult(target)).rejects.toThrow('index.md')
  })

  it('marks imported partial and human-gated results accurately', () => {
    const baseResult = {
      created: [`${target}/index.md`],
      from: [],
      link_count: 0,
      okf_version: '1.0',
      page_count: 1,
      skill: 'llm-wiki',
      to: target,
      unchanged: [],
      updated: [],
      warnings: [],
    }
    expect(
      importedMiningJob({
        origin: 'imported',
        result: { ...baseResult, validation_passed: false },
        targetUri: target,
      }).phase,
    ).toBe('partial')
    expect(
      importedMiningJob({
        origin: 'cli',
        result: {
          ...baseResult,
          investigation_status: 'needs_human_input',
        },
        targetUri: target,
      }).phase,
    ).toBe('awaiting_human')
  })
})

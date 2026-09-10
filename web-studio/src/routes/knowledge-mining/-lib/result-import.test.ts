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
        node('knowledge/topic/technology-data/engineering/rag.md'),
        node('knowledge/reference/technology-data/engineering/api.md'),
        node('knowledge/procedure/technology-data/engineering/deploy.md'),
        node('_mining/run-manifest.json'),
        node('_mining/source-coverage.json'),
        node('_mining/investigation-report.json'),
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
          : { status: 'clear' }
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
    expect(inspected.result.intermediate_artifacts).toHaveLength(3)
    expect(inspected.result.warnings).toContain(
      'The imported result has no OKF main_view metadata. Studio will not infer a directory schema.',
    )
  })

  it('preserves the configured atomic main-view metadata from Compile', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [
        node('index.md'),
        node('knowledge/topic/technology-data/engineering/rag.md'),
      ],
      rootUri: target,
    })
    const hint = {
      created: [],
      from: [],
      link_count: 0,
      main_view: {
        exempt_paths: ['index.md'],
        page_roles: [
          {
            description: 'Explanatory knowledge',
            id: 'topic',
            title: 'TOPIC',
          },
        ],
        business_domains: [
          {
            description: 'Technical knowledge',
            id: 'technology-data',
            title: 'Technology and data',
            subdomains: [
              {
                description: 'Engineering knowledge',
                id: 'engineering',
                title: 'Engineering',
              },
            ],
          },
        ],
        path_structure: [
          'page_role' as const,
          'business_domain' as const,
          'subdomain' as const,
          'subject_path' as const,
          'filename' as const,
        ],
        root_path: 'knowledge',
      },
      okf_version: '1.2',
      page_count: 1,
      skill: 'llm-wiki',
      to: target,
      unchanged: [],
      updated: [],
      validation_passed: true,
      warnings: [],
    }

    const inspected = await inspectCliResult(target, hint)

    expect(inspected.result.main_view).toEqual(hint.main_view)
    expect(inspected.result.warnings).toEqual([])
  })

  it('rejects a directory that is not a rendered Wiki result', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [node('notes.md')],
      rootUri: target,
    })

    await expect(inspectCliResult(target)).rejects.toThrow('index.md')
  })

  it('treats advisory validation findings as a completed result', () => {
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
    ).toBe('completed')
    expect(
      importedMiningJob({
        origin: 'cli',
        result: {
          ...baseResult,
          investigation_status: 'issues_found',
        },
        targetUri: target,
      }).phase,
    ).toBe('completed')
  })
})

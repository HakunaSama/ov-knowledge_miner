import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchFileContent, fetchFsTree } from '#/routes/resources/-lib/api'

import {
  importedMiningJob,
  inferCompileViewsFromTags,
  inspectCliResult,
} from './result-import'

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

  it('reconstructs rendering metadata from a CLI Wiki directory', async () => {
    vi.mocked(fetchFsTree).mockResolvedValue({
      nodes: [
        node('index.md'),
        node('knowledge/what/products/rag/rag.md'),
        node('knowledge/why/compliance/rag/rag.md'),
        node('knowledge/how/technology/backend/rag/rag.md'),
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
      main_view: {
        directory_routes: {
          how: ['technology/backend'],
          what: ['products'],
          why: ['compliance'],
        },
        facet_categories: ['what', 'why', 'how'],
        path_structure: ['facet', 'route', 'meta_id', 'filename'],
        root_path: 'knowledge',
      },
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

  it('infers derived views from namespaced page tags', () => {
    expect(
      inferCompileViewsFromTags([
        'view/domain/products-and-systems',
        'view/domain/processes-and-methods',
        'view/usage/reference',
        'unrelated',
      ]),
    ).toMatchObject([
      {
        id: 'domain',
        groups: [
          { id: 'processes-and-methods' },
          { id: 'products-and-systems' },
        ],
      },
      { id: 'usage', groups: [{ id: 'reference' }] },
    ])
  })

  it('infers a two-level perspective path from nested tags', () => {
    expect(
      inferCompileViewsFromTags([
        'view/perspective/topic/operations',
        'view/perspective/synthesis/technology-data',
      ]),
    ).toMatchObject([
      {
        id: 'perspective',
        groups: [
          {
            id: 'synthesis/technology-data',
            path: [
              { id: 'synthesis', title: 'SYNTHESIS' },
              { id: 'technology-data', title: 'technology-data' },
            ],
          },
          {
            id: 'topic/operations',
            path: [
              { id: 'topic', title: 'TOPIC' },
              { id: 'operations', title: 'operations' },
            ],
          },
        ],
      },
    ])
  })
})

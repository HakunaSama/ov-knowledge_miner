import { describe, expect, it } from 'vitest'

import { buildKnowledgeGraph } from './knowledge-graph'
import type { KnowledgePageUnit } from './knowledge-pages'

const root = 'viking://resources/wiki'
const retrievalUri = `${root}/knowledge/topic/technology-data/engineering/retrieval.md`
const configureUri = `${root}/knowledge/procedure/technology-data/engineering/configure.md`
const units: KnowledgePageUnit[] = [
  {
    entries: { topic: { name: 'retrieval.md', uri: retrievalUri } },
    entryPaths: {},
    id: retrievalUri,
    name: 'Retrieval',
    path: 'knowledge/technology-data/engineering',
  },
  {
    entries: { procedure: { name: 'configure.md', uri: configureUri } },
    entryPaths: {},
    id: configureUri,
    name: 'Configure',
    path: 'knowledge/technology-data/engineering',
  },
]

const metadata = (title: string, markdownLinks: string[] = []) => ({
  description: '',
  markdownLinks,
  sources: [],
  tags: [],
  title,
  type: 'concept',
})

describe('knowledge graph', () => {
  it('creates one node per atomic page and preserves Markdown-link edges', () => {
    const graph = buildKnowledgeGraph(
      units,
      {
        [retrievalUri]: metadata('Retrieval', [
          '../../../procedure/technology-data/engineering/configure.md',
        ]),
        [configureUri]: metadata('Configure'),
      },
      ['topic', 'procedure'],
    )

    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes.map((node) => node.pageRole).sort()).toEqual([
      'procedure',
      'topic',
    ])
    expect(
      graph.edges.filter((edge) => edge.relation === 'markdown-link'),
    ).toHaveLength(1)
  })
})

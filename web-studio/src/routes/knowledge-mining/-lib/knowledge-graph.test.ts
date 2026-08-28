import { describe, expect, it } from 'vitest'

import { buildKnowledgeGraph } from './knowledge-graph'
import type { MetaKnowledgeUnit } from './meta-knowledge'

const root = 'viking://resources/wiki'
const unit: MetaKnowledgeUnit = {
  entries: {
    execution: {
      name: 'configure.md',
      uri: `${root}/configured-root/execution/rag/configure.md`,
    },
    definition: {
      name: 'retrieval.md',
      uri: `${root}/configured-root/definition/rag/retrieval.md`,
    },
    rationale: {
      name: 'benefits.md',
      uri: `${root}/configured-root/rationale/rag/benefits.md`,
    },
  },
  entryPaths: {},
  id: 'knowledge/rag/retrieval',
  name: 'retrieval',
  path: 'knowledge/rag/retrieval',
}

const metadata = (title: string, wikiLinks: string[] = []) => ({
  description: '',
  knowledgeLinks: [],
  metaId: 'retrieval',
  sources: [],
  tags: [],
  title,
  type: 'concept',
  wikiLinks,
})

describe('knowledge graph', () => {
  it('creates one hub, three facet nodes, and WikiLink edges', () => {
    const graph = buildKnowledgeGraph(
      [unit],
      {
        [unit.entries.definition!.uri]: metadata('Retrieval', ['configure']),
        [unit.entries.rationale!.uri]: metadata('Benefits'),
        [unit.entries.execution!.uri]: metadata('Configure'),
      },
      ['definition', 'rationale', 'execution'],
    )

    expect(graph.nodes.filter((node) => node.kind === 'meta')).toHaveLength(1)
    expect(graph.nodes.filter((node) => node.kind === 'page')).toHaveLength(3)
    expect(
      graph.edges.filter((edge) => edge.relation === 'wikilink'),
    ).toHaveLength(1)
    expect(graph.edges).toHaveLength(4)
  })

  it('preserves relation labels and evidence for the official inspector', () => {
    const graph = buildKnowledgeGraph(
      [unit],
      {
        [unit.entries.definition!.uri]: {
          ...metadata('Retrieval'),
          knowledgeLinks: [
            {
              context: 'Retrieval is constrained by the launch policy.',
              direction: 'outgoing',
              relation: 'depends-on',
              resource: 'viking://resources/policy/launch.md',
              title: 'Launch policy',
            },
          ],
        },
        [unit.entries.rationale!.uri]: metadata('Benefits'),
        [unit.entries.execution!.uri]: metadata('Configure'),
      },
      ['definition', 'rationale', 'execution'],
    )
    const edge = graph.edges.find((item) => item.relation === 'depends-on')

    expect(edge?.label).toBe('depends-on')
    expect(edge?.evidence).toContain(
      'Retrieval is constrained by the launch policy.',
    )
  })
})

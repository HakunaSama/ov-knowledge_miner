import { describe, expect, it } from 'vitest'

import { buildKnowledgeGraph } from './knowledge-graph'
import type { MetaKnowledgeUnit } from './meta-knowledge'

const root = 'viking://resources/wiki'
const unit: MetaKnowledgeUnit = {
  entries: {
    how: {
      name: 'configure.md',
      uri: `${root}/knowledge/rag/how/configure.md`,
    },
    what: {
      name: 'retrieval.md',
      uri: `${root}/knowledge/rag/what/retrieval.md`,
    },
    why: { name: 'benefits.md', uri: `${root}/knowledge/rag/why/benefits.md` },
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
        [unit.entries.what!.uri]: metadata('Retrieval', ['configure']),
        [unit.entries.why!.uri]: metadata('Benefits'),
        [unit.entries.how!.uri]: metadata('Configure'),
      },
      ['what', 'why', 'how'],
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
        [unit.entries.what!.uri]: {
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
        [unit.entries.why!.uri]: metadata('Benefits'),
        [unit.entries.how!.uri]: metadata('Configure'),
      },
      ['what', 'why', 'how'],
    )
    const edge = graph.edges.find((item) => item.relation === 'depends-on')

    expect(edge?.label).toBe('depends-on')
    expect(edge?.evidence).toContain(
      'Retrieval is constrained by the launch policy.',
    )
  })
})

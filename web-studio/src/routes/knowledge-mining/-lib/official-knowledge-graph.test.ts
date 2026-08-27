import { describe, expect, it } from 'vitest'

import type { KnowledgeGraphData } from './knowledge-graph'
import {
  extractOfficialKnowledgeGraphTemplate,
  renderOfficialKnowledgeGraphHtml,
} from './official-knowledge-graph'

const graph: KnowledgeGraphData = {
  edges: [
    {
      evidence: ['meta-1 的 what 切面'],
      id: 'meta|what|contains_what',
      label: '包含 What',
      relation: 'contains_what',
      source: 'meta:1',
      target: 'page:1',
    },
  ],
  nodes: [
    {
      description: 'A <safe> meta knowledge unit',
      facet: '',
      id: 'meta:1',
      kind: 'meta',
      label: 'Retrieval',
      metaId: 'meta-1',
      sources: [],
      uri: null,
    },
    {
      description: 'What retrieval means',
      facet: 'what',
      id: 'page:1',
      kind: 'page',
      label: 'What is retrieval?',
      metaId: 'meta-1',
      sources: ['viking://resources/source.pdf'],
      uri: 'viking://resources/wiki/what.md',
    },
  ],
}

describe('official knowledge graph renderer', () => {
  it('extracts the upstream KG Explorer HTML and D3 force graph', () => {
    const template = extractOfficialKnowledgeGraphTemplate(
      '_HTML_TEMPLATE = r"""<div>OPENVIKING // KG EXPLORER</div>\n"""\n\n\nif __name__',
    )

    expect(template).toContain('OPENVIKING // KG EXPLORER')
  })

  it('injects Studio graph data without changing the official visualization', () => {
    const document = renderOfficialKnowledgeGraphHtml({
      graph,
      sourceName: 'viking://resources/wiki',
      title: '知识点阵',
    })

    expect(document).toContain('OPENVIKING // KG EXPLORER')
    expect(document).toContain('d3.forceSimulation(DATA.nodes)')
    expect(document).toContain('包含 What')
    expect(document).toContain('What · 是什么')
    expect(document).toContain('A \\u003csafe\\u003e meta knowledge unit')
    expect(document).not.toMatch(/__(?:DATA_JSON|NODE_COUNT|TYPE_FILTERS)__/)
  })
})

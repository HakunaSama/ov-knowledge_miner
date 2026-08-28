import { describe, expect, it } from 'vitest'

import type { KnowledgeGraphData } from './knowledge-graph'
import {
  extractOfficialKnowledgeGraphTemplate,
  renderOfficialKnowledgeGraphHtml,
} from './official-knowledge-graph'

const graph: KnowledgeGraphData = {
  edges: [
    {
      evidence: ['meta-1 的 definition 切面'],
      id: 'meta|definition|contains_definition',
      label: '包含 Definition',
      relation: 'contains_definition',
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
      description: 'A configured definition facet',
      facet: 'definition',
      id: 'page:1',
      kind: 'page',
      label: 'Retrieval definition',
      metaId: 'meta-1',
      sources: ['viking://resources/source.pdf'],
      uri: 'viking://resources/wiki/definition.md',
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
    expect(document).toContain('包含 Definition')
    expect(document).toContain('definition')
    expect(document).not.toContain('What · 是什么')
    expect(document).toContain('A \\u003csafe\\u003e meta knowledge unit')
    expect(document).not.toMatch(/__(?:DATA_JSON|NODE_COUNT|TYPE_FILTERS)__/)
  })
})

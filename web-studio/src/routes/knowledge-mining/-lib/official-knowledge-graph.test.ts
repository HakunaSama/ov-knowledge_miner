import { describe, expect, it } from 'vitest'

import type { KnowledgeGraphData } from './knowledge-graph'
import {
  extractOfficialKnowledgeGraphTemplate,
  renderOfficialKnowledgeGraphHtml,
} from './official-knowledge-graph'

const graph: KnowledgeGraphData = {
  edges: [
    {
      evidence: ['The procedure references the topic page.'],
      id: 'topic|procedure|markdown-link',
      label: 'Markdown link',
      relation: 'markdown-link',
      source: 'page:1',
      target: 'page:2',
    },
  ],
  nodes: [
    {
      description: 'An explanatory <safe> page',
      id: 'page:1',
      kind: 'page',
      label: 'Retrieval',
      pageRole: 'topic',
      sources: ['viking://resources/source.pdf'],
      uri: 'viking://resources/wiki/topic.md',
    },
    {
      description: 'An executable procedure',
      id: 'page:2',
      kind: 'page',
      label: 'Configure retrieval',
      pageRole: 'procedure',
      sources: ['viking://resources/source.pdf'],
      uri: 'viking://resources/wiki/procedure.md',
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

  it('injects atomic page graph data without legacy projection nodes', () => {
    const document = renderOfficialKnowledgeGraphHtml({
      graph,
      sourceName: 'viking://resources/wiki',
      title: '知识点阵',
    })

    expect(document).toContain('OPENVIKING // KG EXPLORER')
    expect(document).toContain('d3.forceSimulation(DATA.nodes)')
    expect(document).toContain('Markdown link')
    expect(document).toContain('topic')
    expect(document).toContain('An explanatory \\u003csafe\\u003e page')
    expect(document).not.toMatch(/__(?:DATA_JSON|NODE_COUNT|TYPE_FILTERS)__/)
  })
})

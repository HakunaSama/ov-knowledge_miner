import officialKnowledgeGraphSource from '../../../../../examples/compile/graph-show/knowledge-graph/knowledge_graph.py?raw'

import type { KnowledgeGraphData, KnowledgeGraphNode } from './knowledge-graph'

type OfficialNodeStyle = {
  color: string
  label: string
  symbol: 'circle' | 'diamond' | 'hexagon' | 'square' | 'star' | 'triangle'
}

const BASE_NODE_STYLES: Record<string, OfficialNodeStyle> = {
  external: { color: '#ffbd59', label: '外部知识', symbol: 'star' },
  meta: { color: '#39f7ff', label: '元知识', symbol: 'hexagon' },
}
const FACET_COLORS = [
  '#6df7b1',
  '#ff6b7f',
  '#a88bff',
  '#58a6ff',
  '#f7c95c',
  '#ff8f5c',
  '#5ce1d3',
  '#d97cff',
]
const FACET_SYMBOLS: OfficialNodeStyle['symbol'][] = [
  'circle',
  'diamond',
  'triangle',
  'square',
]

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '"': '&quot;',
      '&': '&amp;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;',
    }
    return entities[character]
  })
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function extractOfficialKnowledgeGraphTemplate(source: string): string {
  const startMarker = '_HTML_TEMPLATE = r"""'
  const start = source.indexOf(startMarker)
  if (start < 0)
    throw new Error('Official Knowledge Graph HTML template not found')
  const contentStart = start + startMarker.length
  const end = source.indexOf('\n"""\n\n\nif __name__', contentStart)
  if (end < 0)
    throw new Error('Official Knowledge Graph HTML template is incomplete')
  return source.slice(contentStart, end)
}

function nodeType(node: KnowledgeGraphNode): string {
  if (node.kind !== 'page') return node.kind
  return `facet:${node.facet || 'unclassified'}`
}

function nodeStyles(
  graph: KnowledgeGraphData,
): Record<string, OfficialNodeStyle> {
  const styles = { ...BASE_NODE_STYLES }
  const facets = [
    ...new Set(
      graph.nodes
        .filter((node) => node.kind === 'page')
        .map((node) => node.facet || 'unclassified'),
    ),
  ]
  facets.forEach((facet, index) => {
    styles[`facet:${facet}`] = {
      color: FACET_COLORS[index % FACET_COLORS.length],
      label: facet,
      symbol: FACET_SYMBOLS[index % FACET_SYMBOLS.length],
    }
  })
  return styles
}

function officialGraphData(
  graph: KnowledgeGraphData,
  styles: Record<string, OfficialNodeStyle>,
) {
  const degree = new Map<string, number>()
  const relationCounts = new Map<string, { count: number; label: string }>()
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
    const current = relationCounts.get(edge.relation)
    relationCounts.set(edge.relation, {
      count: (current?.count || 0) + 1,
      label: current?.label || edge.label,
    })
  }
  return {
    links: graph.edges.map((edge) => ({
      evidence: edge.evidence,
      label: edge.label,
      relation: edge.relation,
      source: edge.source,
      target: edge.target,
    })),
    nodes: graph.nodes
      .map((node) => {
        const entityType = nodeType(node)
        const style = styles[entityType]
        return {
          aliases: [],
          body_html: '',
          color: style.color,
          degree: degree.get(node.id) || 0,
          description: node.description,
          entity_type: entityType,
          id: node.id,
          path: node.uri || node.metaId,
          sources: node.sources,
          symbol: style.symbol,
          title: node.label,
          type_label: style.label,
        }
      })
      .sort((left, right) => right.degree - left.degree),
    relation_counts: [...relationCounts.entries()]
      .map(([relation, item]) => ({ relation, ...item }))
      .sort((left, right) => right.count - left.count),
  }
}

function typeFilters(
  graph: KnowledgeGraphData,
  styles: Record<string, OfficialNodeStyle>,
): string {
  const counts = new Map<string, number>()
  for (const node of graph.nodes) {
    const type = nodeType(node)
    counts.set(type, (counts.get(type) || 0) + 1)
  }
  const filters = [
    '<button class="type-filter active" type="button" data-type="all">' +
      `<span class="type-dot spectrum"></span><span>全部实体</span><b>${graph.nodes.length}</b>` +
      '</button>',
  ]
  for (const [type, count] of [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )) {
    const style = styles[type]
    filters.push(
      `<button class="type-filter" type="button" data-type="${escapeHtml(type)}">` +
        `<span class="type-dot" style="--type-color:${style.color}"></span>` +
        `<span>${escapeHtml(style.label)}</span><b>${count}</b></button>`,
    )
  }
  return filters.join('')
}

function relationLegend(graph: ReturnType<typeof officialGraphData>): string {
  return graph.relation_counts
    .map(
      (item) =>
        '<div class="predicate-row">' +
        `<span>${escapeHtml(item.label)}</span>` +
        `<code>${escapeHtml(item.relation)}</code>` +
        `<b>${item.count}</b></div>`,
    )
    .join('')
}

export function renderOfficialKnowledgeGraphHtml({
  graph,
  sourceName,
  title,
}: {
  graph: KnowledgeGraphData
  sourceName: string
  title: string
}): string {
  const styles = nodeStyles(graph)
  const data = officialGraphData(graph, styles)
  const replacements: Record<string, string> = {
    __LINK_COUNT__: String(graph.edges.length),
    __NODE_COUNT__: String(graph.nodes.length),
    __RELATION_LEGEND__: relationLegend(data),
    __SOURCE_NAME__: escapeHtml(sourceName),
    __TITLE__: escapeHtml(title),
    __TYPE_COUNT__: String(new Set(graph.nodes.map(nodeType)).size),
    __TYPE_FILTERS__: typeFilters(graph, styles),
  }
  let document = extractOfficialKnowledgeGraphTemplate(
    officialKnowledgeGraphSource,
  )
  for (const [marker, value] of Object.entries(replacements)) {
    document = document.replaceAll(marker, value)
  }
  return document.replace('__DATA_JSON__', safeJsonForScript(data))
}

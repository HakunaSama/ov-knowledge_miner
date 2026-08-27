import type { MetaKnowledgeUnit } from './meta-knowledge'
import type { WikiPageMetadata } from './views'

export type KnowledgeGraphNodeKind = 'meta' | 'page' | 'external'

export type KnowledgeGraphNode = {
  description: string
  facet: string
  id: string
  kind: KnowledgeGraphNodeKind
  label: string
  metaId: string
  sources: string[]
  uri: string | null
}

export type KnowledgeGraphEdge = {
  evidence: string[]
  id: string
  label: string
  relation: string
  source: string
  target: string
}

export type KnowledgeGraphData = {
  edges: KnowledgeGraphEdge[]
  nodes: KnowledgeGraphNode[]
}

function stem(value: string): string {
  const path = value.split('/').at(-1) || value
  return path.replace(/\.md$/i, '')
}

export function buildKnowledgeGraph(
  units: MetaKnowledgeUnit[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  facets: string[],
): KnowledgeGraphData {
  const nodes = new Map<string, KnowledgeGraphNode>()
  const edges = new Map<string, KnowledgeGraphEdge>()
  const pageEntries = units.flatMap((unit) =>
    facets.flatMap((facet) => {
      const entry = unit.entries[facet]
      return entry ? [{ entry, facet, unit }] : []
    }),
  )
  const uriToNodeId = new Map(
    pageEntries.map(({ entry }) => [entry.uri, `page:${entry.uri}`]),
  )
  const stemTargets = new Map<string, string[]>()

  const addEdge = (
    source: string,
    target: string,
    relation: string,
    label = relation,
    evidence: string[] = [],
  ) => {
    if (source === target) return
    const id = `${source}|${target}|${relation}`
    edges.set(id, { evidence, id, label, relation, source, target })
  }

  for (const unit of units) {
    const metaNodeId = `meta:${unit.id}`
    nodes.set(metaNodeId, {
      description: `由 What、Why、How 三个知识切面组成的元知识：${unit.name}`,
      facet: '',
      id: metaNodeId,
      kind: 'meta',
      label: unit.name,
      metaId: unit.id,
      sources: [],
      uri: null,
    })
    for (const facet of facets) {
      const entry = unit.entries[facet]
      if (!entry) continue
      const metadata = metadataByUri[entry.uri]
      const pageNodeId = `page:${entry.uri}`
      nodes.set(pageNodeId, {
        description: metadata?.description || '',
        facet,
        id: pageNodeId,
        kind: 'page',
        label: metadata?.title || stem(entry.name),
        metaId: unit.id,
        sources: (metadata?.sources || [])
          .map((source) => source.resource || source.title)
          .filter(Boolean),
        uri: entry.uri,
      })
      addEdge(
        metaNodeId,
        pageNodeId,
        `contains_${facet}`,
        `包含 ${facet[0].toUpperCase()}${facet.slice(1)}`,
        [`元知识 ${unit.id} 的 ${facet} 切面`],
      )
      const pageStem = stem(entry.name)
      stemTargets.set(pageStem, [
        ...(stemTargets.get(pageStem) || []),
        pageNodeId,
      ])
    }
  }

  for (const { entry } of pageEntries) {
    const source = `page:${entry.uri}`
    const metadata = metadataByUri[entry.uri]
    for (const target of metadata?.wikiLinks || []) {
      const candidates = stemTargets.get(stem(target)) || []
      if (candidates.length === 1) {
        addEdge(source, candidates[0], 'wikilink', 'WikiLink', [entry.uri])
      }
    }
    for (const link of metadata?.knowledgeLinks || []) {
      const existingTarget = uriToNodeId.get(link.resource)
      const target = existingTarget || `external:${link.resource}`
      if (!existingTarget && !nodes.has(target)) {
        nodes.set(target, {
          description: link.context || '',
          facet: '',
          id: target,
          kind: 'external',
          label: link.title || stem(link.resource),
          metaId: '',
          sources: [link.resource],
          uri: link.resource,
        })
      }
      addEdge(
        source,
        target,
        link.relation || 'related',
        link.relation || '相关知识',
        [entry.uri, link.context].filter(Boolean),
      )
    }
  }

  return { edges: [...edges.values()], nodes: [...nodes.values()] }
}

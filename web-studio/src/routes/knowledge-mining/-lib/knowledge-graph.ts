import type { KnowledgePageUnit } from './knowledge-pages'
import type { WikiPageMetadata } from './views'
import { findMarkdownLinkTarget } from './markdown-links'

export type KnowledgeGraphNode = {
  description: string
  id: string
  kind: 'page'
  label: string
  pageRole: string
  sources: string[]
  uri: string
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
  units: KnowledgePageUnit[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  pageRoles: string[],
): KnowledgeGraphData {
  const nodes = new Map<string, KnowledgeGraphNode>()
  const edges = new Map<string, KnowledgeGraphEdge>()
  const pageEntries = units.flatMap((unit) =>
    pageRoles.flatMap((pageRole) => {
      const entry = unit.entries[pageRole]
      return entry ? [{ entry, pageRole }] : []
    }),
  )
  const uriToNodeId = new Map(
    pageEntries.map(({ entry }) => [entry.uri, `page:${entry.uri}`]),
  )

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

  for (const { entry, pageRole } of pageEntries) {
    const metadata = metadataByUri[entry.uri]
    const pageNodeId = `page:${entry.uri}`
    nodes.set(pageNodeId, {
      description: metadata?.description || '',
      id: pageNodeId,
      kind: 'page',
      label: metadata?.title || stem(entry.name),
      pageRole,
      sources: (metadata?.sources || [])
        .map((source) => source.resource || source.title)
        .filter(Boolean),
      uri: entry.uri,
    })
  }

  for (const { entry } of pageEntries) {
    const source = `page:${entry.uri}`
    const metadata = metadataByUri[entry.uri]
    for (const href of metadata?.markdownLinks || []) {
      const targetUri = findMarkdownLinkTarget(href, entry.uri, [
        ...uriToNodeId.keys(),
      ])
      const target = targetUri ? uriToNodeId.get(targetUri) : undefined
      if (target)
        addEdge(source, target, 'markdown-link', 'Markdown link', [entry.uri])
    }
  }

  return { edges: [...edges.values()], nodes: [...nodes.values()] }
}

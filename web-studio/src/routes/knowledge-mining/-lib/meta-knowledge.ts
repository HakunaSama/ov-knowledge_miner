import type { CompileView } from './api'
import type { TaggedWikiEntry, WikiPageMetadata, ViewSection } from './views'

export type MetaKnowledgeUnit = {
  entries: Partial<Record<string, TaggedWikiEntry>>
  id: string
  name: string
  path: string
}

export type MetaKnowledgeTreeNode = {
  children: MetaKnowledgeTreeNode[]
  name: string
  path: string
  unit?: MetaKnowledgeUnit
}

function relativePath(rootUri: string, entry: TaggedWikiEntry): string {
  const normalizedRoot = rootUri.replace(/\/$/, '')
  return entry.uri.startsWith(`${normalizedRoot}/`)
    ? entry.uri.slice(normalizedRoot.length + 1)
    : entry.name
}

export function buildMetaKnowledgeUnits(
  rootUri: string,
  entries: TaggedWikiEntry[],
  facets: string[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>> = {},
): MetaKnowledgeUnit[] {
  const facetSet = new Set(facets)
  const units = new Map<string, MetaKnowledgeUnit>()

  for (const entry of entries) {
    const segments = relativePath(rootUri, entry).split('/').filter(Boolean)
    if (segments.length < 3) continue
    const facet = segments.at(-2) || ''
    if (!facetSet.has(facet)) continue
    const filename = segments.at(-1) || entry.name
    const stem = filename.replace(/\.md$/i, '')
    const metaId = metadataByUri[entry.uri]?.metaId || stem
    const physicalMetaDirectory = segments.at(-3) === metaId
    const path = physicalMetaDirectory
      ? segments.slice(0, -2).join('/')
      : [...segments.slice(0, -2), metaId].join('/')
    const unit = units.get(path) || {
      entries: {},
      id: path,
      name: metaId,
      path,
    }
    unit.entries[facet] = entry
    units.set(path, unit)
  }

  return [...units.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  )
}

export function buildMetaKnowledgeTree(
  units: MetaKnowledgeUnit[],
): MetaKnowledgeTreeNode[] {
  const roots: MetaKnowledgeTreeNode[] = []
  const byPath = new Map<string, MetaKnowledgeTreeNode>()

  for (const unit of units) {
    const segments = unit.path.split('/').filter(Boolean)
    let siblings = roots
    let currentPath = ''
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      let node = byPath.get(currentPath)
      if (!node) {
        node = { children: [], name: segment, path: currentPath }
        byPath.set(currentPath, node)
        siblings.push(node)
        siblings.sort((left, right) => left.name.localeCompare(right.name))
      }
      siblings = node.children
    }
    const leaf = byPath.get(unit.path)
    if (leaf) leaf.unit = unit
  }

  return roots
}

function unitTags(
  unit: MetaKnowledgeUnit,
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  facets: string[],
): string[] {
  for (const facet of facets) {
    const entry = unit.entries[facet]
    if (entry) return metadataByUri[entry.uri]?.tags || []
  }
  return []
}

export type MetaKnowledgeViewSection = ViewSection & {
  units: MetaKnowledgeUnit[]
}

export function buildMetaKnowledgeViewSections(
  units: MetaKnowledgeUnit[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  view: CompileView,
  facets: string[],
): MetaKnowledgeViewSection[] {
  const assigned = new Set<string>()
  return view.groups.map((group) => {
    const matchingUnits = units.filter((unit) => {
      if (assigned.has(unit.id)) return false
      if (!unitTags(unit, metadataByUri, facets).includes(group.tag))
        return false
      assigned.add(unit.id)
      return true
    })
    return {
      description: group.description,
      entries: matchingUnits.flatMap((unit) =>
        facets.flatMap((facet) => {
          const entry = unit.entries[facet]
          return entry ? [entry] : []
        }),
      ),
      id: group.id,
      title: group.title,
      units: matchingUnits,
    }
  })
}

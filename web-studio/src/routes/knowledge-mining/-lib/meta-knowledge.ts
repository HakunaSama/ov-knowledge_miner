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

export type FacetFirstMetaKnowledgeTreeNode = {
  children: FacetFirstMetaKnowledgeTreeNode[]
  entry?: TaggedWikiEntry
  label?: string
  name: string
  path: string
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
  mainViewRootPath = '',
): MetaKnowledgeUnit[] {
  const facetSet = new Set(facets)
  const units = new Map<string, MetaKnowledgeUnit>()
  const configuredRoot = mainViewRootPath.split('/').filter(Boolean)

  for (const entry of entries) {
    const segments = relativePath(rootUri, entry).split('/').filter(Boolean)
    if (segments.length < 3) continue
    const configuredFacetIndex = configuredRoot.length
    const configuredRootMatches = configuredRoot.every(
      (segment, index) => segments[index] === segment,
    )
    const facetFirstIndex =
      configuredRootMatches && facetSet.has(segments[configuredFacetIndex])
        ? configuredFacetIndex
        : facetSet.has(segments[1])
          ? 1
          : -1
    const legacyFacet = segments.at(-2) || ''
    const facet = facetFirstIndex >= 0 ? segments[facetFirstIndex] : legacyFacet
    if (!facetSet.has(facet)) continue
    const filename = segments.at(-1) || entry.name
    const stem = filename.replace(/\.md$/i, '')
    const metaId = metadataByUri[entry.uri]?.metaId || stem
    const viewSegments =
      facetFirstIndex >= 0
        ? [
            ...segments.slice(0, facetFirstIndex),
            ...segments.slice(facetFirstIndex + 1, -1),
          ]
        : segments.slice(0, -2)
    const physicalMetaDirectory = viewSegments.at(-1) === metaId
    const path = physicalMetaDirectory
      ? viewSegments.join('/')
      : [...viewSegments, metaId].join('/')
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

export function buildFacetFirstMetaKnowledgeTree(
  units: MetaKnowledgeUnit[],
  facets: string[],
  options: {
    categoryLabels?: Partial<Record<string, string>>
    rootPath?: string
    sections?: MetaKnowledgeViewSection[]
  } = {},
): FacetFirstMetaKnowledgeTreeNode[] {
  const roots: FacetFirstMetaKnowledgeTreeNode[] = facets.map((facet) => ({
    children: [],
    label: options.categoryLabels?.[facet],
    name: facet,
    path: facet,
  }))
  const rootsByFacet = new Map(roots.map((node) => [node.name, node]))
  const rootSegments = (options.rootPath || '').split('/').filter(Boolean)
  const sectionByUnit = new Map<
    string,
    { description: string; id: string; title: string }
  >()
  for (const section of options.sections || []) {
    for (const unit of section.units) {
      if (!sectionByUnit.has(unit.id)) sectionByUnit.set(unit.id, section)
    }
  }

  const insert = (
    root: FacetFirstMetaKnowledgeTreeNode,
    segments: Array<{ label?: string; name: string }>,
    entry: TaggedWikiEntry,
  ) => {
    let parent = root
    for (const segment of segments) {
      const path = `${parent.path}/${segment.name}`
      let child = parent.children.find(
        (candidate) => candidate.path === path && !candidate.entry,
      )
      if (!child) {
        child = {
          children: [],
          label: segment.label,
          name: segment.name,
          path,
        }
        parent.children.push(child)
        parent.children.sort((left, right) => left.name.localeCompare(right.name))
      }
      parent = child
    }
    parent.children.push({
      children: [],
      entry,
      name: entry.name,
      path: `${parent.path}/${entry.name}`,
    })
    parent.children.sort((left, right) => {
      if (Boolean(left.entry) !== Boolean(right.entry)) return left.entry ? 1 : -1
      return left.name.localeCompare(right.name)
    })
  }

  for (const unit of units) {
    const unitSegments = unit.path.split('/').filter(Boolean)
    const relativeUnitSegments = rootSegments.every(
      (segment, index) => unitSegments[index] === segment,
    )
      ? unitSegments.slice(rootSegments.length)
      : unitSegments
    const section = sectionByUnit.get(unit.id)
    const hierarchy = [
      ...(section
        ? [{ label: section.title, name: section.id }]
        : []),
      ...relativeUnitSegments.map((name) => ({ name })),
    ]
    for (const facet of facets) {
      const entry = unit.entries[facet]
      const root = rootsByFacet.get(facet)
      if (entry && root) insert(root, hierarchy, entry)
    }
  }

  return roots.filter((root) => root.children.length > 0)
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

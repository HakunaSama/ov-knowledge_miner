import type { CompileMainView, CompileView } from './api'
import type { TaggedWikiEntry, WikiPageMetadata, ViewSection } from './views'

export type MetaKnowledgeUnit = {
  entries: Partial<Record<string, TaggedWikiEntry>>
  entryPaths: Partial<Record<string, string[]>>
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
  mainView: CompileMainView | null | undefined,
  metadataByUri: Partial<Record<string, WikiPageMetadata>> = {},
): MetaKnowledgeUnit[] {
  if (!mainView?.path_structure?.length || !mainView.root_path) return []
  const facets = mainView.facet_categories || mainView.leaf_categories || []
  if (facets.length === 0) return []
  const facetSet = new Set(facets)
  const units = new Map<string, MetaKnowledgeUnit>()
  const configuredRoot = mainView.root_path.split('/').filter(Boolean)
  const structure = mainView.path_structure
  const routeIndex = structure.indexOf('route')
  const fixedSegmentCount = structure.length - (routeIndex >= 0 ? 1 : 0)

  for (const entry of entries) {
    const segments = relativePath(rootUri, entry).split('/').filter(Boolean)
    if (!configuredRoot.every((segment, index) => segments[index] === segment))
      continue
    const relativeSegments = segments.slice(configuredRoot.length)
    const routeLength = relativeSegments.length - fixedSegmentCount
    if (
      (routeIndex < 0 && relativeSegments.length !== structure.length) ||
      (routeIndex >= 0 && routeLength < 1)
    )
      continue

    let cursor = 0
    let facet = ''
    let facetSegmentIndex = -1
    let configuredMetaId = ''
    let configuredRoute = ''
    for (const level of structure) {
      if (level === 'route') {
        configuredRoute = relativeSegments
          .slice(cursor, cursor + routeLength)
          .join('/')
        cursor += routeLength
        continue
      }
      const value = relativeSegments[cursor] || ''
      if (level === 'facet') {
        facet = value
        facetSegmentIndex = cursor
      } else if (level === 'meta_id') {
        configuredMetaId = value
      }
      cursor += 1
    }
    if (!facetSet.has(facet) || facetSegmentIndex < 0) continue
    if (
      routeIndex >= 0 &&
      !(mainView.directory_routes?.[facet] || []).includes(configuredRoute)
    )
      continue
    const metaId = metadataByUri[entry.uri]?.metaId || configuredMetaId
    if (!metaId) continue
    const hierarchy = relativeSegments
      .slice(0, -1)
      .filter((_segment, index) => index !== facetSegmentIndex)
    const path = [...configuredRoot, ...hierarchy].join('/')
    const unit = units.get(metaId) || {
      entries: {},
      entryPaths: {},
      id: metaId,
      name: metaId,
      path,
    }
    unit.entries[facet] = entry
    unit.entryPaths[facet] = hierarchy
    units.set(metaId, unit)
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
        parent.children.sort((left, right) =>
          left.name.localeCompare(right.name),
        )
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
      if (Boolean(left.entry) !== Boolean(right.entry))
        return left.entry ? 1 : -1
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
    for (const facet of facets) {
      const entry = unit.entries[facet]
      const root = rootsByFacet.get(facet)
      const hierarchy = (unit.entryPaths[facet] || relativeUnitSegments).map(
        (name) => ({ name }),
      )
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

export function buildPerspectiveMetaKnowledgeTree(
  sections: MetaKnowledgeViewSection[],
  facets: string[],
): FacetFirstMetaKnowledgeTreeNode[] {
  const roots: FacetFirstMetaKnowledgeTreeNode[] = []
  const rootsById = new Map<string, FacetFirstMetaKnowledgeTreeNode>()

  const ensurePath = (
    root: FacetFirstMetaKnowledgeTreeNode,
    segments: Array<{ id: string; title: string }>,
  ): FacetFirstMetaKnowledgeTreeNode => {
    let parent = root
    for (const segment of segments) {
      const path = `${parent.path}/${segment.id}`
      let child = parent.children.find(
        (candidate) => candidate.path === path && !candidate.entry,
      )
      if (!child) {
        child = { children: [], name: segment.title, path }
        parent.children.push(child)
      }
      parent = child
    }
    return parent
  }

  const insert = (
    root: FacetFirstMetaKnowledgeTreeNode,
    segments: Array<{ id: string; title: string }>,
    unit: MetaKnowledgeUnit,
  ) => {
    const parent = ensurePath(root, segments)
    const unitPath = `${parent.path}/${unit.id}`
    let unitNode = parent.children.find(
      (candidate) => candidate.path === unitPath && !candidate.entry,
    )
    if (!unitNode) {
      unitNode = { children: [], name: unit.name, path: unitPath }
      parent.children.push(unitNode)
    }
    for (const facet of facets) {
      const entry = unit.entries[facet]
      if (
        !entry ||
        unitNode.children.some((child) => child.entry?.uri === entry.uri)
      )
        continue
      unitNode.children.push({
        children: [],
        entry,
        name: entry.name,
        path: `${unitPath}/${facet}/${entry.name}`,
      })
    }
  }

  for (const section of sections) {
    const path =
      section.path && section.path.length > 0
        ? section.path
        : [
            {
              description: section.description,
              id: section.id,
              title: section.title,
            },
          ]
    const [rootSegment, ...children] = path
    let root = rootsById.get(rootSegment.id)
    if (!root) {
      root = { children: [], name: rootSegment.title, path: rootSegment.id }
      rootsById.set(rootSegment.id, root)
      roots.push(root)
    }
    ensurePath(root, children)
    for (const unit of section.units) insert(root, children, unit)
  }

  return roots
}

export function buildMetaKnowledgeViewSections(
  units: MetaKnowledgeUnit[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  view: CompileView,
  facets: string[],
): MetaKnowledgeViewSection[] {
  return view.groups.map((group) => {
    const matchingUnits = units.filter((unit) => {
      if (!unitTags(unit, metadataByUri, facets).includes(group.tag))
        return false
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
      path: group.path,
      title: group.title,
      units: matchingUnits,
    }
  })
}

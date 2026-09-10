import type { CompileMainView } from './api'
import type { WikiEntry, WikiPageMetadata } from './views'

export type KnowledgePageUnit = {
  entries: Partial<Record<string, WikiEntry>>
  entryPaths: Partial<Record<string, string[]>>
  id: string
  name: string
  path: string
}

export type KnowledgePageTreeNode = {
  children: KnowledgePageTreeNode[]
  name: string
  path: string
  unit?: KnowledgePageUnit
}

export type PageRoleTreeNode = {
  children: PageRoleTreeNode[]
  entry?: WikiEntry
  label?: string
  name: string
  path: string
}

function relativePath(rootUri: string, entry: WikiEntry): string {
  const normalizedRoot = rootUri.replace(/\/$/, '')
  return entry.uri.startsWith(`${normalizedRoot}/`)
    ? entry.uri.slice(normalizedRoot.length + 1)
    : entry.name
}

/**
 * Interpret every physical Markdown page as one atomic knowledge object.
 * page_role is used only as the first branch of the single main-view tree;
 * pages are never grouped into secondary tag groupings or projected by tags.
 */
export function buildKnowledgePageUnits(
  rootUri: string,
  entries: WikiEntry[],
  mainView: CompileMainView | null | undefined,
  metadataByUri: Partial<Record<string, WikiPageMetadata>> = {},
): KnowledgePageUnit[] {
  if (!mainView?.path_structure.length || !mainView.root_path) return []
  const configuredRoot = mainView.root_path.split('/').filter(Boolean)
  const fixedLevelCount = mainView.path_structure.filter(
    (level) => level !== 'subject_path',
  ).length
  const roleIds = new Set(mainView.page_roles.map((role) => role.id))
  const domains = new Map(
    mainView.business_domains.map((domain) => [domain.id, domain]),
  )
  const units: KnowledgePageUnit[] = []

  for (const entry of entries) {
    const segments = relativePath(rootUri, entry).split('/').filter(Boolean)
    if (!configuredRoot.every((segment, index) => segments[index] === segment))
      continue
    const relativeSegments = segments.slice(configuredRoot.length)
    const subjectLength = relativeSegments.length - fixedLevelCount
    if (subjectLength < 0) continue

    let cursor = 0
    let pageRole = ''
    let businessDomain = ''
    let subdomain = ''
    const subjectPath: string[] = []
    for (const level of mainView.path_structure) {
      if (level === 'subject_path') {
        subjectPath.push(
          ...relativeSegments.slice(cursor, cursor + subjectLength),
        )
        cursor += subjectLength
        continue
      }
      const value = relativeSegments[cursor] || ''
      cursor += 1
      if (level === 'page_role') pageRole = value
      if (level === 'business_domain') businessDomain = value
      if (level === 'subdomain') subdomain = value
    }

    const domain = domains.get(businessDomain)
    if (
      !roleIds.has(pageRole) ||
      !domain ||
      !domain.subdomains.some((item) => item.id === subdomain)
    )
      continue
    const hierarchy = [businessDomain, subdomain, ...subjectPath]
    units.push({
      entries: { [pageRole]: entry },
      entryPaths: { [pageRole]: hierarchy },
      id: entry.uri,
      name: metadataByUri[entry.uri]?.title || entry.name.replace(/\.md$/i, ''),
      path: [...configuredRoot, ...hierarchy].join('/'),
    })
  }

  return units.sort((left, right) => left.path.localeCompare(right.path))
}

export function buildPageRoleTree(
  units: KnowledgePageUnit[],
  pageRoles: string[],
  options: {
    categoryLabels?: Partial<Record<string, string>>
    rootPath?: string
  } = {},
): PageRoleTreeNode[] {
  const roots: PageRoleTreeNode[] = pageRoles.map((role) => ({
    children: [],
    label: options.categoryLabels?.[role],
    name: role,
    path: role,
  }))
  const rootsByRole = new Map(roots.map((node) => [node.name, node]))
  const rootSegments = (options.rootPath || '').split('/').filter(Boolean)

  for (const unit of units) {
    for (const role of pageRoles) {
      const entry = unit.entries[role]
      const root = rootsByRole.get(role)
      if (!entry || !root) continue
      const hierarchy = unit.entryPaths[role] || []
      let parent = root
      for (const name of hierarchy) {
        const path = `${parent.path}/${name}`
        let child = parent.children.find(
          (candidate) => candidate.path === path && !candidate.entry,
        )
        if (!child) {
          child = { children: [], name, path }
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
    }
  }

  void rootSegments
  return roots.filter((root) => root.children.length > 0)
}

export function buildKnowledgePageTree(
  units: KnowledgePageUnit[],
): KnowledgePageTreeNode[] {
  const roots: KnowledgePageTreeNode[] = []
  const byPath = new Map<string, KnowledgePageTreeNode>()

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

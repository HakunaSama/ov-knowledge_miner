export type WikiTreeEntry = {
  name: string
  uri: string
}

export type WikiTreeNode = {
  children: WikiTreeNode[]
  isDirectory: boolean
  name: string
  path: string
  uri: string | null
}

function sortNodes(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return nodes
    .map((node) => ({ ...node, children: sortNodes(node.children) }))
    .sort((left, right) => {
      if (left.name === 'index.md') return -1
      if (right.name === 'index.md') return 1
      if (left.isDirectory !== right.isDirectory)
        return left.isDirectory ? -1 : 1
      return left.name.localeCompare(right.name)
    })
}

export function buildWikiTree(
  rootUri: string,
  entries: WikiTreeEntry[],
): WikiTreeNode[] {
  const root: WikiTreeNode = {
    children: [],
    isDirectory: true,
    name: '',
    path: '',
    uri: null,
  }
  const normalizedRoot = rootUri.replace(/\/$/, '')

  for (const entry of entries) {
    const relativePath = entry.uri.startsWith(`${normalizedRoot}/`)
      ? entry.uri.slice(normalizedRoot.length + 1)
      : entry.name
    const segments = relativePath.split('/').filter(Boolean)
    let parent = root
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join('/')
      const isDirectory = index < segments.length - 1
      let node = parent.children.find(
        (candidate) =>
          candidate.name === segment && candidate.isDirectory === isDirectory,
      )
      if (!node) {
        node = {
          children: [],
          isDirectory,
          name: segment,
          path,
          uri: isDirectory ? null : entry.uri,
        }
        parent.children.push(node)
      }
      parent = node
    })
  }

  return sortNodes(root.children)
}

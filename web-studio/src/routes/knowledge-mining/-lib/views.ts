import type { CompileView } from './api'

export type WikiPageMetadata = {
  description: string
  knowledgeLinks: WikiKnowledgeLink[]
  metaId: string
  sources: WikiSource[]
  tags: string[]
  title: string
  type: string
  wikiLinks: string[]
}

export type WikiSource = {
  author: string
  kind: string
  resource: string
  stage: string
  title: string
}

export type WikiKnowledgeLink = {
  context: string
  direction: string
  relation: string
  resource: string
  title: string
}

export type TaggedWikiEntry = {
  name: string
  uri: string
}

export type ViewSection = {
  description: string
  entries: TaggedWikiEntry[]
  id: string
  path?: Array<{
    description: string
    id: string
    title: string
  }>
  title: string
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function inlineTags(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  return trimmed.slice(1, -1).split(',').map(unquote).filter(Boolean)
}

function objectList(
  lines: string[],
  sectionName: string,
): Record<string, string>[] {
  const result: Record<string, string>[] = []
  let inSection = false
  let current: Record<string, string> | null = null
  for (const line of lines) {
    const topLevel = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/)
    if (topLevel) {
      inSection = topLevel[1] === sectionName
      current = null
      continue
    }
    if (!inSection) continue
    const first = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/)
    if (first) {
      current = { [first[1]]: unquote(first[2]) }
      result.push(current)
      continue
    }
    const field = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*?)\s*$/)
    if (current && field) current[field[1]] = unquote(field[2])
  }
  return result
}

export function parseWikiPageMetadata(
  markdown: string,
  metaIdField = 'meta_id',
): WikiPageMetadata {
  const match = markdown.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )
  if (!match) {
    return {
      knowledgeLinks: [],
      description: '',
      metaId: '',
      sources: [],
      tags: [],
      title: '',
      type: '',
      wikiLinks: [],
    }
  }
  const lines = match[1].split(/\r?\n/)
  const metadata: WikiPageMetadata = {
    description: '',
    knowledgeLinks: objectList(lines, 'knowledge_links').map((entry) => ({
      context: entry.context || '',
      direction: entry.direction || '',
      relation: entry.relation || '',
      resource: entry.resource || '',
      title: entry.title || '',
    })),
    metaId: '',
    sources: objectList(lines, 'sources').map((entry) => ({
      author: entry.author || '',
      kind: entry.kind || '',
      resource: entry.resource || '',
      stage: entry.stage || '',
      title: entry.title || '',
    })),
    tags: [],
    title: '',
    type: '',
    wikiLinks: [],
  }
  let readingTags = false
  for (const line of lines) {
    const topLevel = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/)
    if (topLevel) {
      readingTags = topLevel[1] === 'tags'
      const value = topLevel[2] || ''
      if (topLevel[1] === 'title') metadata.title = unquote(value)
      if (topLevel[1] === 'description') metadata.description = unquote(value)
      if (topLevel[1] === 'type') metadata.type = unquote(value)
      if (topLevel[1] === metaIdField) metadata.metaId = unquote(value)
      if (readingTags && value.trim()) metadata.tags.push(...inlineTags(value))
      continue
    }
    if (readingTags) {
      const item = line.match(/^\s*-\s+(.+?)\s*$/)
      if (item) {
        const tag = unquote(item[1])
        if (tag) metadata.tags.push(tag)
        continue
      }
      if (line.trim() && !/^\s/.test(line)) readingTags = false
    }
  }
  metadata.tags = [...new Set(metadata.tags)]
  const body = markdown.slice(match[0].length)
  metadata.wikiLinks = [
    ...new Set(
      [...body.matchAll(/\[\[([^\r\n]+?)\]\]/g)]
        .map((item) => item[1].split('|', 1)[0].split('#', 1)[0].trim())
        .filter(Boolean),
    ),
  ]
  return metadata
}

export function buildViewSections(
  entries: TaggedWikiEntry[],
  metadataByUri: Partial<Record<string, WikiPageMetadata>>,
  view: CompileView,
): ViewSection[] {
  return view.groups.map((group) => ({
    description: group.description,
    entries: entries.filter((entry) =>
      metadataByUri[entry.uri]?.tags.includes(group.tag),
    ),
    id: group.id,
    path: group.path,
    title: group.title,
  }))
}

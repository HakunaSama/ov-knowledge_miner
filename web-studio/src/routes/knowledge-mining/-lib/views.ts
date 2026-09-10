export type WikiPageMetadata = {
  description: string
  markdownLinks: string[]
  sources: WikiSource[]
  tags: string[]
  title: string
  type: string
}

export type WikiSource = {
  resource: string
  title: string
}

export type WikiEntry = {
  name: string
  uri: string
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

export function parseWikiPageMetadata(markdown: string): WikiPageMetadata {
  const match = markdown.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )
  if (!match) {
    return {
      description: '',
      markdownLinks: [],
      sources: [],
      tags: [],
      title: '',
      type: '',
    }
  }
  const lines = match[1].split(/\r?\n/)
  const metadata: WikiPageMetadata = {
    description: '',
    markdownLinks: [],
    sources: objectList(lines, 'sources').map((entry) => ({
      resource: entry.resource || '',
      title: entry.title || '',
    })),
    tags: [],
    title: '',
    type: '',
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
  metadata.markdownLinks = [
    ...new Set(
      [
        ...body.matchAll(
          /(?<!!)\[[^\]\r\n]*\]\(\s*(?:<([^>\r\n]+)>|([^\s)"']+))(?:\s+["'][^"'\r\n]*["'])?\s*\)/g,
        ),
      ]
        .map((item) => (item[1] || item[2] || '').trim())
        .filter(Boolean),
    ),
  ]
  return metadata
}

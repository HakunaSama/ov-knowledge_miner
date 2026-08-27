function normalizedVikingUri(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'viking:') return null
    url.hash = ''
    url.search = ''
    return decodeURIComponent(url.href)
  } catch {
    return null
  }
}

export function findWikiLinkTarget(
  href: string | undefined,
  currentUri: string | null,
  entryUris: string[],
): string | null {
  if (!href || !currentUri || href.startsWith('#')) return null

  let resolved: string
  try {
    resolved = new URL(href, currentUri).href
  } catch {
    return null
  }
  const normalizedTarget = normalizedVikingUri(resolved)
  if (!normalizedTarget) return null

  return (
    entryUris.find(
      (entryUri) => normalizedVikingUri(entryUri) === normalizedTarget,
    ) ?? null
  )
}

export function renderDoubleBracketWikiLinks(
  markdown: string,
  entries: Array<{ name: string; uri: string }>,
): string {
  const targets = new Map<string, string>()
  const duplicates = new Set<string>()
  for (const entry of entries) {
    const stem = entry.name.replace(/\.md$/i, '')
    if (targets.has(stem)) duplicates.add(stem)
    else targets.set(stem, entry.uri)
  }
  for (const duplicate of duplicates) targets.delete(duplicate)
  return markdown.replace(/\[\[([^\r\n]+?)\]\]/g, (source, stem: string) => {
    const target = targets.get(stem)
    return target ? `[${stem}](${target})` : source
  })
}

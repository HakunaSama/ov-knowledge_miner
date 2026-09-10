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

export function findMarkdownLinkTarget(
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

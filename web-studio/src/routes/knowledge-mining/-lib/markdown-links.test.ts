import { describe, expect, it } from 'vitest'

import { findMarkdownLinkTarget } from './markdown-links'

const root = 'viking://resources/knowledge-mining/task/wiki'
const entries = [
  `${root}/index.md`,
  `${root}/entity/Aurora知识平台.md`,
  `${root}/concept/security.md`,
]

describe('findMarkdownLinkTarget', () => {
  it('resolves encoded links relative to the current knowledge page', () => {
    expect(
      findMarkdownLinkTarget(
        'entity/Aurora%E7%9F%A5%E8%AF%86%E5%B9%B3%E5%8F%B0.md',
        entries[0],
        entries,
      ),
    ).toBe(entries[1])
  })

  it('resolves parent-directory links', () => {
    expect(
      findMarkdownLinkTarget('../concept/security.md', entries[1], entries),
    ).toBe(entries[2])
  })

  it('leaves anchors and external links to the markdown renderer', () => {
    expect(findMarkdownLinkTarget('#details', entries[0], entries)).toBeNull()
    expect(
      findMarkdownLinkTarget('https://example.com', entries[0], entries),
    ).toBeNull()
  })

  it('returns null when the target is not part of the result tree', () => {
    expect(
      findMarkdownLinkTarget('concept/missing.md', entries[0], entries),
    ).toBeNull()
  })
})

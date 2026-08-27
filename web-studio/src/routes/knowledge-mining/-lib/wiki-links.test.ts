import { describe, expect, it } from 'vitest'

import { findWikiLinkTarget, renderDoubleBracketWikiLinks } from './wiki-links'

const root = 'viking://resources/knowledge-mining/task/wiki'
const entries = [
  `${root}/index.md`,
  `${root}/entity/Aurora知识平台.md`,
  `${root}/concept/security.md`,
]

describe('findWikiLinkTarget', () => {
  it('resolves encoded links relative to the current wiki page', () => {
    expect(
      findWikiLinkTarget(
        'entity/Aurora%E7%9F%A5%E8%AF%86%E5%B9%B3%E5%8F%B0.md',
        entries[0],
        entries,
      ),
    ).toBe(entries[1])
  })

  it('resolves parent-directory links', () => {
    expect(
      findWikiLinkTarget('../concept/security.md', entries[1], entries),
    ).toBe(entries[2])
  })

  it('leaves anchors and external links to the markdown renderer', () => {
    expect(findWikiLinkTarget('#details', entries[0], entries)).toBeNull()
    expect(
      findWikiLinkTarget('https://example.com', entries[0], entries),
    ).toBeNull()
  })

  it('returns null when the target is not part of the result tree', () => {
    expect(
      findWikiLinkTarget('concept/missing.md', entries[0], entries),
    ).toBeNull()
  })
})

describe('renderDoubleBracketWikiLinks', () => {
  it('renders exact unambiguous filename stems for the preview only', () => {
    expect(
      renderDoubleBracketWikiLinks('See [[Alice]] and [[Missing]].', [
        { name: 'Alice.md', uri: 'viking://resources/wiki/entities/Alice.md' },
      ]),
    ).toBe(
      'See [Alice](viking://resources/wiki/entities/Alice.md) and [[Missing]].',
    )
  })

  it('does not resolve duplicate filename stems', () => {
    expect(
      renderDoubleBracketWikiLinks('See [[Alice]].', [
        { name: 'Alice.md', uri: 'viking://resources/wiki/a/Alice.md' },
        { name: 'Alice.md', uri: 'viking://resources/wiki/b/Alice.md' },
      ]),
    ).toBe('See [[Alice]].')
  })
})

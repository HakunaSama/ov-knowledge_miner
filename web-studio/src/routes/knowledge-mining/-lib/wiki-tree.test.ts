import { describe, expect, it } from 'vitest'

import { buildWikiTree } from './wiki-tree'

describe('buildWikiTree', () => {
  it('keeps the physical topic and what/why/how directory hierarchy', () => {
    const root = 'viking://resources/run/wiki'
    const tree = buildWikiTree(root, [
      { name: 'index.md', uri: `${root}/index.md` },
      {
        name: 'service.md',
        uri: `${root}/knowledge/platform/what/service.md`,
      },
      {
        name: 'decision.md',
        uri: `${root}/knowledge/platform/why/decision.md`,
      },
      {
        name: 'runbook.md',
        uri: `${root}/knowledge/platform/how/runbook.md`,
      },
    ])

    expect(tree[0].name).toBe('index.md')
    expect(tree[1].name).toBe('knowledge')
    expect(tree[1].children[0].name).toBe('platform')
    expect(tree[1].children[0].children.map((node) => node.name)).toEqual([
      'how',
      'what',
      'why',
    ])
    expect(tree[1].children[0].children[0].children[0].path).toBe(
      'knowledge/platform/how/runbook.md',
    )
  })
})

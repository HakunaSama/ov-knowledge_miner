import { describe, expect, it } from 'vitest'

import { buildWikiTree } from './wiki-tree'

describe('buildWikiTree', () => {
  it('keeps the physical atomic main-view hierarchy', () => {
    const root = 'viking://resources/run/wiki'
    const tree = buildWikiTree(root, [
      { name: 'index.md', uri: `${root}/index.md` },
      {
        name: 'service.md',
        uri: `${root}/knowledge/topic/technology-data/engineering/service.md`,
      },
      {
        name: 'decision.md',
        uri: `${root}/knowledge/synthesis/technology-data/engineering/decision.md`,
      },
      {
        name: 'runbook.md',
        uri: `${root}/knowledge/procedure/technology-data/engineering/runbook.md`,
      },
    ])

    expect(tree[0].name).toBe('index.md')
    expect(tree[1].name).toBe('knowledge')
    expect(tree[1].children.map((node) => node.name)).toEqual([
      'procedure',
      'synthesis',
      'topic',
    ])
    expect(tree[1].children[0].children[0].children[0].children[0].path).toBe(
      'knowledge/procedure/technology-data/engineering/runbook.md',
    )
  })
})

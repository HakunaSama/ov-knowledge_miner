import { describe, expect, it } from 'vitest'

import {
  buildFacetFirstMetaKnowledgeTree,
  buildMetaKnowledgeUnits,
  buildMetaKnowledgeTree,
  buildMetaKnowledgeViewSections,
} from './meta-knowledge'

const root = 'viking://resources/wiki'
const entry = (facet: string, stem: string) => ({
  name: `${stem}.md`,
  uri: `${root}/knowledge/platform/${facet}/${stem}.md`,
})

describe('meta-knowledge views', () => {
  it('groups same-stem what, why, and how pages into one unit', () => {
    const entries = [
      entry('what', 'retrieval'),
      entry('why', 'retrieval'),
      entry('how', 'retrieval'),
      { name: 'index.md', uri: `${root}/index.md` },
    ]
    const units = buildMetaKnowledgeUnits(root, entries, ['what', 'why', 'how'])

    expect(units).toHaveLength(1)
    expect(Object.keys(units[0].entries).sort()).toEqual(['how', 'what', 'why'])
  })

  it('assigns every unit to only one derived group without duplicating files', () => {
    const entries = ['what', 'why', 'how'].map((facet) =>
      entry(facet, 'retrieval'),
    )
    const units = buildMetaKnowledgeUnits(root, entries, ['what', 'why', 'how'])
    const metadata = Object.fromEntries(
      entries.map((item) => [
        item.uri,
        {
          description: '',
          knowledgeLinks: [],
          metaId: 'retrieval',
          sources: [],
          tags: ['view/domain/system', 'view/domain/method'],
          title: item.name,
          type: 'concept',
          wikiLinks: [],
        },
      ]),
    )
    const sections = buildMetaKnowledgeViewSections(
      units,
      metadata,
      {
        description: '',
        groups: [
          {
            description: '',
            id: 'system',
            tag: 'view/domain/system',
            title: 'System',
          },
          {
            description: '',
            id: 'method',
            tag: 'view/domain/method',
            title: 'Method',
          },
        ],
        id: 'domain',
        selection: 'one_or_more',
        title: 'Domain',
      },
      ['what', 'why', 'how'],
    )

    expect(sections.flatMap((section) => section.entries)).toHaveLength(3)
    expect(sections[0].units).toHaveLength(1)
    expect(sections[1].units).toHaveLength(0)
  })

  it('uses an explicit physical meta directory without duplicating the meta id', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/platform/retrieval/${facet}/${facet}.md`,
    }))
    const metadata = Object.fromEntries(
      entries.map((item) => [
        item.uri,
        {
          description: '',
          knowledgeLinks: [],
          metaId: 'retrieval',
          sources: [],
          tags: [],
          title: item.name,
          type: 'concept',
          wikiLinks: [],
        },
      ]),
    )

    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      ['what', 'why', 'how'],
      metadata,
    )
    const tree = buildMetaKnowledgeTree(units)

    expect(units[0].path).toBe('knowledge/platform/retrieval')
    expect(tree[0].path).toBe('knowledge')
    expect(tree[0].children[0].path).toBe('knowledge/platform')
    expect(tree[0].children[0].children[0].unit?.id).toBe(
      'knowledge/platform/retrieval',
    )
  })

  it('groups facet-first paths into the same meta-knowledge unit', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/${facet}/platform/retrieval/${facet}.md`,
    }))
    const metadata = Object.fromEntries(
      entries.map((item) => [
        item.uri,
        {
          description: '',
          knowledgeLinks: [],
          metaId: 'retrieval',
          sources: [],
          tags: [],
          title: item.name,
          type: 'concept',
          wikiLinks: [],
        },
      ]),
    )

    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      ['what', 'why', 'how'],
      metadata,
      'knowledge',
    )

    expect(units).toHaveLength(1)
    expect(units[0].path).toBe('knowledge/platform/retrieval')
    expect(Object.keys(units[0].entries).sort()).toEqual(['how', 'what', 'why'])
  })

  it('renders facets above the configured view hierarchy without triplet cards', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/${facet}/platform/retrieval/${facet}.md`,
    }))
    const metadata = Object.fromEntries(
      entries.map((item) => [
        item.uri,
        {
          description: '',
          knowledgeLinks: [],
          metaId: 'retrieval',
          sources: [],
          tags: [],
          title: item.name,
          type: 'concept',
          wikiLinks: [],
        },
      ]),
    )
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      ['what', 'why', 'how'],
      metadata,
      'knowledge',
    )

    const tree = buildFacetFirstMetaKnowledgeTree(
      units,
      ['what', 'why', 'how'],
      { rootPath: 'knowledge' },
    )

    expect(tree.map((node) => node.name)).toEqual(['what', 'why', 'how'])
    expect(tree[0].children[0].path).toBe('what/platform')
    expect(tree[0].children[0].children[0].path).toBe('what/platform/retrieval')
    expect(tree[0].children[0].children[0].children[0].entry?.name).toBe(
      'what.md',
    )
  })
})

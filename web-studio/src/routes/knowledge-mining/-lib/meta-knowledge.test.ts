import { describe, expect, it } from 'vitest'

import {
  buildFacetFirstMetaKnowledgeTree,
  buildMetaKnowledgeUnits,
  buildMetaKnowledgeTree,
  buildMetaKnowledgeViewSections,
  buildPerspectiveMetaKnowledgeTree,
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

  it('places one_or_more units in every configured derived group', () => {
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

    expect(sections.flatMap((section) => section.entries)).toHaveLength(6)
    expect(sections[0].units).toHaveLength(1)
    expect(sections[1].units).toHaveLength(1)
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
    expect(tree[0].children[0].children[0].unit?.id).toBe('retrieval')
  })

  it('groups facet-first paths into the same meta-knowledge unit', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/${facet}/retrieval/${facet}.md`,
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
    expect(units[0].path).toBe('knowledge/retrieval')
    expect(Object.keys(units[0].entries).sort()).toEqual(['how', 'what', 'why'])
  })

  it('renders facets above the configured view hierarchy without triplet cards', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/${facet}/retrieval/${facet}.md`,
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
    expect(tree[0].children[0].path).toBe('what/retrieval')
    expect(tree[0].children[0].children[0].entry?.name).toBe('what.md')
  })

  it('renders every configured one_or_more group branch', () => {
    const entries = ['what', 'why', 'how'].map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/knowledge/${facet}/retrieval/${facet}.md`,
    }))
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
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      ['what', 'why', 'how'],
      metadata,
      'knowledge',
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

    const tree = buildPerspectiveMetaKnowledgeTree(sections, [
      'what',
      'why',
      'how',
    ])

    expect(tree.map((node) => node.name).sort()).toEqual(['Method', 'System'])
    expect(tree[0].children[0].path).toContain('/retrieval')
  })

  it('renders configured routes in the main view and the two-level perspective', () => {
    const entries = [
      {
        name: 'what.md',
        uri: `${root}/knowledge/what/products/retrieval/what.md`,
      },
      {
        name: 'why.md',
        uri: `${root}/knowledge/why/compliance/retrieval/why.md`,
      },
      {
        name: 'how.md',
        uri: `${root}/knowledge/how/technology/backend/retrieval/how.md`,
      },
    ]
    const metadata = Object.fromEntries(
      entries.map((item) => [
        item.uri,
        {
          description: '',
          knowledgeLinks: [],
          metaId: 'retrieval',
          sources: [],
          tags: ['view/perspective/topic/operations'],
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
    const mainTree = buildFacetFirstMetaKnowledgeTree(
      units,
      ['what', 'why', 'how'],
      { rootPath: 'knowledge' },
    )
    expect(mainTree[0].children[0].path).toBe('what/products')
    expect(mainTree[1].children[0].path).toBe('why/compliance')
    expect(mainTree[2].children[0].children[0].path).toBe(
      'how/technology/backend',
    )

    const sections = buildMetaKnowledgeViewSections(
      units,
      metadata,
      {
        description: '',
        groups: [
          {
            description: '',
            id: 'topic/operations',
            path: [
              { description: '', id: 'topic', title: 'TOPIC' },
              { description: '', id: 'operations', title: 'operations' },
            ],
            tag: 'view/perspective/topic/operations',
            title: 'operations',
          },
        ],
        id: 'perspective',
        selection: 'exactly_one',
        title: 'Perspective',
      },
      ['what', 'why', 'how'],
    )
    const perspective = buildPerspectiveMetaKnowledgeTree(sections, [
      'what',
      'why',
      'how',
    ])

    expect(perspective[0].name).toBe('TOPIC')
    expect(perspective[0].children[0].name).toBe('operations')
    expect(perspective[0].children[0].children[0].name).toBe('retrieval')
    expect(perspective[0].children[0].children[0].children).toHaveLength(3)
  })
})

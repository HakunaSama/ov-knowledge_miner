import { describe, expect, it } from 'vitest'

import type { CompileMainView } from './api'
import {
  buildFacetFirstMetaKnowledgeTree,
  buildMetaKnowledgeUnits,
  buildMetaKnowledgeTree,
  buildMetaKnowledgeViewSections,
  buildPerspectiveMetaKnowledgeTree,
} from './meta-knowledge'

const root = 'viking://resources/wiki'
const facets = ['definition', 'rationale', 'execution']
const directoryRoutes: Record<string, string[]> = {
  definition: ['catalog'],
  execution: ['runtime/backend'],
  rationale: ['policy'],
}
const configuredMainView: CompileMainView = {
  directory_routes: directoryRoutes,
  derived_views_include_exempt: false,
  exempt_paths: ['index.md'],
  facet_categories: facets,
  meta_knowledge: {
    group_by: 'frontmatter_field',
    id_field: 'knowledge_id',
    require_complete: true,
    shared_view_tags: true,
  },
  path_structure: ['facet', 'route', 'meta_id', 'filename'],
  root_path: 'configured-root',
  single_source_of_truth: true,
}
const simpleMainView: CompileMainView = {
  ...configuredMainView,
  directory_routes: undefined,
  path_structure: ['facet', 'meta_id', 'filename'],
}
const entry = (facet: string, stem: string) => ({
  name: `${facet}.md`,
  uri: `${root}/configured-root/${facet}/${directoryRoutes[facet].join('/')}/${stem}/${facet}.md`,
})
const metadataFor = (
  entries: Array<{ name: string; uri: string }>,
  tags: string[] = [],
) =>
  Object.fromEntries(
    entries.map((item) => [
      item.uri,
      {
        description: '',
        knowledgeLinks: [],
        metaId: 'retrieval',
        sources: [],
        tags,
        title: item.name,
        type: 'concept',
        wikiLinks: [],
      },
    ]),
  )

describe('meta-knowledge views', () => {
  it('groups every configured facet page into one unit', () => {
    const entries = [
      ...facets.map((facet) => entry(facet, 'retrieval')),
      { name: 'index.md', uri: `${root}/index.md` },
    ]
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      configuredMainView,
      metadataFor(entries),
    )

    expect(units).toHaveLength(1)
    expect(Object.keys(units[0].entries).sort()).toEqual([...facets].sort())
  })

  it('places one_or_more units in every configured derived group', () => {
    const entries = facets.map((facet) => entry(facet, 'retrieval'))
    const metadata = metadataFor(entries, [
      'view/domain/system',
      'view/domain/method',
    ])
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      configuredMainView,
      metadata,
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
      facets,
    )

    expect(sections.flatMap((section) => section.entries)).toHaveLength(6)
    expect(sections[0].units).toHaveLength(1)
    expect(sections[1].units).toHaveLength(1)
  })

  it('uses the configured physical meta directory without duplicating its id', () => {
    const entries = facets.map((facet) => entry(facet, 'retrieval'))
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      configuredMainView,
      metadataFor(entries),
    )
    const tree = buildMetaKnowledgeTree(units)

    expect(units[0].path).toBe('configured-root/catalog/retrieval')
    expect(tree[0].path).toBe('configured-root')
    expect(tree[0].children[0].path).toBe('configured-root/catalog')
    expect(tree[0].children[0].children[0].unit?.id).toBe('retrieval')
  })

  it('uses the facet position declared by path_structure', () => {
    const reorderedMainView: CompileMainView = {
      ...simpleMainView,
      path_structure: ['meta_id', 'facet', 'filename'],
    }
    const entries = facets.map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/configured-root/retrieval/${facet}/${facet}.md`,
    }))
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      reorderedMainView,
      metadataFor(entries),
    )

    expect(units).toHaveLength(1)
    expect(Object.keys(units[0].entries).sort()).toEqual([...facets].sort())
  })

  it('renders configured facets above their physical hierarchy', () => {
    const entries = facets.map((facet) => ({
      name: `${facet}.md`,
      uri: `${root}/configured-root/${facet}/retrieval/${facet}.md`,
    }))
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      simpleMainView,
      metadataFor(entries),
    )
    const tree = buildFacetFirstMetaKnowledgeTree(units, facets, {
      rootPath: 'configured-root',
    })

    expect(tree.map((node) => node.name)).toEqual(facets)
    expect(tree[0].children[0].path).toBe('definition/retrieval')
    expect(tree[0].children[0].children[0].entry?.name).toBe('definition.md')
  })

  it('renders every configured one_or_more group branch', () => {
    const entries = facets.map((facet) => entry(facet, 'retrieval'))
    const metadata = metadataFor(entries, [
      'view/catalog/system',
      'view/catalog/method',
    ])
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      configuredMainView,
      metadata,
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
            tag: 'view/catalog/system',
            title: 'System',
          },
          {
            description: '',
            id: 'method',
            tag: 'view/catalog/method',
            title: 'Method',
          },
        ],
        id: 'catalog',
        selection: 'one_or_more',
        title: 'Catalog',
      },
      facets,
    )
    const tree = buildPerspectiveMetaKnowledgeTree(sections, facets)

    expect(tree.map((node) => node.name).sort()).toEqual(['Method', 'System'])
    expect(tree[0].children[0].path).toContain('/retrieval')
  })

  it('renders configured routes and a configured two-level derived view', () => {
    const entries = facets.map((facet) => entry(facet, 'retrieval'))
    const metadata = metadataFor(entries, ['view/catalog/form/domain'])
    const units = buildMetaKnowledgeUnits(
      root,
      entries,
      configuredMainView,
      metadata,
    )
    const mainTree = buildFacetFirstMetaKnowledgeTree(units, facets, {
      rootPath: 'configured-root',
    })
    expect(mainTree[0].children[0].path).toBe('definition/catalog')
    expect(mainTree[1].children[0].path).toBe('rationale/policy')
    expect(mainTree[2].children[0].children[0].path).toBe(
      'execution/runtime/backend',
    )

    const sections = buildMetaKnowledgeViewSections(
      units,
      metadata,
      {
        description: '',
        groups: [
          {
            description: '',
            id: 'form/domain',
            path: [
              { description: '', id: 'form', title: 'Configured form' },
              { description: '', id: 'domain', title: 'Configured domain' },
            ],
            tag: 'view/catalog/form/domain',
            title: 'Configured domain',
          },
          {
            description: '',
            id: 'empty/branch',
            path: [
              { description: '', id: 'empty', title: 'Empty root' },
              { description: '', id: 'branch', title: 'Empty branch' },
            ],
            tag: 'view/catalog/empty/branch',
            title: 'Empty branch',
          },
        ],
        id: 'catalog',
        selection: 'exactly_one',
        title: 'Catalog',
      },
      facets,
    )
    const derivedTree = buildPerspectiveMetaKnowledgeTree(sections, facets)

    expect(derivedTree.map((node) => node.name)).toEqual([
      'Configured form',
      'Empty root',
    ])
    expect(derivedTree[0].children[0].name).toBe('Configured domain')
    expect(derivedTree[0].children[0].children[0].name).toBe('retrieval')
    expect(derivedTree[0].children[0].children[0].children).toHaveLength(3)
    expect(derivedTree[1].children[0].name).toBe('Empty branch')
  })
})

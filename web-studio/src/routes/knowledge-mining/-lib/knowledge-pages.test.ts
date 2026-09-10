import { describe, expect, it } from 'vitest'

import type { CompileMainView } from './api'
import {
  buildPageRoleTree,
  buildKnowledgePageTree,
  buildKnowledgePageUnits,
} from './knowledge-pages'

const root = 'viking://resources/wiki'
const configuredMainView: CompileMainView = {
  business_domains: [
    {
      description: 'Technical knowledge',
      id: 'technology-data',
      title: 'Technology and data',
      subdomains: [
        {
          description: 'Engineering knowledge',
          id: 'engineering',
          title: 'Engineering',
        },
      ],
    },
  ],
  exempt_paths: ['index.md'],
  page_roles: [
    { description: 'Explanatory knowledge', id: 'topic', title: 'TOPIC' },
    { description: 'Lookup knowledge', id: 'reference', title: 'REFERENCE' },
  ],
  path_structure: [
    'page_role',
    'business_domain',
    'subdomain',
    'subject_path',
    'filename',
  ],
  root_path: 'knowledge',
}

const metadata = (title: string) => ({
  description: '',
  knowledgeLinks: [],
  sources: [],
  tags: [],
  title,
  type: 'concept',
  markdownLinks: [],
})

describe('atomic main view', () => {
  it('keeps every physical page as an independent knowledge object', () => {
    const entries = [
      {
        name: 'retrieval.md',
        uri: `${root}/knowledge/topic/technology-data/engineering/search/retrieval.md`,
      },
      {
        name: 'api.md',
        uri: `${root}/knowledge/reference/technology-data/engineering/api.md`,
      },
    ]
    const units = buildKnowledgePageUnits(root, entries, configuredMainView, {
      [entries[0].uri]: metadata('Retrieval'),
      [entries[1].uri]: metadata('API'),
    })

    expect(units).toHaveLength(2)
    expect(units.map((unit) => unit.name).sort()).toEqual(['API', 'Retrieval'])
    expect(units.flatMap((unit) => Object.keys(unit.entries)).sort()).toEqual([
      'reference',
      'topic',
    ])
  })

  it('renders page roles above the configured physical hierarchy', () => {
    const entry = {
      name: 'retrieval.md',
      uri: `${root}/knowledge/topic/technology-data/engineering/search/retrieval.md`,
    }
    const units = buildKnowledgePageUnits(root, [entry], configuredMainView, {
      [entry.uri]: metadata('Retrieval'),
    })
    const tree = buildPageRoleTree(
      units,
      configuredMainView.page_roles.map((role) => role.id),
      { rootPath: configuredMainView.root_path },
    )

    expect(tree.map((node) => node.name)).toEqual(['topic'])
    expect(tree[0].children[0].path).toBe('topic/technology-data')
    expect(tree[0].children[0].children[0].path).toBe(
      'topic/technology-data/engineering',
    )
  })

  it('ignores pages outside the configured taxonomy', () => {
    const entries = [
      {
        name: 'unknown.md',
        uri: `${root}/knowledge/topic/unknown/engineering/unknown.md`,
      },
      { name: 'index.md', uri: `${root}/index.md` },
    ]

    expect(buildKnowledgePageUnits(root, entries, configuredMainView)).toEqual(
      [],
    )
  })

  it('builds a physical hierarchy without synthetic projection groups', () => {
    const entry = {
      name: 'retrieval.md',
      uri: `${root}/knowledge/topic/technology-data/engineering/retrieval.md`,
    }
    const units = buildKnowledgePageUnits(root, [entry], configuredMainView, {
      [entry.uri]: metadata('Retrieval'),
    })
    const tree = buildKnowledgePageTree(units)

    expect(tree[0].path).toBe('knowledge')
    expect(tree[0].children[0].path).toBe('knowledge/technology-data')
  })
})

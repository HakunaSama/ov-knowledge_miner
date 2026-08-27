import { describe, expect, it } from 'vitest'

import { buildViewSections, parseWikiPageMetadata } from './views'

describe('knowledge mining derived views', () => {
  it('parses block and inline OKF tags', () => {
    expect(
      parseWikiPageMetadata(`---
type: concept
title: "Deploy flow"
tags:
  - view/domain/processes-and-methods
  - deployment
---
# Deploy flow`),
    ).toEqual({
      description: '',
      knowledgeLinks: [],
      metaId: '',
      sources: [],
      tags: ['view/domain/processes-and-methods', 'deployment'],
      title: 'Deploy flow',
      type: 'concept',
      wikiLinks: [],
    })
    expect(
      parseWikiPageMetadata(`---
type: entity
title: API
tags: [view/domain/products-and-systems, reference]
---`),
    ).toMatchObject({
      tags: ['view/domain/products-and-systems', 'reference'],
    })
  })

  it('groups the same page into every matching configured section', () => {
    const entries = [
      { name: 'api.md', uri: 'viking://resources/wiki/api.md' },
      { name: 'runbook.md', uri: 'viking://resources/wiki/runbook.md' },
    ]
    const sections = buildViewSections(
      entries,
      {
        [entries[0].uri]: {
          description: '',
          knowledgeLinks: [],
          metaId: 'api',
          sources: [],
          tags: ['view/domain/system'],
          title: 'API',
          type: 'entity',
          wikiLinks: [],
        },
        [entries[1].uri]: {
          description: '',
          knowledgeLinks: [],
          metaId: 'runbook',
          sources: [],
          tags: ['view/domain/system', 'view/domain/method'],
          title: 'Runbook',
          type: 'concept',
          wikiLinks: [],
        },
      },
      {
        id: 'domain',
        title: 'Domain',
        description: 'Domain view',
        selection: 'one_or_more',
        groups: [
          {
            id: 'system',
            title: 'Systems',
            description: '',
            tag: 'view/domain/system',
          },
          {
            id: 'method',
            title: 'Methods',
            description: '',
            tag: 'view/domain/method',
          },
        ],
      },
    )
    expect(sections[0].entries.map((entry) => entry.name)).toEqual([
      'api.md',
      'runbook.md',
    ])
    expect(sections[1].entries.map((entry) => entry.name)).toEqual([
      'runbook.md',
    ])
  })

  it('parses page provenance and cross-knowledge links', () => {
    expect(
      parseWikiPageMetadata(`---
title: Launch
type: entity
tags: [view/domain/products-and-systems]
sources:
  - resource: viking://resources/source/brief.pdf
    title: Brief
    author: Product
    kind: original
    stage: documents
  - resource: viking://resources/wiki/_mining/evidence-ledger.json
    title: Evidence ledger
    author: VikingBot
    kind: intermediate
    stage: mining
knowledge_links:
  - resource: viking://resources/other/wiki/knowledge/release/why/date.md
    title: Release date rationale
    relation: depends-on
    direction: bidirectional
    context: Launch timing depends on the release rationale
---
# Launch`),
    ).toMatchObject({
      knowledgeLinks: [
        {
          context: 'Launch timing depends on the release rationale',
          direction: 'bidirectional',
          relation: 'depends-on',
          resource:
            'viking://resources/other/wiki/knowledge/release/why/date.md',
          title: 'Release date rationale',
        },
      ],
      sources: [
        {
          kind: 'original',
          resource: 'viking://resources/source/brief.pdf',
          stage: 'documents',
        },
        {
          kind: 'intermediate',
          resource: 'viking://resources/wiki/_mining/evidence-ledger.json',
          stage: 'mining',
        },
      ],
    })
  })

  it('parses canonical unindented YAML sequences emitted by VikingBot', () => {
    expect(
      parseWikiPageMetadata(`---
type: entity
title: Knowledge Mining Studio
tags:
- view/domain/products-and-systems
- view/usage/reference
sources:
- resource: viking://resources/source/studio.md
  title: Studio source
  author: ''
  kind: original
  stage: documents
- resource: viking://resources/wiki/_mining/evidence-ledger.json
  title: Evidence ledger
  author: VikingBot
  kind: intermediate
  stage: documents
knowledge_links:
- resource: viking://resources/other/wiki/knowledge/mining/why/design.md
  title: Mining design
  relation: related
  direction: outgoing
---`),
    ).toMatchObject({
      tags: ['view/domain/products-and-systems', 'view/usage/reference'],
      sources: [
        {
          resource: 'viking://resources/source/studio.md',
          kind: 'original',
        },
        {
          resource: 'viking://resources/wiki/_mining/evidence-ledger.json',
          kind: 'intermediate',
        },
      ],
      knowledgeLinks: [
        {
          resource:
            'viking://resources/other/wiki/knowledge/mining/why/design.md',
          relation: 'related',
          direction: 'outgoing',
        },
      ],
    })
  })
})

import { describe, expect, it } from 'vitest'

import { parseWikiPageMetadata } from './views'

describe('knowledge page metadata', () => {
  it('parses optional ordinary tags', () => {
    expect(
      parseWikiPageMetadata(`---
type: concept
title: "Deploy flow"
tags:
  - deployment-process
  - deployment
---
# Deploy flow`),
    ).toEqual({
      description: '',
      markdownLinks: [],
      sources: [],
      tags: ['deployment-process', 'deployment'],
      title: 'Deploy flow',
      type: 'concept',
    })
    expect(
      parseWikiPageMetadata(`---
type: entity
title: API
tags: [product-system, reference]
---`),
    ).toMatchObject({
      tags: ['product-system', 'reference'],
    })
  })

  it('parses page provenance and standard Markdown links', () => {
    expect(
      parseWikiPageMetadata(`---
title: Launch
type: entity
tags: [product-system]
sources:
  - resource: viking://resources/source/brief.pdf
    title: Brief
---
# Launch

See the [release procedure](../procedure/release.md).`),
    ).toMatchObject({
      markdownLinks: ['../procedure/release.md'],
      sources: [
        {
          resource: 'viking://resources/source/brief.pdf',
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
- product-system
- reference
sources:
- resource: viking://resources/source/studio.md
  title: Studio source
---`),
    ).toMatchObject({
      tags: ['product-system', 'reference'],
      sources: [
        {
          resource: 'viking://resources/source/studio.md',
        },
      ],
    })
  })
})

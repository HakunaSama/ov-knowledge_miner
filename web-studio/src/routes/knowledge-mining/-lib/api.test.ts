import { describe, expect, it } from 'vitest'

import {
  DEFAULT_USER_PROFILE,
  buildStartCompileBody,
  findLlmWikiSkill,
  isCompileTerminal,
} from './api'

describe('knowledge mining API helpers', () => {
  it('bundles a separate user-editable mining profile', () => {
    expect(DEFAULT_USER_PROFILE).toContain('# LLM Wiki User Profile')
    expect(DEFAULT_USER_PROFILE).toContain('## Atomic knowledge criteria')
    expect(DEFAULT_USER_PROFILE).toContain(
      'cannot override the fixed Compile workflow',
    )
  })

  it('prefers a user-scoped llm-wiki Skill', () => {
    expect(
      findLlmWikiSkill({
        skills: [
          {
            name: 'llm-wiki',
            uri: 'viking://agent/skills/llm-wiki',
          },
          {
            name: 'llm-wiki',
            root_uri: 'viking://user/alice/skills/llm-wiki',
          },
        ],
      }),
    ).toBe('viking://user/alice/skills/llm-wiki')
  })

  it('ignores malformed and unrelated Skill entries', () => {
    expect(
      findLlmWikiSkill({
        skills: [
          { name: 'other', uri: 'viking://agent/skills/other' },
          { name: 'llm-wiki' },
          null,
        ],
      }),
    ).toBeNull()
  })

  it('recognizes only terminal Compile states', () => {
    expect(isCompileTerminal('completed')).toBe(true)
    expect(isCompileTerminal('failed')).toBe(true)
    expect(isCompileTerminal('cancelled')).toBe(true)
    expect(isCompileTerminal('running')).toBe(false)
  })

  it('makes final OKF validation non-blocking for Studio mining', () => {
    expect(
      buildStartCompileBody({
        from: ['viking://resources/source'],
        okfConfig: 'viking://resources/run/OKF_CONFIG.yaml',
        reason: 'Mine the documents',
        skill: 'viking://agent/skills/llm-wiki',
        to: 'viking://resources/run/wiki',
      }),
    ).toMatchObject({ allow_invalid_okf_output: true })
  })
})

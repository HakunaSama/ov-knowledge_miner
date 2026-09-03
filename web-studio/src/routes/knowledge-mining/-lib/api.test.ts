import { describe, expect, it } from 'vitest'

import {
  DEFAULT_USER_PROFILE,
  buildHumanAnswerCompileInput,
  buildTeamMemoryCompileInput,
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

  it('builds the incremental Compile with team Memory as from and the first Wiki as to', () => {
    expect(
      buildTeamMemoryCompileInput({
        memorySourceUri: 'viking://resources/run/team-memory',
        okfConfig: 'viking://resources/run/document-sources/OKF_CONFIG.yaml',
        reason: 'Merge the new team Memory.',
        skill: 'viking://user/alice/skills/llm-wiki',
        targetUri: 'viking://resources/run/wiki',
      }),
    ).toEqual({
      from: ['viking://resources/run/team-memory'],
      okfConfig: 'viking://resources/run/document-sources/OKF_CONFIG.yaml',
      reason: 'Merge the new team Memory.',
      skill: 'viking://user/alice/skills/llm-wiki',
      to: 'viking://resources/run/wiki',
    })
  })

  it('builds a human-answer Compile against the same Wiki target', () => {
    expect(
      buildHumanAnswerCompileInput({
        answerSourceUri: 'viking://resources/run/team-memory/human-answers.md',
        okfConfig: 'viking://resources/run/document-sources/OKF_CONFIG.yaml',
        reason: 'Resolve the investigation questions.',
        skill: 'viking://user/alice/skills/llm-wiki',
        targetUri: 'viking://resources/run/wiki',
      }),
    ).toEqual({
      from: ['viking://resources/run/team-memory/human-answers.md'],
      okfConfig: 'viking://resources/run/document-sources/OKF_CONFIG.yaml',
      reason: 'Resolve the investigation questions.',
      skill: 'viking://user/alice/skills/llm-wiki',
      to: 'viking://resources/run/wiki',
    })
  })
})

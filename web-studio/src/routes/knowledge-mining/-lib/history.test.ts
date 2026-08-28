import { describe, expect, it } from 'vitest'

import type { CompileTaskHistoryItem } from './api'
import {
  jobsFromCompileTasks,
  mergeMiningJobs,
  parseMiningHistory,
} from './history'

function task(
  id: string,
  source: string,
  overrides: Partial<CompileTaskHistoryItem> = {},
): CompileTaskHistoryItem {
  return {
    created_at: `2026-08-27T10:0${id.at(-1)}:00Z`,
    request: {
      from: [source],
      okf_config:
        'viking://resources/knowledge-mining/run/document-sources/OKF_CONFIG.yaml',
      reason: 'Build the team knowledge base.',
      skill: 'viking://user/default/skills/llm-wiki',
      to: 'viking://resources/knowledge-mining/run/wiki',
    },
    stage: 'agent',
    status: 'running',
    task_id: id,
    updated_at: `2026-08-27T10:0${id.at(-1)}:30Z`,
    ...overrides,
  }
}

describe('knowledge mining history', () => {
  it('restores queued jobs so dispatch can continue after a refresh', () => {
    const stored = JSON.stringify({
      jobs: [
        {
          createdAt: '2026-08-27T09:00:00Z',
          documentSourceUri:
            'viking://resources/knowledge-mining/queued/document-sources',
          okfConfigUri:
            'viking://resources/knowledge-mining/queued/document-sources/OKF_CONFIG.yaml',
          phase: 'queued',
          skillUri: 'viking://user/default/skills/llm-wiki',
          targetUri: 'viking://resources/knowledge-mining/queued/wiki',
        },
      ],
      selectedJobId: 'queued',
      version: 1,
    })

    const history = parseMiningHistory(stored)

    expect(history.jobs[0].phase).toBe('queued')
    expect(history.jobs[0].okfConfigUri).toContain('OKF_CONFIG.yaml')
  })

  it('migrates the previous single session job', () => {
    const legacy = JSON.stringify({
      files: [{ name: 'guide.pdf', percent: 100, status: 'completed' }],
      phase: 'compiling',
      reason: 'Legacy mining',
      sourceUri: 'viking://resources/knowledge-mining/legacy/document-sources',
      targetUri: 'viking://resources/knowledge-mining/legacy/wiki',
      taskId: 'cmp_legacy',
    })

    const history = parseMiningHistory(null, legacy)

    expect(history.selectedJobId).toBe('legacy')
    expect(history.jobs[0].phase).toBe('compiling_documents')
    expect(history.jobs[0].documentFiles[0].name).toBe('guide.pdf')
  })

  it('groups document, Memory, and human tasks into one rich history job', () => {
    const jobs = jobsFromCompileTasks([
      task('cmp_1', 'viking://resources/knowledge-mining/run/document-sources'),
      task('cmp_2', 'viking://resources/knowledge-mining/run/team-memory'),
      task(
        'cmp_3',
        'viking://resources/knowledge-mining/run/team-memory/human-answers-1.md',
        {
          result: {
            created: [],
            from: [],
            link_count: 0,
            okf_version: '1.0',
            page_count: 9,
            skill: 'llm-wiki',
            to: 'viking://resources/knowledge-mining/run/wiki',
            unchanged: [],
            updated: [],
            warnings: [],
          },
          stage: 'completed',
          status: 'completed',
        },
      ),
    ])

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      documentTaskId: 'cmp_1',
      humanTaskId: 'cmp_3',
      memoryTaskId: 'cmp_2',
      phase: 'completed',
      taskId: 'cmp_3',
    })
    expect(jobs[0].result?.page_count).toBe(9)
  })

  it('discovers an llm-wiki result created by the CLI outside Studio roots', () => {
    const cliTask = task('cmp_cli', 'viking://resources/cli-sources', {
      request: {
        from: ['viking://resources/cli-sources'],
        okf_config: 'viking://resources/contracts/OKF_CONFIG.yaml',
        reason: 'CLI mining',
        skill: 'viking://user/default/skills/llm-wiki',
        to: 'viking://resources/cli-wiki',
      },
    })

    const jobs = jobsFromCompileTasks([cliTask])

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      documentSourceUri: 'viking://resources/cli-sources',
      id: 'cli:viking://resources/cli-wiki',
      origin: 'cli',
      targetUri: 'viking://resources/cli-wiki',
    })
  })

  it('does not mix unrelated Compile outputs into knowledge mining history', () => {
    const dailyReport = task('cmp_daily', 'viking://resources/daily-sources', {
      request: {
        from: ['viking://resources/daily-sources'],
        reason: 'Daily report',
        skill: 'viking://user/default/skills/daily-report',
        to: 'viking://resources/daily-report',
      },
    })

    expect(jobsFromCompileTasks([dailyReport])).toEqual([])
  })

  it('keeps local upload details while applying authoritative server state', () => {
    const server = jobsFromCompileTasks([
      task('cmp_1', 'viking://resources/knowledge-mining/run/document-sources'),
    ])[0]
    const local = {
      ...server,
      documentFiles: [
        { name: 'guide.pdf', percent: 100, status: 'completed' as const },
      ],
      phase: 'failed' as const,
    }

    const merged = mergeMiningJobs([local], [server])

    expect(merged[0].phase).toBe('compiling_documents')
    expect(merged[0].documentFiles[0].name).toBe('guide.pdf')
  })

  it('keeps the latest available result when a later stage fails', () => {
    const documentResult = {
      created: ['viking://resources/knowledge-mining/run/wiki/index.md'],
      from: [],
      link_count: 0,
      okf_version: '1.0',
      page_count: 6,
      skill: 'llm-wiki',
      to: 'viking://resources/knowledge-mining/run/wiki',
      unchanged: [],
      updated: [],
      warnings: [],
    }
    const jobs = jobsFromCompileTasks([
      task(
        'cmp_1',
        'viking://resources/knowledge-mining/run/document-sources',
        {
          result: documentResult,
          stage: 'completed',
          status: 'completed',
        },
      ),
      task('cmp_2', 'viking://resources/knowledge-mining/run/team-memory', {
        error: { code: 'AGENT_ERROR', message: 'Memory compile failed' },
        status: 'failed',
      }),
    ])

    expect(jobs[0].phase).toBe('failed')
    expect(jobs[0].result?.page_count).toBe(6)
  })
})

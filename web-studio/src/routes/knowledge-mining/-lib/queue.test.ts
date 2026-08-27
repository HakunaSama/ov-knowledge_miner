import { describe, expect, it } from 'vitest'

import type { MiningJob, MiningPhase } from './history'
import {
  hasOtherPendingMiningJob,
  isMiningWorkflowBlocking,
  miningQueuePosition,
  nextQueuedMiningJob,
} from './queue'

function job(id: string, phase: MiningPhase, createdAt: string): MiningJob {
  return {
    createdAt,
    documentFiles: [],
    documentSourceUri: `viking://resources/knowledge-mining/${id}/document-sources`,
    documentTaskId: null,
    error: null,
    humanTaskId: null,
    id,
    memoryFiles: [],
    memorySourceUri: `viking://resources/knowledge-mining/${id}/team-memory`,
    memoryTaskId: null,
    okfConfigUri: `${id}/OKF_CONFIG.yaml`,
    phase,
    reason: id,
    result: null,
    skillUri: 'viking://user/default/skills/llm-wiki',
    targetUri: `viking://resources/knowledge-mining/${id}/wiki`,
    taskId: null,
    updatedAt: createdAt,
  }
}

describe('knowledge mining queue', () => {
  const first = job('first', 'queued', '2026-08-27T01:00:00Z')
  const second = job('second', 'queued', '2026-08-27T02:00:00Z')

  it('starts only the oldest queued job when no workflow is active', () => {
    expect(nextQueuedMiningJob([second, first])?.id).toBe('first')
    expect(miningQueuePosition([second, first], 'first')).toBe(1)
    expect(miningQueuePosition([second, first], 'second')).toBe(2)
  })

  it.each([
    'preparing',
    'uploading',
    'compiling_documents',
    'compiling_memory',
    'compiling_human',
    'awaiting_human',
  ] satisfies MiningPhase[])('blocks the queue during %s', (phase) => {
    expect(isMiningWorkflowBlocking(phase)).toBe(true)
    expect(
      nextQueuedMiningJob([
        first,
        job('active', phase, '2026-08-27T00:00:00Z'),
      ]),
    ).toBeNull()
  })

  it.each([
    'idle',
    'partial',
    'completed',
    'failed',
    'cancelled',
  ] satisfies MiningPhase[])('continues after terminal phase %s', (phase) => {
    expect(
      nextQueuedMiningJob([
        first,
        job('terminal', phase, '2026-08-27T00:00:00Z'),
      ])?.id,
    ).toBe('first')
  })

  it('prevents a checkpoint resume from bypassing pending work', () => {
    const failed = job('failed', 'failed', '2026-08-27T00:00:00Z')
    expect(hasOtherPendingMiningJob([failed, first], failed.id)).toBe(true)
    expect(hasOtherPendingMiningJob([failed], failed.id)).toBe(false)
  })
})

import type { MiningJob, MiningPhase } from './history'

const BLOCKING_PHASES = new Set<MiningPhase>([
  'preparing',
  'uploading',
  'compiling_documents',
  'compiling_memory',
  'compiling_human',
  'awaiting_human',
])

export function isMiningWorkflowBlocking(phase: MiningPhase): boolean {
  return BLOCKING_PHASES.has(phase)
}

function queuedJobs(jobs: MiningJob[]): MiningJob[] {
  return jobs
    .filter((job) => job.phase === 'queued')
    .sort((left, right) => {
      const createdOrder = left.createdAt.localeCompare(right.createdAt)
      return createdOrder || left.id.localeCompare(right.id)
    })
}

export function nextQueuedMiningJob(jobs: MiningJob[]): MiningJob | null {
  if (
    jobs.some(
      (job) =>
        !(job.phase === 'preparing' && Boolean(job.windowFileLimit)) &&
        isMiningWorkflowBlocking(job.phase),
    )
  )
    return null
  return queuedJobs(jobs)[0] || null
}

export function miningQueuePosition(
  jobs: MiningJob[],
  jobId: string,
): number | null {
  const index = queuedJobs(jobs).findIndex((job) => job.id === jobId)
  return index < 0 ? null : index + 1
}

export function hasOtherPendingMiningJob(
  jobs: MiningJob[],
  jobId: string,
): boolean {
  const selected = jobs.find((job) => job.id === jobId)
  return jobs.some(
    (job) =>
      job.id !== jobId &&
      !(
        selected?.runId &&
        job.runId === selected.runId &&
        job.phase === 'preparing' &&
        (job.windowIndex || 1) > (selected.windowIndex || 1)
      ) &&
      (job.phase === 'queued' || isMiningWorkflowBlocking(job.phase)),
  )
}

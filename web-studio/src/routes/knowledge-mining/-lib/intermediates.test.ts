import { describe, expect, it } from 'vitest'

import {
  parseCandidateKnowledge,
  parseReadLedger,
  parseSourceCoverage,
} from './intermediates'

describe('source coverage', () => {
  it('parses upload-level source dispositions and summary counts', () => {
    const coverage = parseSourceCoverage(
      JSON.stringify({
        version: '1.0',
        stage: 'documents',
        sources: [
          {
            resource: 'viking://resources/source/document',
            status: 'cited',
            inspected: true,
            page_paths: ['knowledge/topic/meta/what/page.md'],
            evidence_resources: [
              'viking://resources/source/document/content.md',
            ],
          },
        ],
        summary: {
          uploaded: 1,
          inspected: 1,
          cited: 1,
          merged: 0,
          skipped: 0,
        },
      }),
    )

    expect(coverage.summary.uploaded).toBe(1)
    expect(coverage.sources[0].status).toBe('cited')
  })
})

describe('knowledge mining intermediate artifacts', () => {
  it('parses candidate decisions and persisted read coverage', () => {
    const candidates = parseCandidateKnowledge(
      JSON.stringify({
        version: '1.0',
        stage: 'documents',
        candidates: [
          {
            id: 'candidate-1',
            title: 'Candidate',
            summary: 'A useful candidate.',
            kind: 'concept',
            disposition: 'promoted',
            source_resources: ['viking://resources/source/document'],
            page_paths: ['knowledge/topic/id/what/page.md'],
          },
        ],
        summary: {
          total: 1,
          promoted: 1,
          merged: 0,
          deferred: 0,
          rejected: 0,
        },
      }),
    )
    const readLedger = parseReadLedger(
      JSON.stringify({
        version: '1.0',
        runs: [
          {
            task_id: 'task-1',
            stage: 'documents',
            source_units: [
              {
                resource: 'viking://resources/source/document',
                complete: true,
                required_read_paths: [
                  'compile_resources/src/document/page-1.md',
                ],
                missing_required_read_paths: [],
              },
            ],
          },
        ],
        summary: {
          runs: 1,
          source_units: 1,
          complete_source_units: 1,
          required_reads: 1,
          completed_required_reads: 1,
        },
      }),
    )

    expect(candidates.summary.promoted).toBe(1)
    expect(readLedger.summary.completed_required_reads).toBe(1)
  })
})

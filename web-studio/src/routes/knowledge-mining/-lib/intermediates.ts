export type SourceCoverageEntry = {
  evidence_resources: string[]
  inspected: true
  merged_into?: string
  page_paths: string[]
  reason?: string
  resource: string
  status: 'cited' | 'merged' | 'skipped'
}

export type SourceCoverage = {
  sources: SourceCoverageEntry[]
  stage: 'documents'
  summary: {
    cited: number
    inspected: number
    merged: number
    skipped: number
    uploaded: number
  }
  version: '1.0'
}

export type CandidateKnowledge = {
  candidates: Array<{
    disposition: 'promoted' | 'merged' | 'deferred' | 'rejected'
    id: string
    kind: 'entity' | 'concept' | 'synthesis'
    page_paths: string[]
    source_resources: string[]
    summary: string
    title: string
  }>
  stage: 'documents'
  summary: {
    deferred: number
    merged: number
    promoted: number
    rejected: number
    total: number
  }
  version: '1.0'
}

export type ReadLedger = {
  runs: Array<{
    source_units: Array<{
      complete: boolean
      missing_required_read_paths: string[]
      required_read_paths: string[]
      resource: string
    }>
    stage: 'documents'
    task_id: string
  }>
  summary: {
    complete_source_units: number
    completed_required_reads: number
    required_reads: number
    runs: number
    source_units: number
  }
  version: '1.0'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strings(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`${label} must be an array of strings.`)
  }
  return value.map((item) => item.trim())
}

export function parseSourceCoverage(content: string): SourceCoverage {
  const value: unknown = JSON.parse(content)
  if (!isRecord(value) || value.version !== '1.0') {
    throw new Error('Source coverage must be a version 1.0 JSON object.')
  }
  if (value.stage !== 'documents') {
    throw new Error('Source coverage has an invalid stage.')
  }
  if (!Array.isArray(value.sources)) {
    throw new Error('Source coverage sources must be an array.')
  }
  const sources = value.sources.map((raw, index): SourceCoverageEntry => {
    if (!isRecord(raw))
      throw new Error(`Source coverage entry ${index + 1} must be an object.`)
    const resource = typeof raw.resource === 'string' ? raw.resource.trim() : ''
    const status = String(raw.status)
    if (!resource.startsWith('viking://')) {
      throw new Error(
        `Source coverage entry ${index + 1} has an invalid resource.`,
      )
    }
    if (
      !['cited', 'merged', 'skipped'].includes(status) ||
      raw.inspected !== true
    ) {
      throw new Error(
        `Source coverage entry ${resource} has an invalid disposition.`,
      )
    }
    return {
      evidence_resources: strings(
        raw.evidence_resources ?? [],
        `Source ${resource} evidence_resources`,
      ),
      inspected: true,
      merged_into:
        typeof raw.merged_into === 'string'
          ? raw.merged_into.trim()
          : undefined,
      page_paths: strings(
        raw.page_paths ?? [],
        `Source ${resource} page_paths`,
      ),
      reason: typeof raw.reason === 'string' ? raw.reason.trim() : undefined,
      resource,
      status: status as SourceCoverageEntry['status'],
    }
  })
  if (!isRecord(value.summary)) {
    throw new Error('Source coverage summary must be an object.')
  }
  const coverageSummary = value.summary
  const count = (key: string): number => {
    const result = coverageSummary[key]
    if (!Number.isInteger(result) || Number(result) < 0) {
      throw new Error(
        `Source coverage summary ${key} must be a non-negative integer.`,
      )
    }
    return Number(result)
  }
  return {
    sources,
    stage: value.stage as SourceCoverage['stage'],
    summary: {
      cited: count('cited'),
      inspected: count('inspected'),
      merged: count('merged'),
      skipped: count('skipped'),
      uploaded: count('uploaded'),
    },
    version: '1.0',
  }
}

export function parseCandidateKnowledge(content: string): CandidateKnowledge {
  const value: unknown = JSON.parse(content)
  if (!isRecord(value) || value.version !== '1.0') {
    throw new Error('Candidate knowledge must be a version 1.0 JSON object.')
  }
  const stage = String(value.stage)
  if (stage !== 'documents') {
    throw new Error('Candidate knowledge has an invalid stage.')
  }
  if (!Array.isArray(value.candidates) || !isRecord(value.summary)) {
    throw new Error('Candidate knowledge has an invalid shape.')
  }
  const candidateSummary = value.summary
  const candidates = value.candidates.map((raw, index) => {
    if (!isRecord(raw))
      throw new Error(`Candidate ${index + 1} must be an object.`)
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
    const kind = String(raw.kind)
    const disposition = String(raw.disposition)
    if (!id || !title || !summary)
      throw new Error(`Candidate ${index + 1} is incomplete.`)
    if (!['entity', 'concept', 'synthesis'].includes(kind)) {
      throw new Error(`Candidate ${id} has an invalid kind.`)
    }
    if (!['promoted', 'merged', 'deferred', 'rejected'].includes(disposition)) {
      throw new Error(`Candidate ${id} has an invalid disposition.`)
    }
    return {
      disposition:
        disposition as CandidateKnowledge['candidates'][number]['disposition'],
      id,
      kind: kind as CandidateKnowledge['candidates'][number]['kind'],
      page_paths: strings(raw.page_paths ?? [], `Candidate ${id} page_paths`),
      source_resources: strings(
        raw.source_resources ?? [],
        `Candidate ${id} source_resources`,
      ),
      summary,
      title,
    }
  })
  const count = (key: string) => {
    const result = candidateSummary[key]
    if (!Number.isInteger(result) || Number(result) < 0) {
      throw new Error(`Candidate knowledge summary ${key} is invalid.`)
    }
    return Number(result)
  }
  return {
    candidates,
    stage: stage as CandidateKnowledge['stage'],
    summary: {
      deferred: count('deferred'),
      merged: count('merged'),
      promoted: count('promoted'),
      rejected: count('rejected'),
      total: count('total'),
    },
    version: '1.0',
  }
}

export function parseReadLedger(content: string): ReadLedger {
  const value: unknown = JSON.parse(content)
  if (
    !isRecord(value) ||
    value.version !== '1.0' ||
    !Array.isArray(value.runs)
  ) {
    throw new Error('Read ledger must be a version 1.0 JSON object with runs.')
  }
  if (!isRecord(value.summary))
    throw new Error('Read ledger summary is invalid.')
  const readSummary = value.summary
  const runs = value.runs.map((raw, index) => {
    if (!isRecord(raw) || !Array.isArray(raw.source_units)) {
      throw new Error(`Read ledger run ${index + 1} is invalid.`)
    }
    return {
      source_units: raw.source_units.map((unit, unitIndex) => {
        if (!isRecord(unit) || typeof unit.resource !== 'string') {
          throw new Error(
            `Read ledger source unit ${unitIndex + 1} is invalid.`,
          )
        }
        return {
          complete: unit.complete === true,
          missing_required_read_paths: strings(
            unit.missing_required_read_paths ?? [],
            `Read ledger source ${unit.resource} missing paths`,
          ),
          required_read_paths: strings(
            unit.required_read_paths ?? [],
            `Read ledger source ${unit.resource} required paths`,
          ),
          resource: unit.resource,
        }
      }),
      stage: String(raw.stage) as ReadLedger['runs'][number]['stage'],
      task_id: String(raw.task_id),
    }
  })
  const count = (key: string) => {
    const result = readSummary[key]
    if (!Number.isInteger(result) || Number(result) < 0) {
      throw new Error(`Read ledger summary ${key} is invalid.`)
    }
    return Number(result)
  }
  return {
    runs,
    summary: {
      complete_source_units: count('complete_source_units'),
      completed_required_reads: count('completed_required_reads'),
      required_reads: count('required_reads'),
      runs: count('runs'),
      source_units: count('source_units'),
    },
    version: '1.0',
  }
}

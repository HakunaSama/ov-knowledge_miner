import { describe, expect, it } from 'vitest'

import type { CompileResult } from './api'
import { transitionAfterCompletedCompile } from './workflow'

function result(
  investigation_status: CompileResult['investigation_status'],
  question_count: number,
): CompileResult {
  return {
    created: [],
    from: [],
    investigation_status,
    link_count: 0,
    okf_version: '1.0',
    page_count: 0,
    question_count,
    skill: 'viking://user/default/skills/llm-wiki',
    to: 'viking://resources/wiki',
    unchanged: [],
    updated: [],
    warnings: [],
  }
}

describe('knowledge mining completion gate', () => {
  it('stops the pipeline and exposes salvaged output as partial', () => {
    expect(
      transitionAfterCompletedCompile({
        hasMemoryFiles: true,
        memoryTaskStarted: false,
        phase: 'compiling_documents',
        result: { ...result('clear', 0), validation_passed: false },
        taskStage: 'salvaged',
      }),
    ).toBe('show_partial_result')
  })

  it('processes supplied team Memory before asking a person', () => {
    expect(
      transitionAfterCompletedCompile({
        hasMemoryFiles: true,
        memoryTaskStarted: false,
        phase: 'compiling_documents',
        result: result('needs_human_input', 2),
      }),
    ).toBe('start_memory_compile')
  })

  it('pauses the workflow instead of marking unresolved knowledge complete', () => {
    expect(
      transitionAfterCompletedCompile({
        hasMemoryFiles: true,
        memoryTaskStarted: true,
        phase: 'compiling_memory',
        result: result('needs_human_input', 7),
      }),
    ).toBe('await_human_evidence')
  })

  it('migrates an already displayed completed task back to the evidence gate', () => {
    expect(
      transitionAfterCompletedCompile({
        hasMemoryFiles: true,
        memoryTaskStarted: true,
        phase: 'completed',
        result: result('needs_human_input', 7),
      }),
    ).toBe('await_human_evidence')
  })

  it('completes only after a clear human-answer Compile', () => {
    expect(
      transitionAfterCompletedCompile({
        hasMemoryFiles: true,
        memoryTaskStarted: true,
        phase: 'compiling_human',
        result: result('clear', 7),
      }),
    ).toBe('complete_workflow')
  })
})

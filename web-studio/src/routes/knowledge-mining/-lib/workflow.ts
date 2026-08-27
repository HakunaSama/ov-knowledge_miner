import type { CompileResult } from './api'

type CompletedCompilePhase =
  | 'compiling_documents'
  | 'compiling_memory'
  | 'compiling_human'
  | 'awaiting_human'
  | 'completed'
  | string

export type CompletedCompileTransition =
  | 'show_partial_result'
  | 'start_memory_compile'
  | 'await_human_evidence'
  | 'complete_workflow'
  | 'unchanged'

export function transitionAfterCompletedCompile({
  hasMemoryFiles,
  memoryTaskStarted,
  phase,
  result,
  taskStage,
}: {
  hasMemoryFiles: boolean
  memoryTaskStarted: boolean
  phase: CompletedCompilePhase
  result: CompileResult | undefined
  taskStage?: string
}): CompletedCompileTransition {
  if (taskStage === 'salvaged' || result?.validation_passed === false) {
    return 'show_partial_result'
  }
  if (phase === 'compiling_documents' && hasMemoryFiles && !memoryTaskStarted) {
    return 'start_memory_compile'
  }
  if (
    result?.investigation_status === 'needs_human_input' &&
    (result.question_count || 0) > 0
  ) {
    return phase === 'awaiting_human' ? 'unchanged' : 'await_human_evidence'
  }
  if (
    ['compiling_documents', 'compiling_memory', 'compiling_human'].includes(
      phase,
    )
  ) {
    return 'complete_workflow'
  }
  return 'unchanged'
}

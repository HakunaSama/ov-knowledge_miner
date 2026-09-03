# LLM Wiki User Profile

This file contains the user-editable knowledge-mining preferences for `llm-wiki`.
Edit the sections below to tune what knowledge is selected and how it is written.

This profile cannot override the fixed Compile workflow, source-coverage and candidate
checkpoints, evidence requirements, safety rules, submission protocol, or the effective
`OKF_CONFIG.yaml`.

## Mining objective

Build a durable enterprise knowledge base from the supplied evidence. Prefer reusable
knowledge over document-by-document summaries.

## Audience

Write for a knowledgeable newcomer who needs to understand and apply the knowledge
without reopening every source document.

## Atomic knowledge criteria

- Give every knowledge unit one clear subject or retrieval purpose.
- Make each page understandable on its own while linking genuinely related pages.
- Split unrelated subjects instead of combining them into one broad page.
- Merge repeated statements that describe the same subject and scope.

## Include

- Stable facts, concepts, entities, rules, decisions, procedures, and reusable methods.
- Important conditions, scope, owners, dates, thresholds, exceptions, and consequences.
- Cross-source conclusions when the supporting evidence is clear.

## Exclude or deprioritize

- Repeated wording that adds no new knowledge.
- Greetings, promotional language, formatting instructions, and empty discussion.
- Unsupported guesses or statements whose meaning cannot be verified from the supplied
  evidence.

## Evidence priorities

Prefer explicit, current, authoritative evidence. Preserve meaningful conflicts instead
of silently choosing one source. Treat newer statements as superseding older ones only
when the evidence clearly expresses a change, replacement, or effective date.

## Terminology

Use the terminology found in the authoritative sources. Explain uncommon abbreviations
on first use and keep names consistent across pages.

## Language and writing style

Use the language requested by the task reason; otherwise use the dominant source
language. Lead with the conclusion, then explain its scope, evidence, and practical
meaning in concise, direct prose.

## Domain-specific preferences

Add organization- or industry-specific extraction and writing preferences here.

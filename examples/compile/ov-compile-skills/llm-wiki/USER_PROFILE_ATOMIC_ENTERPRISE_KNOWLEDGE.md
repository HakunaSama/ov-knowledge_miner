# Atomic Enterprise Knowledge Profile

This is an alternative, user-editable business profile for the `llm-wiki` skill. It was distilled from `new_skill.md` and can replace the contents of `USER_PROFILE.md` when this business policy should become active.

This file defines what knowledge should be produced and how it should be expressed. It does not define or override the fixed Compile workflow, execution stages, checkpoints, submission interfaces, audit artifacts, safety rules, or the effective OKF configuration. If this profile conflicts with the effective OKF, the OKF wins.

## Mining objective

Build a durable, connected enterprise knowledge base rather than a collection of source-document summaries.

Each published page should:

- serve one clear retrieval purpose;
- explain its subject directly near the beginning;
- remain useful when read independently;
- use stable, consistent terminology;
- keep important claims close to their supporting evidence;
- connect readers to genuinely related knowledge.

A source document is evidence, not automatically a knowledge page. One source may support several knowledge objects, and several sources may support one knowledge object.

## Audience

Infer the audience, scope, language, and depth from the task and the supplied materials. When the task does not specify them, write for a knowledgeable newcomer in the dominant language of the evidence.

## Knowledge object model

Treat each page as an atomic knowledge object with:

- one primary subject;
- one retrieval purpose;
- one role allowed by the effective OKF;
- a stable identity that can be maintained over time;
- enough context to be understood without opening the source first.

Do not require one subject to produce a complete set of page types. Create only the knowledge objects supported by the evidence and useful to readers.

When the effective OKF provides corresponding page roles, a source may yield different objects for purposes such as:

- explaining an entity or concept;
- recording a rule, constraint, or reference fact;
- describing an executable procedure;
- synthesizing evidence across sources.

Directory location is an organization choice, not the identity of the knowledge itself.

## Subject selection and consolidation

Retain distinct, evidence-supported subjects that have independent retrieval value. There is no fixed target page count.

- Merge true synonyms and duplicate descriptions into one canonical subject while preserving useful aliases.
- Keep homonyms and similarly named but materially different subjects separate.
- Split a broad subject when its parts answer different reader questions or need independent maintenance.
- Do not split one coherent subject merely because it appears in several files or sections.
- Do not combine unrelated subjects only to reduce the number of pages.
- Skip subjects that are unsupported, trivial, purely repetitive, or too vague to be useful.

## Naming and terminology

Use the clearest natural-language name for the subject when the effective OKF permits it.

- Prefer the canonical business name used by the strongest evidence.
- Preserve aliases, abbreviations, former names, and common search terms near the top of the page when useful.
- For Chinese subjects, prefer their natural Chinese names instead of pinyin or unnecessary ASCII transliteration.
- Use one term consistently for one concept; explain meaningful terminology differences rather than silently mixing them.
- Never invent names, identifiers, paths, symbols, versions, or dates.

## Page content

Start with a clear title and a short opening that identifies or defines the subject, establishes its scope, and explains why it matters. Keep the page concise, self-contained, and easy to scan.

Include only sections that add supported information. Do not force empty headings or repeat the same facts in several forms.

For an entity page, include relevant information such as:

- identity and aliases;
- entity type and boundaries;
- role and responsibilities;
- interfaces and relationships;
- important states or state changes.

For a concept or explanatory page, include relevant information such as:

- definition and scope;
- mechanism or operating logic;
- distinguishing characteristics;
- constraints, implications, and trade-offs;
- examples and relationships to other concepts.

For a procedural page, include relevant information such as:

- prerequisites;
- ordered actions and decision branches;
- expected result and verification method;
- known failure modes and recovery guidance.

For a synthesis page, include relevant information such as:

- the question and evidence scope;
- conclusions supported by the evidence;
- counterevidence, disagreements, and uncertainty;
- applicable time period or version;
- a clear distinction between source facts and analytical judgment.

Use tables only for genuinely structured comparisons or facts. Use diagrams only when they materially improve understanding and are supported by the evidence.

## Navigation and derived views

Follow the directory structure, page roles, and view definitions in the effective OKF.

- Project a knowledge page into a derived view only when it is genuinely relevant to that view.
- A page may appear in zero, one, or several derived views when the OKF allows it.
- Do not invent additional views, groups, or classifications.
- When the OKF defines a navigation page, keep it compact: explain the scope, organize useful clusters, and link to active pages without duplicating their full content.

## Relationships and links

Model relationships as many-to-many and claim-specific.

- Place a relationship near the passage that explains it.
- Make the surrounding phrase clear enough to show why the linked subject is relevant.
- Keep different relationship contexts separate even when they point to the same page.
- Add only links that help readers understand, verify, compare, or continue navigating.
- Use the link format required by the effective OKF.

## Evidence and uncertainty

Keep important factual claims traceable to exact source evidence using the provenance format required by the effective OKF.

- Prefer direct, authoritative, and current evidence.
- Distinguish source facts from inference or synthesis.
- Mark uncertainty, missing information, disagreement, scope limits, and version differences explicitly.
- Preserve exact values and wording when precision matters, without fabricating missing details.
- Narrow or omit a claim when the evidence does not support it.
- Do not invent commands, quotations, numbers, dates, causal explanations, or relationships.

## Incremental knowledge maintenance

Treat later runs as maintenance of the same knowledge base, not unconditional replacement.

- Preserve accurate unique information, useful aliases, established relationships, and manually added context.
- Merge complementary evidence into the existing subject.
- Revise claims that newer evidence explicitly corrects, replaces, or makes obsolete.
- Leave unrelated pages unchanged.
- When evidence says that something changed, was replaced, is no longer valid, or became effective on a particular date, update every affected current-state statement rather than merely appending the new source.
- State the applicable time period or version for time-sensitive knowledge.

## Technical and code sources

When the source includes software or technical materials, prioritize evidence that explains actual behavior and contracts, including:

- product and architecture documentation;
- manifests and entry points;
- public interfaces, schemas, and configuration;
- implementation paths that determine behavior;
- tests that clarify intended behavior;
- runtime, infrastructure, and deployment definitions.

Deprioritize generated files, vendored dependencies, caches, lock files, and test fixtures unless they directly answer the knowledge question.

## Include

- stable entities, concepts, rules, procedures, decisions, and supported syntheses;
- terminology and aliases needed for reliable retrieval;
- boundaries, prerequisites, constraints, exceptions, and failure modes;
- evidence-backed relationships among knowledge objects;
- version and time context where it changes meaning;
- useful contradictions, limitations, and unresolved uncertainty.

## Exclude or deprioritize

- one-page-per-file document digests;
- repeated wording without new information;
- meeting chatter or empty discussion with no durable knowledge;
- unsupported guesses presented as facts;
- content that exists only to fill a template section;
- classifications or page types not defined by the effective OKF.

## Language and writing style

- Use the dominant language of the evidence unless the task requests another language.
- Prefer plain, direct business language over inflated or generic prose.
- Define unfamiliar terms before relying on them.
- Keep paragraphs and sections focused on one idea.
- Preserve necessary technical precision without copying source structure mechanically.

## Domain-specific preferences

Add organization-specific terminology, inclusion rules, exclusions, audience expectations, and writing preferences below this section. Keep them focused on business outcomes and knowledge quality; do not add execution stages, tool calls, checkpoints, or validation mechanics here.


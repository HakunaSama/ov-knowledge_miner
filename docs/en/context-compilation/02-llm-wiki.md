# Example: LLM Wiki

Compile a set of heterogeneous sources into a Karpathy-style, evidence-grounded, interlinked **LLM Wiki**: every page has one clear retrieval purpose, opens with a direct summary, uses consistent terminology, makes relationships explicit, keeps evidence close to the claims it supports, and is fronted by an `index.md` navigation page.

The current Skill uses a configurable OKF contract. Its default knowledge types are:

| Page type | Use for |
|-----------|---------|
| `entity` | A named thing with a stable identity (person, organization, product, project, system, dataset, standard, event…) |
| `concept` | A reusable idea, mechanism, pattern, protocol, or mental model |
| `synthesis` | A cross-source overview, preference, event digest, insight, or navigation page with a clear scope or question |

`entity` and `concept` are the defaults; use `synthesis` only when a page genuinely combines evidence or provides navigation. `OKF_CONFIG.yaml` also defines the single-source Main view, explicit meta-knowledge directories, What/Why/How leaves, required frontmatter, dual provenance, cross-knowledge relations, eight intermediate artifacts (including candidate knowledge, the persisted read ledger, and evidence history), and literal `[[page name]]` WikiLinks. `generated.by` supports `{skill}`/`{model}` templates, while the submitter writes the actual UTC `generated.at`. The result is a knowledge base, not a source-by-source pile of summaries.

Skill source: [examples/compile/ov-compile-skills/llm-wiki](https://github.com/volcengine/OpenViking/tree/main/examples/compile/ov-compile-skills/llm-wiki) · Visualization script: [examples/compile/graph-show/llm-wiki](https://github.com/volcengine/OpenViking/tree/main/examples/compile/graph-show/llm-wiki)

## Step 1: Prepare the sources

If the material is not in OpenViking yet, import it. Use `ov add-resource` for directories, `ov write` for a single file:

```bash
# Import a directory as a source
ov add-resource ./my-research --to viking://resources/research --wait

# Or write a single file
ov mkdir viking://resources/research
ov write viking://resources/research/notes.md \
  --from-file ./notes.md --mode create --wait
```

Confirm the source is in place:

```bash
ov ls -r viking://resources/research
```

## Step 2: Add the Skill

Install the LLM Wiki Skill. By default it lands in your user-private skills namespace; use `-p viking://agent/skills` to make it shared across the team:

```bash
ov add-skill examples/compile/ov-compile-skills/llm-wiki --wait
```

Find the installed Skill URI:

```bash
ov skills list
# → viking://agent/skills/llm-wiki  (or viking://user/<you>/skills/llm-wiki)
```

## Step 3: Run compile

The Skill directory contains the default `OKF_CONFIG.yaml`. To use an external contract, write the YAML to OpenViking and pass its URI with `--okf-config`:

```bash
ov write viking://resources/research/OKF_CONFIG.yaml \
  --from-file ./my-okf-config.yaml --mode upsert
```

```bash
ov compile \
  --from viking://resources/research \
  --to viking://resources/research-wiki \
  --skill viking://agent/skills/llm-wiki \
  --okf-config viking://resources/research/OKF_CONFIG.yaml \
  --reason "Organize into a team-searchable Wiki, keeping the source of every claim" \
  --wait
```

- `--from` can be repeated or comma-separated to pass multiple sources at once.
- The `--to` directory is created automatically if it does not exist.
- Add `-o json` for machine-readable output; drop `--wait` to avoid blocking and poll with the returned `task_id`:

```bash
ov task status cmp_01abc      # progress and final result
ov task cancel cmp_01abc      # cooperative cancel
```

## Step 4: Inspect the output

When compile finishes, the target directory holds a Markdown knowledge base. Read the navigation page first, then drill in:

```bash
ov tree viking://resources/research-wiki
ov read viking://resources/research-wiki/index.md
```

Typical layout (page type maps to directory):

```text
research-wiki/
├── index.md                              # navigation synthesis
├── knowledge/<topic>/<meta_id>/what/<page>.md  # entity: what it is
├── knowledge/<topic>/<meta_id>/why/<page>.md   # synthesis: why it matters/is true
├── knowledge/<topic>/<meta_id>/how/<page>.md   # concept: how to act or verify
└── _mining/
    ├── run-manifest.json                 # run manifest
    ├── evidence-ledger.json              # per-page evidence ledger
    ├── investigation-report.json         # conflicts and evidence gaps
    ├── questionnaire.json                # human-input questionnaire
    ├── source-coverage.json              # upload-level source coverage
    ├── candidate-knowledge.json          # candidate disposition decisions
    ├── readlist.json                     # platform-generated per-document read ledger
    └── evidence-history.json             # cross-stage evidence snapshots
```

Every page's `sources` includes at least one input and `_mining/evidence-ledger.json`. `candidate-knowledge.json` records how source candidates became final meta-knowledge. `source-coverage.json` records whether every upload-level source was cited, merged, or skipped with a reason and must agree with the platform-generated `readlist.json` and the evidence ledger. Incremental runs merge prior evidence and append an `evidence-history.json` snapshot. Cross-knowledge relations live in `knowledge_links`. If the investigation report finds unresolved issues, use the Studio questionnaire or supply human answers as a new source and incrementally Compile the same target.

Compile builds the complete source tree with level-by-level non-recursive listings instead of relying on a depth- and node-truncated recursive catalog. A task that exceeds an explicit source-node, file-count, or byte limit fails rather than silently losing tail documents. Documents with at most eight parsed content fragments require every fragment to be read; longer PDFs and similar documents get eight evenly distributed required probes that include the head, exact middle, and tail. The observed read trace is persisted per run in `_mining/readlist.json`, so coverage can be audited document by document later.

## Step 5: Visualize it as an interactive graph

`wiki_graph.py` connects **directly to the OpenViking service** to read the Wiki pages (no local download needed), colors pages by type, links them by their cross-references, and produces a standalone interactive HTML:

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/research-wiki \
  -o research-wiki-graph.html \
  --title "Research Knowledge Base"
```

Open `research-wiki-graph.html` in a browser. Nodes are colored by `entity`, `concept`, or `synthesis`; edges recognize both ordinary Markdown links and literal `[[page name]]` WikiLinks. Clicking a node shows its body.

Connection settings resolve the same way as `ov`: command-line arguments → `OPENVIKING_*` environment variables → `~/.openviking/ovcli.conf`. Pass them explicitly for a remote service:

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/research-wiki \
  --url https://openviking.example.com \
  --api-key "$OPENVIKING_API_KEY" \
  -o research-wiki-graph.html --title "Research Knowledge Base"
```

Pass multiple Wikis to draw them on the same graph for comparison:

```bash
python examples/compile/graph-show/llm-wiki/wiki_graph.py \
  viking://resources/wiki-a viking://resources/wiki-b \
  -o combined.html --title "Two Knowledge Bases Side by Side"
```

## Related docs

- [Context Compilation Overview](./01-overview.md)
- [Knowledge Graph example](./03-knowledge-graph.md)
- [VikingBot API → compile()](../api/24-vikingbot.md#compile)

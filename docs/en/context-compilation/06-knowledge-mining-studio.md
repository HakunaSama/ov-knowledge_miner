# Knowledge Mining

Knowledge mining is available through `ov knowledge-mining` and the Web Studio Knowledge Mining page. Both clients submit document-only Compile tasks with the same bundled Skill and OKF contract. Studio manages its own serial browser queue and can also discover or import CLI results; it does not create alternate physical views.

Both clients set `allow_invalid_okf_output=true`. The first two mining checkpoints remain blocking, while final OKF conformance findings are returned as warnings after the best available checkout has been committed.

## Run mining from the CLI

Start an OpenViking server with VikingBot enabled, then run:

```bash
ov knowledge-mining \
  --documents ./resources/documents \
  --okf-config ./OKF_CONFIG.yaml \
  --to viking://resources/enterprise-wiki \
  --window-files 10 \
  --state-file ./mining-state.json \
  --wait
```

- `--documents` accepts local files, local directories, or an existing `viking://` folder.
- Windows run serially and always write to the same target knowledge base.
- Later windows read and incrementally update the existing target.
- A file that exceeds a window budget, but not the 512 MiB hard file limit, runs alone in one window. The CLI does not physically split a PDF.
- Final OKF validation is non-blocking for `knowledge-mining`; source coverage and candidate-knowledge checkpoints still have to complete.

## Resume and inspect logs

```bash
ov knowledge-mining --resume-state ./mining-state.json --wait
```

Resume skips completed windows and confirmed uploads. Results already written by earlier windows remain in the shared target.

```text
viking://resources/knowledge-mining/<batch-id>/
├── OKF_CONFIG.yaml
├── windows/<index>/document-sources/
├── logs/run.json
├── logs/windows/<index>.json
└── wiki/
    ├── knowledge/<page_role>/<business_domain>/<subdomain>/<subject-path>/<page>.md
    └── _mining/
        ├── run-manifest.json
        ├── evidence-ledger.json
        ├── investigation-report.json
        ├── source-coverage.json
        ├── candidate-knowledge.json
        ├── readlist.json
        └── evidence-history.json
```

The physical tree is the only Main view. Each promoted candidate maps to one canonical knowledge page; no fixed facet set or tag-derived projection is created.

`source-coverage.json` tracks uploaded source files, not parser fragments. PDF fragments retain the original PDF identity, URI, and page evidence through source coverage and the evidence ledger, so final pages remain traceable to the real PDF.

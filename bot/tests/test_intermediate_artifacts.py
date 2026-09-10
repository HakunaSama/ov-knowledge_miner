import json
from pathlib import Path

from vikingbot.compile.intermediate_artifacts import prepare_persistent_intermediates
from vikingbot.compile.okf_config import parse_okf_config
from vikingbot.compile.renderer import finalize_resource_checkout

ROOT = Path(__file__).resolve().parents[2]
CONFIG = parse_okf_config(
    (ROOT / "examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml").read_text()
)


def _json(value: dict) -> bytes:
    return json.dumps(value).encode()


def _page(*, title: str, page_type: str, source: str) -> bytes:
    return (
        "---\n"
        f"type: {page_type}\n"
        f"title: {title}\n"
        f"description: Knowledge about {title}.\n"
        "sources:\n"
        f"  - resource: {source}\n"
        "    title: Source\n"
        "generated:\n"
        "  by: VikingBot/llm-wiki\n"
        "  at: 2026-08-27T00:00:00Z\n"
        "---\n\n"
        f"# {title}\n\nBody.\n"
    ).encode()


def test_platform_intermediates_preserve_prior_evidence_and_append_audit_runs():
    page_path = "knowledge/topic/technology-data/engineering/prior.md"
    baseline = {
        "_mining/evidence-ledger.json": _json(
            {
                "version": "1.0",
                "pages": [
                    {
                        "path": page_path,
                        "source_resources": ["viking://resources/prior/document"],
                        "intermediate_resources": [
                            "viking://resources/wiki/_mining/prior.json"
                        ],
                        "claims": [{"claim": "prior"}],
                    }
                ],
            }
        ),
        "_mining/readlist.json": _json(
            {
                "version": "1.0",
                "runs": [{"task_id": "prior-task", "source_units": []}],
                "summary": {},
            }
        ),
        "_mining/source-coverage.json": _json(
            {
                "version": "1.0",
                "stage": "documents",
                "sources": [
                    {
                        "resource": "viking://resources/prior/document",
                        "inspected": True,
                        "status": "cited",
                    }
                ],
            }
        ),
        "_mining/candidate-knowledge.json": _json(
            {
                "version": "1.0",
                "stage": "documents",
                "candidates": [
                    {
                        "id": "prior-candidate",
                        "disposition": "deferred",
                        "reason": "Awaiting the incremental source.",
                    }
                ],
            }
        ),
        "_mining/evidence-history.json": _json(
            {
                "version": "1.0",
                "generated_by": "compile",
                "runs": [{"task_id": "prior-task", "pages": [{"path": "prior.md"}]}],
            }
        ),
    }
    checkout = {
        "_mining/run-manifest.json": _json(
            {
                "version": "1.0",
                "target": "viking://resources/wiki",
                "stage": "documents",
                "source_roots": ["viking://resources/current"],
            }
        ),
        "_mining/evidence-ledger.json": _json(
            {
                "version": "1.0",
                "pages": [
                    {
                        "path": page_path,
                        "source_resources": ["viking://resources/current/document"],
                        "intermediate_resources": [
                            "viking://resources/wiki/_mining/evidence-ledger.json"
                        ],
                        "claims": [{"claim": "current"}],
                    }
                ],
            }
        ),
        "_mining/source-coverage.json": _json(
            {"version": "1.0", "stage": "documents", "sources": []}
        ),
        "_mining/candidate-knowledge.json": _json(
            {"version": "1.0", "stage": "documents", "candidates": []}
        ),
    }
    source_unit = {
        "resource": "viking://resources/current/document",
        "title": "Document",
        "inspection_strategy": "all",
        "required_read_paths": ["compile_resources/src/document/content.md"],
        "leaves": [
            {
                "workspace_path": "compile_resources/src/document/content.md",
                "status": "materialized",
            }
        ],
    }

    result = prepare_persistent_intermediates(
        checkout,
        baseline=baseline,
        config=CONFIG,
        task_id="current-task",
        recorded_at="2026-08-27T00:00:00Z",
        source_units=[source_unit],
        read_paths={"compile_resources/src/document/content.md"},
    )

    ledger = json.loads(result["_mining/evidence-ledger.json"])
    assert ledger["pages"][0]["source_resources"] == [
        "viking://resources/prior/document",
        "viking://resources/current/document",
    ]
    assert ledger["pages"][0]["claims"] == [{"claim": "current"}]
    readlist = json.loads(result["_mining/readlist.json"])
    assert [run["task_id"] for run in readlist["runs"]] == [
        "prior-task",
        "current-task",
    ]
    assert readlist["runs"][-1]["source_units"][0]["complete"] is True
    history = json.loads(result["_mining/evidence-history.json"])
    assert [run["task_id"] for run in history["runs"]] == [
        "prior-task",
        "current-task",
    ]
    assert history["runs"][-1]["pages"] == ledger["pages"]


def test_platform_enriches_atomic_incremental_candidates_and_page_ledgers():
    prior_source = "viking://resources/prior/document"
    current_source = "viking://resources/current/document"
    evidence_uri = "viking://resources/wiki/_mining/evidence-ledger.json"
    current_path = "knowledge/topic/technology-data/engineering/current-topic.md"
    prior_path = "knowledge/reference/technology-data/engineering/prior-topic.md"
    checkout = {
        "_mining/run-manifest.json": _json(
            {
                "version": "1.0",
                "target": "viking://resources/wiki",
                "stage": "documents",
                "source_roots": [current_source, prior_source],
            }
        ),
        "_mining/evidence-ledger.json": _json({"version": "1.0", "pages": []}),
        "_mining/source-coverage.json": _json(
            {"version": "1.0", "stage": "documents", "sources": []}
        ),
        "_mining/candidate-knowledge.json": _json(
            {
                "version": "1.0",
                "stage": "documents",
                "candidates": [
                    {
                        "id": "current-topic",
                        "title": "Current topic",
                        "kind": "concept",
                        "summary": "The current source supports this topic.",
                        "source_resources": [current_source],
                        "disposition": "promoted",
                        "page_path": current_path,
                        "stage": "documents",
                    },
                    {
                        "id": "prior-topic",
                        "title": "Prior topic",
                        "kind": "synthesis",
                        "summary": "The prior source supports this topic.",
                        "source_resources": [prior_source],
                        "disposition": "promoted",
                        "page_path": prior_path,
                        "stage": "documents",
                    },
                ],
            }
        ),
        "_mining/investigation-report.json": _json(
            {
                "version": "1.0",
                "status": "clear",
                "conflicts": [],
                "evidence_gaps": [],
            }
        ),
        current_path: _page(
            title="Current topic", page_type="concept", source=current_source
        ),
        prior_path: _page(
            title="Prior topic", page_type="synthesis", source=prior_source
        ),
    }
    baseline = {
        "_mining/evidence-ledger.json": _json({"version": "1.0", "pages": []}),
        "_mining/source-coverage.json": _json(
            {"version": "1.0", "stage": "documents", "sources": []}
        ),
        "_mining/candidate-knowledge.json": _json(
            {"version": "1.0", "stage": "documents", "candidates": []}
        ),
    }
    source_units = [
        {
            "resource": current_source,
            "title": "Current",
            "required_read_paths": ["compile_resources/current.md"],
            "leaves": [
                {
                    "workspace_path": "compile_resources/current.md",
                    "status": "materialized",
                }
            ],
        },
        {
            "resource": prior_source,
            "title": "Prior",
            "required_read_paths": ["compile_resources/prior.md"],
            "leaves": [
                {
                    "workspace_path": "compile_resources/prior.md",
                    "status": "materialized",
                }
            ],
        },
    ]
    read_paths = {"compile_resources/current.md", "compile_resources/prior.md"}

    result = prepare_persistent_intermediates(
        checkout,
        baseline=baseline,
        config=CONFIG,
        task_id="current-task",
        recorded_at="2026-08-27T00:00:00Z",
        source_units=source_units,
        read_paths=read_paths,
        target_uri="viking://resources/wiki",
        source_roots={"current": current_source, "prior": prior_source},
    )

    ledger = json.loads(result["_mining/evidence-ledger.json"])
    assert {entry["path"] for entry in ledger["pages"]} == {current_path, prior_path}
    assert all(entry["intermediate_resources"] == [evidence_uri] for entry in ledger["pages"])
    candidates = json.loads(result["_mining/candidate-knowledge.json"])
    promoted = [
        entry for entry in candidates["candidates"] if entry["disposition"] == "promoted"
    ]
    assert {entry["page_path"] for entry in promoted} == {current_path, prior_path}

    finalized = finalize_resource_checkout(
        result,
        target_uri="viking://resources/wiki",
        source_roots={"current": current_source, "prior": prior_source},
        okf_config=CONFIG,
        source_units=source_units,
        read_paths=read_paths,
    )
    assert finalized.wiki_paths == {current_path, prior_path}
    assert {artifact["kind"] for artifact in finalized.intermediate_artifacts} == {
        "run_manifest",
        "evidence_ledger",
        "investigation_report",
        "source_coverage",
        "candidate_knowledge",
        "readlist",
        "evidence_history",
    }

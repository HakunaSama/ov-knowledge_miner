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


def test_platform_intermediates_preserve_prior_evidence_and_append_audit_runs():
    baseline = {
        "_mining/evidence-ledger.json": _json(
            {
                "version": "1.0",
                "pages": [
                    {
                        "path": "knowledge/topic/id/what/page.md",
                        "source_resources": ["viking://resources/prior/document"],
                        "intermediate_resources": ["viking://resources/wiki/_mining/prior.json"],
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
                "stage": "memory_incremental",
                "source_roots": ["viking://resources/current"],
            }
        ),
        "_mining/evidence-ledger.json": _json(
            {
                "version": "1.0",
                "pages": [
                    {
                        "path": "knowledge/topic/id/what/page.md",
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
            {"version": "1.0", "stage": "memory_incremental", "sources": []}
        ),
        "_mining/candidate-knowledge.json": _json(
            {
                "version": "1.0",
                "stage": "memory_incremental",
                "candidates": [],
            }
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
    coverage = json.loads(result["_mining/source-coverage.json"])
    assert {item["resource"] for item in coverage["sources"]} == {
        "viking://resources/prior/document",
        "viking://resources/current/document",
    }
    candidates = json.loads(result["_mining/candidate-knowledge.json"])
    assert "prior-candidate" in {item["id"] for item in candidates["candidates"]}
    assert any(
        item["source_resources"] == ["viking://resources/current/document"]
        and item["disposition"] == "rejected"
        for item in candidates["candidates"]
    )
    history = json.loads(result["_mining/evidence-history.json"])
    assert [run["task_id"] for run in history["runs"]] == ["prior-task", "current-task"]
    assert history["runs"][-1]["pages"] == ledger["pages"]


def test_platform_repairs_malformed_incremental_candidates_and_rebuilds_page_ledgers():
    prior_source = "viking://resources/prior/document"
    current_source = "viking://resources/current/document"
    evidence_uri = "viking://resources/wiki/_mining/evidence-ledger.json"

    def page(path: str, facet: str, source: str, meta_id: str = "topic") -> bytes:
        return (
            "---\n"
            f"type: {'entity' if facet == 'what' else 'synthesis' if facet == 'why' else 'concept'}\n"
            f"title: Topic {facet}\n"
            f"description: Topic {facet} description.\n"
            "tags:\n"
            "  - view/domain/products-and-systems\n"
            "  - view/usage/reference\n"
            f"meta_id: {meta_id}\n"
            "status: stable\n"
            "sources:\n"
            f"  - resource: {source}\n"
            "    title: Source\n"
            "    author: Team\n"
            "    kind: team-memory\n"
            "    stage: memory_incremental\n"
            f"  - resource: {evidence_uri}\n"
            "    title: Evidence ledger\n"
            "    author: VikingBot\n"
            "    kind: intermediate\n"
            "    stage: mining\n"
            "generated:\n"
            "  by: VikingBot/llm-wiki\n"
            "  at: 2026-08-27T00:00:00Z\n"
            "knowledge_links: []\n"
            "---\n\nBody.\n"
        ).encode()

    page_paths = [
        f"knowledge/domain/topic/{facet}/topic-{facet}.md"
        for facet in ("what", "why", "how")
    ]
    prior_page_paths = [
        f"knowledge/domain/prior-topic/{facet}/prior-{facet}.md"
        for facet in ("what", "why", "how")
    ]
    checkout = {
        "_mining/run-manifest.json": _json(
            {
                "version": "1.0",
                "target": "viking://resources/wiki",
                "stage": "memory_incremental",
                "source_roots": [current_source],
            }
        ),
        "_mining/evidence-ledger.json": _json({"version": "1.0", "pages": []}),
        "_mining/source-coverage.json": _json(
            {"version": "1.0", "stage": "memory_incremental", "sources": []}
        ),
        "_mining/candidate-knowledge.json": b'{"version":"1.0","candidates":[}',
        "_mining/investigation-report.json": _json(
            {
                "version": "1.0",
                "status": "clear",
                "conflicts": [],
                "evidence_gaps": [],
            }
        ),
        "_mining/questionnaire.json": _json(
            {"version": "1.0", "status": "not_required", "questions": []}
        ),
        **{
            path: page(path, facet, current_source)
            for path, facet in zip(page_paths, ("what", "why", "how"), strict=True)
        },
        **{
            path: page(path, facet, prior_source, "prior-topic")
            for path, facet in zip(
                prior_page_paths, ("what", "why", "how"), strict=True
            )
        },
    }
    baseline = {
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
                        "id": "prior",
                        "title": "Prior",
                        "kind": "synthesis",
                        "summary": "Prior candidate.",
                        "source_resources": [prior_source],
                        "disposition": "rejected",
                        "reason": "No distinct knowledge.",
                        "page_paths": [],
                    }
                ],
            }
        ),
    }
    source_unit = {
        "resource": current_source,
        "title": "Current",
        "required_read_paths": ["compile_resources/current.md"],
        "leaves": [
            {
                "workspace_path": "compile_resources/current.md",
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
        read_paths={"compile_resources/current.md"},
        target_uri="viking://resources/wiki",
        source_roots={"current": current_source, "prior": prior_source},
    )

    ledger = json.loads(result["_mining/evidence-ledger.json"])
    expected_page_paths = {*page_paths, *prior_page_paths}
    assert {entry["path"] for entry in ledger["pages"]} == expected_page_paths
    assert {
        source
        for entry in ledger["pages"]
        for source in entry["source_resources"]
    } == {current_source, prior_source}
    assert all(entry["intermediate_resources"] == [evidence_uri] for entry in ledger["pages"])
    candidates = json.loads(result["_mining/candidate-knowledge.json"])
    promoted = [entry for entry in candidates["candidates"] if entry["disposition"] == "promoted"]
    assert {entry["meta_id"] for entry in promoted} == {"topic", "prior-topic"}
    assert {
        path for entry in promoted for path in entry["page_paths"]
    } == expected_page_paths
    assert {entry["resource"] for entry in json.loads(
        result["_mining/source-coverage.json"]
    )["sources"]} == {prior_source, current_source}

    finalized = finalize_resource_checkout(
        result,
        target_uri="viking://resources/wiki",
        source_roots={"current": current_source, "prior": prior_source},
        okf_config=CONFIG,
        source_units=[source_unit],
        read_paths={"compile_resources/current.md"},
    )
    assert set(finalized.wiki_paths) == expected_page_paths
    assert {artifact["kind"] for artifact in finalized.intermediate_artifacts} == {
        "run_manifest",
        "evidence_ledger",
        "investigation_report",
        "questionnaire",
        "source_coverage",
        "candidate_knowledge",
        "readlist",
        "evidence_history",
    }

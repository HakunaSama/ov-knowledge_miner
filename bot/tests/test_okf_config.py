import json
from pathlib import Path

import pytest
import yaml
from vikingbot.compile.okf_config import parse_okf_config
from vikingbot.compile.renderer import finalize_resource_checkout

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = (ROOT / "examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml").read_text(
    encoding="utf-8"
)


def _page(
    *, page_type: str, title: str, body: str, status: bool = True, meta_id: str | None = None
) -> bytes:
    status_line = "status: stable\n" if status else ""
    return (
        "---\n"
        f"type: {page_type}\n"
        f"title: {title}\n"
        f"description: Knowledge about {title}.\n"
        f"meta_id: {meta_id or title.lower().replace(' ', '-')}\n"
        "tags: [test, view/perspective/topic/technology-data]\n"
        f"{status_line}"
        "sources:\n"
        "  - resource: viking://resources/source/document\n"
        "    title: Document\n"
        "    author: Author\n"
        "    kind: original\n"
        "    stage: documents\n"
        "  - resource: viking://resources/wiki/_mining/evidence-ledger.json\n"
        "    title: Evidence ledger\n"
        "    author: VikingBot\n"
        "    kind: intermediate\n"
        "    stage: mining\n"
        "generated:\n"
        "  by: llm-wiki/test-model\n"
        "  at: 2026-08-25T12:00:00+08:00\n"
        "knowledge_links: []\n"
        "---\n\n"
        f"# {title}\n\n{body}\n"
    ).encode()


def _unit_pages(*, topic: str, meta_id: str, what_name: str, what_page: bytes) -> dict[str, bytes]:
    """Return one complete meta-knowledge triplet with unambiguous filenames."""
    return {
        f"knowledge/what/products/{meta_id}/{what_name}.md": what_page,
        f"knowledge/why/compliance/{meta_id}/{meta_id}-rationale.md": _page(
            page_type="synthesis",
            title=f"{meta_id} rationale",
            body="Rationale.",
            meta_id=meta_id,
        ),
        f"knowledge/how/operations/pickup-delivery/{meta_id}/{meta_id}-procedure.md": _page(
            page_type="concept",
            title=f"{meta_id} procedure",
            body="Procedure.",
            meta_id=meta_id,
        ),
    }


def _artifacts(page_paths: list[str]) -> dict[str, bytes]:
    values = {
        "_mining/run-manifest.json": {
            "version": "1.0",
            "target": "viking://resources/wiki",
            "stage": "documents",
            "source_roots": ["viking://resources/source"],
        },
        "_mining/evidence-ledger.json": {
            "version": "1.0",
            "pages": [
                {
                    "path": path,
                    "source_resources": ["viking://resources/source/document"],
                    "intermediate_resources": [
                        "viking://resources/wiki/_mining/evidence-ledger.json"
                    ],
                    "claims": [],
                }
                for path in page_paths
            ],
        },
        "_mining/investigation-report.json": {
            "version": "1.0",
            "status": "clear",
            "conflicts": [],
            "evidence_gaps": [],
        },
        "_mining/questionnaire.json": {
            "version": "1.0",
            "status": "not_required",
            "questions": [],
        },
        "_mining/source-coverage.json": {
            "version": "1.0",
            "stage": "documents",
            "sources": [
                {
                    "resource": "viking://resources/source/document",
                    "status": "cited",
                    "inspected": True,
                    "page_paths": page_paths,
                    "evidence_resources": ["viking://resources/source/document"],
                }
            ],
            "summary": {
                "uploaded": 1,
                "inspected": 1,
                "cited": 1,
                "merged": 0,
                "skipped": 0,
            },
        },
        "_mining/candidate-knowledge.json": {
            "version": "1.0",
            "stage": "documents",
            "candidates": [
                {
                    "id": "candidate-1",
                    "title": "Candidate 1",
                    "kind": "concept",
                    "summary": "Candidate extracted from the document.",
                    "source_resources": ["viking://resources/source/document"],
                    "disposition": "promoted",
                    "meta_id": "candidate-1",
                    "page_paths": page_paths,
                    "stage": "documents",
                }
            ],
            "summary": {
                "total": 1,
                "promoted": 1,
                "merged": 0,
                "deferred": 0,
                "rejected": 0,
            },
        },
        "_mining/readlist.json": {
            "version": "1.0",
            "runs": [
                {
                    "task_id": "test",
                    "stage": "documents",
                    "recorded_at": "2026-08-25T12:00:00Z",
                    "source_units": [],
                    "read_paths": [],
                }
            ],
            "summary": {
                "runs": 1,
                "source_units": 0,
                "complete_source_units": 0,
                "required_reads": 0,
                "completed_required_reads": 0,
            },
        },
        "_mining/evidence-history.json": {
            "version": "1.0",
            "runs": [
                {
                    "task_id": "test",
                    "stage": "documents",
                    "recorded_at": "2026-08-25T12:00:00Z",
                    "pages": [],
                }
            ],
        },
    }
    return {path: json.dumps(value).encode() for path, value in values.items()}


def _source_unit(resource: str = "viking://resources/source/document") -> dict:
    return {
        "source_id": "src_1",
        "resource": resource,
        "title": "Document",
        "leaves": [
            {
                "uri": f"{resource}/content.md",
                "workspace_path": "compile_resources/src_1/document/content.md",
                "status": "materialized",
            }
        ],
    }


def test_default_okf_config_maps_paths_with_last_match_winning():
    config = parse_okf_config(DEFAULT_CONFIG)

    assert config.expected_type("knowledge/what/products/person/person.md") == "entity"
    assert config.expected_type("knowledge/how/technology/backend/build/build.md") == "concept"
    assert config.expected_type("knowledge/why/compliance/decision/decision.md") == "synthesis"
    assert config.expected_type("index.md") == "synthesis"
    assert [view.id for view in config.views] == ["perspective"]
    assert len(config.views[0].groups) == 32
    assert config.views[0].groups[0].tag == "view/perspective/topic/operations"
    assert [item.title for item in config.views[0].groups[0].path] == [
        "TOPIC",
        "operations",
    ]
    assert config.main_view is not None
    assert config.main_view.single_source_of_truth is True
    assert config.main_view.facet_categories == ("what", "why", "how")
    assert config.main_view.path_structure == ("facet", "route", "meta_id", "filename")
    assert config.main_view.directory_routes["what"] == (
        "products",
        "operations",
        "technology",
    )
    assert config.main_view.derived_views_include_exempt is False
    assert config.main_view.meta_knowledge is not None
    assert config.main_view.meta_knowledge.group_by == "frontmatter_field"
    assert config.main_view.meta_knowledge.id_field == "meta_id"
    assert config.main_view.meta_knowledge.require_id_directory is True
    assert all(view.selection == "exactly_one" for view in config.views)
    assert config.intermediates is not None
    assert config.cross_knowledge is not None
    assert config.cross_knowledge.context_field == "context"
    assert config.cross_knowledge.require_body_link is True


def test_configured_checkout_applies_defaults_and_literal_wikilinks():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = {
        **_unit_pages(
            topic="people",
            meta_id="alice",
            what_name="Alice",
            what_page=_page(
                page_type="entity",
                title="Alice",
                status=False,
                meta_id="alice",
                body=(
                    "## Bob heading\n\n"
                    "| Name | Value |\n| --- | --- |\n| Bob | one |\n\n"
                    "`Bob`\n\n```\nBob\n```\n\n"
                    "Bob works with Bob.\n\nBob appears again."
                ),
            ),
        ),
        **_unit_pages(
            topic="people",
            meta_id="bob",
            what_name="Bob",
            what_page=_page(
                page_type="entity",
                title="Bob",
                body="Alice is a collaborator.",
                meta_id="bob",
            ),
        ),
    }
    finalized = finalize_resource_checkout(
        {
            **_artifacts(list(pages)),
            **pages,
        },
        target_uri="viking://resources/wiki",
        source_roots={"src_1": "viking://resources/source"},
        okf_config=config,
        generated_metadata={"by": "llm-wiki/test", "at": "2026-08-25T09:00:00Z"},
    )

    alice = finalized.files["knowledge/what/products/alice/Alice.md"].decode()
    bob = finalized.files["knowledge/what/products/bob/Bob.md"].decode()
    assert "status: stable" in alice
    assert "by: llm-wiki/test" in alice
    assert "at: '2026-08-25T09:00:00Z'" in alice
    assert "## Bob heading" in alice
    assert "| Bob | one |" in alice
    assert "`Bob`" in alice
    assert "[[Bob]] works with Bob." in alice
    assert "[[Bob]] appears again." in alice
    assert "[[Alice]] is a collaborator." in bob
    assert finalized.link_count == 3
    assert finalized.investigation_status == "clear"
    assert finalized.question_count == 0
    assert len(finalized.intermediate_artifacts) == 8
    assert finalized.source_coverage == {
        "uploaded": 1,
        "inspected": 1,
        "cited": 1,
        "merged": 0,
        "skipped": 0,
        "artifact_uri": "viking://resources/wiki/_mining/source-coverage.json",
    }


def test_configured_checkout_rejects_wrong_path_type_and_unknown_wikilink():
    config = parse_okf_config(DEFAULT_CONFIG)
    with pytest.raises(ValueError, match='must use type "entity"'):
        finalize_resource_checkout(
            {
                **_artifacts(["knowledge/what/products/alice/Alice.md"]),
                "knowledge/what/products/alice/Alice.md": _page(
                    page_type="concept", title="Alice", body="Body."
                ),
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_declared_tags_for_every_view():
    config = parse_okf_config(DEFAULT_CONFIG)
    page = _page(page_type="entity", title="Alice", body="Body.").replace(
        b"view/perspective/topic/technology-data", b"ordinary-tag"
    )
    with pytest.raises(ValueError, match='at least one tag for view "perspective"'):
        finalize_resource_checkout(
            {
                **_artifacts(["knowledge/what/products/alice/Alice.md"]),
                "knowledge/what/products/alice/Alice.md": page,
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_rejects_model_invented_main_view_directory_routes():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/model-invented/alice/Alice.md"
    with pytest.raises(ValueError, match="configured directory route"):
        finalize_resource_checkout(
            {
                **_artifacts([path]),
                path: _page(page_type="entity", title="Alice", body="Body."),
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_uses_configured_facet_position_and_names():
    raw = yaml.safe_load(DEFAULT_CONFIG)
    raw["main_view"]["facet_categories"] = ["definition", "rationale", "procedure"]
    raw["main_view"]["directory_routes"] = {
        "definition": ["products"],
        "rationale": ["compliance"],
        "procedure": ["operations/pickup-delivery"],
    }
    raw["path_types"] = [
        {"pattern": "index.md", "type": "synthesis"},
        {"pattern": "knowledge/definition/**/*.md", "type": "entity"},
        {"pattern": "knowledge/rationale/**/*.md", "type": "synthesis"},
        {"pattern": "knowledge/procedure/**/*.md", "type": "concept"},
    ]
    config = parse_okf_config(yaml.safe_dump(raw, sort_keys=False))
    pages = {
        "knowledge/definition/products/alice/alice.md": _page(
            page_type="entity", title="Alice", body="Definition.", meta_id="alice"
        ),
        "knowledge/rationale/compliance/alice/alice-rationale.md": _page(
            page_type="synthesis", title="Alice rationale", body="Rationale.", meta_id="alice"
        ),
        "knowledge/procedure/operations/pickup-delivery/alice/alice-procedure.md": _page(
            page_type="concept", title="Alice procedure", body="Procedure.", meta_id="alice"
        ),
    }

    finalized = finalize_resource_checkout(
        {**_artifacts(list(pages)), **pages},
        target_uri="viking://resources/wiki",
        source_roots={"src_1": "viking://resources/source"},
        okf_config=config,
    )

    assert finalized.wiki_paths == set(pages)


def test_configured_checkout_rejects_undeclared_view_namespace():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    page = _page(page_type="entity", title="Alice", body="Body.").replace(
        b"tags: [test,", b"tags: [view/model-invented/group, test,"
    )

    with pytest.raises(ValueError, match="not declared by the effective OKF config"):
        finalize_resource_checkout(
            {**_artifacts([path]), path: page},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_complete_meta_knowledge_triplet():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    with pytest.raises(ValueError, match=r"Meta-knowledge unit .*missing how, why"):
        finalize_resource_checkout(
            {
                **_artifacts([path]),
                path: _page(
                    page_type="entity",
                    title="Alice",
                    body="Body.",
                    meta_id="alice",
                ),
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_meta_id_as_physical_directory():
    config = parse_okf_config(DEFAULT_CONFIG)
    valid_pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    pages = {
        path.replace("/alice/", "/wrong-directory/"): page for path, page in valid_pages.items()
    }
    with pytest.raises(ValueError, match="configured meta_id level"):
        finalize_resource_checkout(
            {**_artifacts(list(pages)), **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_source_coverage_rejects_missing_upload_level_source():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    with pytest.raises(ValueError, match="account for every upload-level source"):
        finalize_resource_checkout(
            {**_artifacts(list(pages)), **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[
                _source_unit(),
                _source_unit("viking://resources/source/second-document"),
            ],
            read_paths={"compile_resources/src_1/document/content.md"},
        )


def test_source_coverage_rejects_unread_materialized_source():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    with pytest.raises(ValueError, match="required readlist probes are missing"):
        finalize_resource_checkout(
            {**_artifacts(list(pages)), **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[_source_unit()],
            read_paths=set(),
        )


def test_source_coverage_requires_every_head_middle_tail_probe():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    unit = _source_unit()
    unit["leaves"] = [
        {
            "uri": f"viking://resources/source/document/page-{index}.md",
            "workspace_path": f"compile_resources/src_1/document/page-{index}.md",
            "status": "materialized",
        }
        for index in range(1, 6)
    ]
    unit["inspection_strategy"] = "head_middle_tail"
    unit["required_read_paths"] = [
        "compile_resources/src_1/document/page-1.md",
        "compile_resources/src_1/document/page-3.md",
        "compile_resources/src_1/document/page-5.md",
    ]
    with pytest.raises(ValueError, match=r"page-3\.md.*page-5\.md"):
        finalize_resource_checkout(
            {**_artifacts(list(pages)), **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[unit],
            read_paths={"compile_resources/src_1/document/page-1.md"},
        )


def test_source_coverage_rejects_unjustified_skip():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    coverage = json.loads(artifacts["_mining/source-coverage.json"])
    coverage["sources"][0] = {
        "resource": "viking://resources/source/document",
        "status": "skipped",
        "inspected": True,
    }
    coverage["summary"] = {
        "uploaded": 1,
        "inspected": 1,
        "cited": 0,
        "merged": 0,
        "skipped": 1,
    }
    artifacts["_mining/source-coverage.json"] = json.dumps(coverage).encode()
    with pytest.raises(ValueError, match="specific reason"):
        finalize_resource_checkout(
            {**artifacts, **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[_source_unit()],
            read_paths={"compile_resources/src_1/document/content.md"},
        )


def test_source_coverage_rejects_legacy_generic_skip_reason():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    coverage = json.loads(artifacts["_mining/source-coverage.json"])
    coverage["sources"][0] = {
        "resource": "viking://resources/source/document",
        "status": "skipped",
        "inspected": True,
        "reason": "Inspected completely but did not produce a distinct knowledge page.",
    }
    coverage["summary"] = {
        "uploaded": 1,
        "inspected": 1,
        "cited": 0,
        "merged": 0,
        "skipped": 1,
    }
    artifacts["_mining/source-coverage.json"] = json.dumps(coverage).encode()

    with pytest.raises(ValueError, match="uses a generic reason"):
        finalize_resource_checkout(
            {**artifacts, **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[_source_unit()],
            read_paths={"compile_resources/src_1/document/content.md"},
        )


def test_multi_document_batch_rejects_all_skipped_index_only_outcome():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    resources = [
        "viking://resources/source/document",
        "viking://resources/source/document-2",
    ]
    coverage = {
        "version": "1.0",
        "stage": "documents",
        "sources": [
            {
                "resource": resources[0],
                "status": "skipped",
                "inspected": True,
                "reason": "The file only contains empty table-layout fixtures without domain facts.",
            },
            {
                "resource": resources[1],
                "status": "skipped",
                "inspected": True,
                "reason": "The workbook contains random parser-test values with no defined semantics.",
            },
        ],
        "summary": {"uploaded": 2, "inspected": 2, "cited": 0, "merged": 0, "skipped": 2},
    }
    candidates = {
        "version": "1.0",
        "stage": "documents",
        "candidates": [
            {
                "id": f"rejected-{index}",
                "title": f"Rejected fixture {index}",
                "kind": "synthesis",
                "summary": "A source-specific low-information fixture decision.",
                "source_resources": [resource],
                "disposition": "rejected",
                "reason": coverage["sources"][index - 1]["reason"],
                "page_paths": [],
            }
            for index, resource in enumerate(resources, start=1)
        ],
        "summary": {"total": 2, "promoted": 0, "merged": 0, "deferred": 0, "rejected": 2},
    }
    artifacts["_mining/source-coverage.json"] = json.dumps(coverage).encode()
    artifacts["_mining/candidate-knowledge.json"] = json.dumps(candidates).encode()
    source_units = []
    read_paths = set()
    for index, resource in enumerate(resources, start=1):
        path = f"compile_resources/src_1/document-{index}/content.md"
        source_units.append(
            {
                "resource": resource,
                "required_read_paths": [path],
                "leaves": [{"workspace_path": path, "status": "materialized"}],
            }
        )
        read_paths.add(path)

    with pytest.raises(ValueError, match="must promote at least one"):
        finalize_resource_checkout(
            {**artifacts, **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=source_units,
            read_paths=read_paths,
        )


def test_candidate_knowledge_requires_every_upload_level_source():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    candidates = json.loads(artifacts["_mining/candidate-knowledge.json"])
    candidates["candidates"][0]["source_resources"] = ["viking://resources/source/other-document"]
    artifacts["_mining/candidate-knowledge.json"] = json.dumps(candidates).encode()

    with pytest.raises(ValueError, match="account for every upload-level source"):
        finalize_resource_checkout(
            {**artifacts, **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[_source_unit()],
            read_paths={"compile_resources/src_1/document/content.md"},
        )


def test_candidate_knowledge_requires_every_page_to_be_promoted():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    candidates = json.loads(artifacts["_mining/candidate-knowledge.json"])
    candidates["candidates"][0]["page_paths"] = [next(iter(pages))]
    artifacts["_mining/candidate-knowledge.json"] = json.dumps(candidates).encode()

    with pytest.raises(ValueError, match="Every non-index Wiki page"):
        finalize_resource_checkout(
            {**artifacts, **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
            source_units=[_source_unit()],
            read_paths={"compile_resources/src_1/document/content.md"},
        )


def test_configured_checkout_requires_shared_view_tags_within_meta_knowledge():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    why_path = "knowledge/why/compliance/alice/alice-rationale.md"
    pages[why_path] = pages[why_path].replace(
        b"view/perspective/topic/technology-data",
        b"view/perspective/synthesis/technology-data",
    )
    with pytest.raises(ValueError, match="identical tags"):
        finalize_resource_checkout(
            {**_artifacts(list(pages)), **pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_input_and_intermediate_lineage():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    page = _page(page_type="entity", title="Alice", body="Body.")
    missing_intermediate = page.replace(
        b"  - resource: viking://resources/wiki/_mining/evidence-ledger.json\n"
        b"    title: Evidence ledger\n"
        b"    author: VikingBot\n"
        b"    kind: intermediate\n"
        b"    stage: mining\n",
        b"",
    )
    with pytest.raises(ValueError, match="intermediate artifact source"):
        finalize_resource_checkout(
            {**_artifacts([path]), path: missing_intermediate},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_all_intermediate_artifacts():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    files = {
        **_artifacts([path]),
        path: _page(page_type="entity", title="Alice", body="Body."),
    }
    del files["_mining/questionnaire.json"]
    with pytest.raises(ValueError, match="intermediate artifact is missing"):
        finalize_resource_checkout(
            files,
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_run_manifest_error_names_the_exact_missing_source_root():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/page/page.md"
    files = {
        **_artifacts([path]),
        path: _page(page_type="entity", title="Page", body="Body."),
    }
    exact_source = "viking://resources/source/parent/answer.md"
    files = {
        name: payload.replace(b"viking://resources/source", exact_source.encode())
        for name, payload in files.items()
    }
    manifest = json.loads(files["_mining/run-manifest.json"])
    manifest["source_roots"] = ["viking://resources/source/parent"]
    files["_mining/run-manifest.json"] = json.dumps(manifest).encode()

    with pytest.raises(ValueError, match="answer\\.md"):
        finalize_resource_checkout(
            files,
            target_uri="viking://resources/wiki",
            source_roots={"src_1": exact_source},
            okf_config=config,
            generated_metadata={
                "by": "llm-wiki/test",
                "at": "2026-08-25T09:00:00Z",
            },
        )


def test_configured_checkout_requires_questionnaire_coverage_for_every_issue():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    artifacts = _artifacts([path])
    artifacts["_mining/investigation-report.json"] = json.dumps(
        {
            "version": "1.0",
            "status": "needs_human_input",
            "conflicts": [
                {
                    "id": "conflict-1",
                    "summary": "Two source dates disagree.",
                    "impact": "The launch date cannot be stated as settled fact.",
                    "source_resources": ["viking://resources/source/document"],
                }
            ],
            "evidence_gaps": [],
        }
    ).encode()
    artifacts["_mining/questionnaire.json"] = json.dumps(
        {"version": "1.0", "status": "open", "questions": []}
    ).encode()
    with pytest.raises(ValueError, match="covering every issue"):
        finalize_resource_checkout(
            {
                **artifacts,
                path: _page(page_type="entity", title="Alice", body="Body."),
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_preserves_answered_question_history_after_resolution():
    config = parse_okf_config(DEFAULT_CONFIG)
    pages = _unit_pages(
        topic="people",
        meta_id="alice",
        what_name="Alice",
        what_page=_page(page_type="entity", title="Alice", body="Body.", meta_id="alice"),
    )
    artifacts = _artifacts(list(pages))
    artifacts["_mining/questionnaire.json"] = json.dumps(
        {
            "version": "1.0",
            "status": "answered",
            "questions": [
                {
                    "id": "question-1",
                    "prompt": "Which launch date is authoritative?",
                    "reason": "The original sources disagreed.",
                    "kind": "free_text",
                    "options": [],
                    "related_issue_ids": ["resolved-conflict-1"],
                }
            ],
        }
    ).encode()
    finalized = finalize_resource_checkout(
        {
            **artifacts,
            **pages,
        },
        target_uri="viking://resources/wiki",
        source_roots={"src_1": "viking://resources/source"},
        okf_config=config,
    )
    assert finalized.investigation_status == "clear"
    assert finalized.question_count == 1


def test_configured_checkout_validates_cross_knowledge_links():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    page = _page(page_type="entity", title="Alice", body="Body.").replace(
        b"knowledge_links: []",
        b"knowledge_links:\n"
        b"  - resource: viking://resources/other/wiki/knowledge/what/products/bob/Bob.md\n"
        b"    title: Bob\n"
        b"    relation: contradicts\n"
        b"    direction: bidirectional",
    )
    with pytest.raises(ValueError, match="relation must be one of"):
        finalize_resource_checkout(
            {**_artifacts([path]), path: page},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_requires_contextual_body_link_for_every_cross_knowledge_relation():
    config = parse_okf_config(DEFAULT_CONFIG)
    path = "knowledge/what/products/alice/Alice.md"
    target = "viking://resources/other/wiki/knowledge/what/products/bob/Bob.md"
    contextual = _page(
        page_type="entity",
        title="Alice",
        meta_id="alice",
        body=f"## Collaboration\n\nAlice depends on [Bob]({target}) for review.",
    ).replace(
        b"knowledge_links: []",
        (
            "knowledge_links:\n"
            f"  - resource: {target}\n"
            "    title: Bob\n"
            "    relation: depends-on\n"
            "    direction: outgoing\n"
            "    context: Alice depends on\n"
        ).encode(),
    )

    pages = _unit_pages(topic="people", meta_id="alice", what_name="Alice", what_page=contextual)
    finalized = finalize_resource_checkout(
        {**_artifacts(list(pages)), **pages},
        target_uri="viking://resources/wiki",
        source_roots={"src_1": "viking://resources/source"},
        okf_config=config,
    )
    assert target.encode() in finalized.files[path]

    missing_body_link = contextual.replace(f"[Bob]({target})".encode(), b"Bob")
    with pytest.raises(ValueError, match="readable Markdown link"):
        missing_pages = {**pages, path: missing_body_link}
        finalize_resource_checkout(
            {**_artifacts(list(missing_pages)), **missing_pages},
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


def test_configured_checkout_rejects_unknown_namespaced_view_tag():
    config = parse_okf_config(DEFAULT_CONFIG)
    page = _page(page_type="entity", title="Alice", body="Body.").replace(
        b"view/perspective/topic/technology-data",
        b"view/perspective/topic/not-configured",
    )
    with pytest.raises(ValueError, match="not declared by the effective OKF config"):
        finalize_resource_checkout(
            {
                **_artifacts(["knowledge/what/products/alice/Alice.md"]),
                "knowledge/what/products/alice/Alice.md": page,
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )

    with pytest.raises(ValueError, match="must declare YAML frontmatter type"):
        finalize_resource_checkout(
            {
                **_artifacts(["knowledge/what/products/alice/Alice.md"]),
                "knowledge/what/products/alice/Alice.md": b"# Alice\n\nBody.",
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )

    with pytest.raises(ValueError, match=r"WikiLink \[\[Missing\]\]"):
        missing_link_pages = _unit_pages(
            topic="people",
            meta_id="alice",
            what_name="Alice",
            what_page=_page(
                page_type="entity",
                title="Alice",
                body="See [[Missing]].",
                meta_id="alice",
            ),
        )
        finalize_resource_checkout(
            {
                **_artifacts(list(missing_link_pages)),
                **missing_link_pages,
            },
            target_uri="viking://resources/wiki",
            source_roots={"src_1": "viking://resources/source"},
            okf_config=config,
        )


@pytest.mark.parametrize(
    "content, message",
    [
        ("version: 1\n", "frontmatter"),
        (
            "version: 1\nfrontmatter:\n  required: [type]\n"
            "  allowed_types: [entity]\npath_types:\n"
            "  - pattern: entities/**\n    type: synthesis\n",
            "must be one of",
        ),
    ],
)
def test_okf_config_rejects_invalid_contracts(content: str, message: str):
    with pytest.raises(ValueError, match=message):
        parse_okf_config(content)


@pytest.mark.parametrize(
    "path_structure, message",
    [
        (["facet", "meta_id"], "must end with filename"),
        (["meta_id", "filename"], "must contain facet"),
        (["facet", "topic", "meta_id", "filename"], "unsupported levels: topic"),
        (["facet", "meta_id", "meta_id", "filename"], "must not repeat levels"),
    ],
)
def test_okf_config_rejects_non_exact_main_view_structures(path_structure, message):
    raw = yaml.safe_load(DEFAULT_CONFIG)
    raw["main_view"]["path_structure"] = path_structure

    with pytest.raises(ValueError, match=message):
        parse_okf_config(yaml.safe_dump(raw, sort_keys=False))

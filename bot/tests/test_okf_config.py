from pathlib import Path

import pytest
import yaml
from vikingbot.compile.okf_config import parse_okf_config
from vikingbot.compile.renderer import finalize_resource_checkout

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = (
    ROOT / "examples/compile/ov-compile-skills/llm-wiki/OKF_CONFIG.yaml"
).read_text(encoding="utf-8")

MINIMAL_CONFIG = """
version: "2.0"
frontmatter:
  required: [type, title, description, sources, generated]
  allowed_types: [entity, concept, synthesis, index]
  sources:
    required_fields: [resource, title]
  generated:
    required_fields: [by, at]
    by_template: "{skill}/{model}"
main_view:
  root_path: knowledge
  path_structure: [page_role, business_domain, subdomain, subject_path, filename]
  page_roles:
    - id: topic
      title: TOPIC
      description: Explanatory knowledge.
    - id: reference
      title: REFERENCE
      description: Lookup knowledge.
  business_domains:
    - id: technology-data
      title: Technology and data
      description: Technical knowledge.
      subdomains:
        - id: engineering
          title: Engineering
          description: Software engineering.
  navigation:
    filename: index.md
    type: index
  exempt_paths: ["**/index.md"]
markdown_links:
  enabled: true
  auto_link: true
  catalog_only: true
  first_occurrence_per_paragraph: true
  exclude: [headings, tables, code]
"""


def _page(*, title: str = "Alice", page_type: str = "concept", body: str = "Body.") -> bytes:
    return (
        "---\n"
        f"type: {page_type}\n"
        f"title: {title}\n"
        f"description: Knowledge about {title}.\n"
        "sources:\n"
        "  - resource: viking://resources/source/document\n"
        "    title: Document\n"
        "generated:\n"
        "  by: llm-wiki/test-model\n"
        "  at: 2026-08-25T12:00:00+08:00\n"
        "---\n\n"
        f"# {title}\n\n{body}\n"
    ).encode()


def test_default_okf_config_uses_atomic_main_view_schema():
    config = parse_okf_config(DEFAULT_CONFIG)

    assert config.version == "2.0"
    assert config.main_view is not None
    assert config.main_view.root_path == "knowledge"
    assert config.main_view.path_structure == (
        "page_role",
        "business_domain",
        "subdomain",
        "subject_path",
        "filename",
    )
    assert [role.id for role in config.main_view.page_roles] == [
        "topic",
        "reference",
        "procedure",
        "synthesis",
    ]
    assert "technology-data" in {
        domain.id for domain in config.main_view.business_domains
    }
    assert config.main_view.navigation is not None
    assert config.main_view.navigation.filename == "index.md"
    assert config.main_view.is_exempt("knowledge/topic/technology-data/engineering/index.md")
    assert not hasattr(config.main_view, "facet_categories")
    assert not hasattr(config.main_view, "directory_routes")
    assert not hasattr(config.main_view, "meta_knowledge")


def test_default_skill_has_no_fixed_triplet_or_legacy_path_contract():
    skill = (
        ROOT / "examples/compile/ov-compile-skills/llm-wiki/SKILL.md"
    ).read_text(encoding="utf-8").casefold()

    assert "what/why/how" not in skill
    assert "knowledge/what/" not in skill
    assert "meta_knowledge" not in skill
    assert "facet_categories" not in skill
    assert "each promoted candidate becomes exactly one independent knowledge page" in skill


def test_atomic_page_follows_configured_main_view_and_receives_generated_metadata():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/platform/Alice.md"
    finalized = finalize_resource_checkout(
        {path: _page()},
        target_uri="viking://resources/wiki",
        source_roots={"source": "viking://resources/source"},
        okf_config=config,
        generated_metadata={"by": "llm-wiki/test", "at": "2026-09-09T00:00:00Z"},
    )

    content = finalized.files[path].decode()
    assert "status:" not in content
    assert "by: llm-wiki/test" in content
    assert finalized.wiki_paths == {path}


@pytest.mark.parametrize(
    ("path", "message"),
    [
        (
            "knowledge/unknown/technology-data/engineering/Alice.md",
            "configured page_role",
        ),
        (
            "knowledge/topic/unknown/engineering/Alice.md",
            "configured business_domain",
        ),
        (
            "knowledge/topic/technology-data/unknown/Alice.md",
            "configured subdomain",
        ),
        ("misc/Alice.md", "main-view root"),
    ],
)
def test_atomic_page_rejects_paths_outside_configured_taxonomy(path: str, message: str):
    config = parse_okf_config(MINIMAL_CONFIG)

    with pytest.raises(ValueError, match=message):
        finalize_resource_checkout(
            {path: _page()},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


def test_atomic_page_rejects_unknown_source_uri():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/Alice.md"
    page = _page().replace(
        b"viking://resources/source/document",
        b"viking://resources/not-supplied/document",
    )

    with pytest.raises(ValueError, match="reference a supplied source"):
        finalize_resource_checkout(
            {path: page},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


def test_atomic_page_rejects_missing_configured_source_metadata():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/Alice.md"
    page = _page().replace(b"    title: Document\n", b"")

    with pytest.raises(ValueError, match="is missing: title"):
        finalize_resource_checkout(
            {path: page},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


@pytest.mark.parametrize(
    "legacy_field",
    [
        "facet_categories",
        "leaf_categories",
        "directory_routes",
        "meta_knowledge",
        "single_source_of_truth",
        "derived_views_include_exempt",
    ],
)
def test_okf_config_rejects_removed_main_view_fields(legacy_field: str):
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["main_view"][legacy_field] = {}

    with pytest.raises(ValueError, match="contains removed fields"):
        parse_okf_config(yaml.safe_dump(raw))


def test_okf_config_rejects_removed_frontmatter_defaults():
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["frontmatter"]["defaults"] = {"status": "stable"}

    with pytest.raises(ValueError, match='"frontmatter.defaults" was removed'):
        parse_okf_config(yaml.safe_dump(raw))


def test_okf_config_rejects_removed_questionnaire_artifact():
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["intermediates"] = {
        "required": True,
        "root_path": "_mining",
        "questionnaire": "questionnaire.json",
    }

    with pytest.raises(ValueError, match='"intermediates.questionnaire" was removed'):
        parse_okf_config(yaml.safe_dump(raw))


def test_okf_config_rejects_removed_path_types_contract():
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["path_types"] = [{"pattern": "knowledge/**", "type": "concept"}]

    with pytest.raises(ValueError, match='field "path_types" was removed'):
        parse_okf_config(yaml.safe_dump(raw))


@pytest.mark.parametrize(
    ("path_structure", "message"),
    [
        (
            ["page_role", "business_domain", "subdomain", "filename", "subject_path"],
            "must end with filename",
        ),
        (
            ["page_role", "business_domain", "filename"],
            "missing required levels: subdomain",
        ),
        (
            ["page_role", "business_domain", "subdomain", "topic", "filename"],
            "unsupported levels: topic",
        ),
    ],
)
def test_okf_config_rejects_invalid_main_view_structures(path_structure, message):
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["main_view"]["path_structure"] = path_structure

    with pytest.raises(ValueError, match=message):
        parse_okf_config(yaml.safe_dump(raw))


def test_okf_config_rejects_removed_wikilinks_section():
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["wikilinks"] = raw.pop("markdown_links")

    with pytest.raises(ValueError, match='"wikilinks" was removed'):
        parse_okf_config(yaml.safe_dump(raw))


@pytest.mark.parametrize("field", ["views", "cross_knowledge"])
def test_okf_config_rejects_removed_top_level_sections(field: str):
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw[field] = [] if field == "views" else {}

    with pytest.raises(ValueError, match="removed top-level fields"):
        parse_okf_config(yaml.safe_dump(raw))


@pytest.mark.parametrize(
    "field", ["allowed_kinds", "require_input", "require_intermediate"]
)
def test_okf_config_rejects_removed_source_kind_fields(field: str):
    raw = yaml.safe_load(MINIMAL_CONFIG)
    raw["frontmatter"]["sources"][field] = [] if field == "allowed_kinds" else True

    with pytest.raises(ValueError, match="contains removed fields"):
        parse_okf_config(yaml.safe_dump(raw))


def test_navigation_glob_exempts_nested_index_pages():
    config = parse_okf_config(MINIMAL_CONFIG)
    assert config.main_view is not None
    assert config.main_view.is_exempt("knowledge/topic/technology-data/engineering/index.md")
    assert not config.main_view.is_exempt(
        "knowledge/topic/technology-data/engineering/guide.md"
    )
    assert config.main_view.is_exempt("knowledge/index.md")
    assert not config.main_view.is_exempt("misc/index.md")


def test_navigation_page_uses_configured_type():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/index.md"
    finalized = finalize_resource_checkout(
        {path: _page(title="Engineering", page_type="index")},
        target_uri="viking://resources/wiki",
        source_roots={"source": "viking://resources/source"},
        okf_config=config,
    )

    assert path in finalized.files
    assert path in finalized.wiki_paths


def test_navigation_page_rejects_non_navigation_type():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/index.md"

    with pytest.raises(ValueError, match='frontmatter type must be "index"'):
        finalize_resource_checkout(
            {path: _page(title="Engineering", page_type="concept")},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


def test_markdown_links_are_inserted_with_relative_targets():
    config = parse_okf_config(MINIMAL_CONFIG)
    alice = "knowledge/topic/technology-data/engineering/Alice.md"
    bob = "knowledge/topic/technology-data/engineering/Bob.md"
    finalized = finalize_resource_checkout(
        {
            alice: _page(title="Alice", body="See Bob for details."),
            bob: _page(title="Bob"),
        },
        target_uri="viking://resources/wiki",
        source_roots={"source": "viking://resources/source"},
        okf_config=config,
    )

    assert "[Bob](./Bob.md)" in finalized.files[alice].decode()
    assert "[[Bob]]" not in finalized.files[alice].decode()


def test_markdown_links_reject_removed_double_bracket_syntax():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/Alice.md"

    with pytest.raises(ValueError, match=r"removed \[\[WikiLink\]\] syntax"):
        finalize_resource_checkout(
            {path: _page(body="See [[Bob]].")},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


def test_markdown_links_reject_unknown_local_page_target():
    config = parse_okf_config(MINIMAL_CONFIG)
    path = "knowledge/topic/technology-data/engineering/Alice.md"

    with pytest.raises(ValueError, match="does not match an existing knowledge page"):
        finalize_resource_checkout(
            {path: _page(body="See [Missing](./Missing.md).")},
            target_uri="viking://resources/wiki",
            source_roots={"source": "viking://resources/source"},
            okf_config=config,
        )


def test_markdown_links_allow_explicit_paths_for_ambiguous_filenames():
    config = parse_okf_config(MINIMAL_CONFIG)
    alice = "knowledge/topic/technology-data/engineering/Alice.md"
    bob_a = "knowledge/topic/technology-data/engineering/a/Bob.md"
    bob_b = "knowledge/topic/technology-data/engineering/b/Bob.md"
    finalized = finalize_resource_checkout(
        {
            alice: _page(title="Alice", body="See [Bob A](a/Bob.md)."),
            bob_a: _page(title="Bob"),
            bob_b: _page(title="Bob"),
        },
        target_uri="viking://resources/wiki",
        source_roots={"source": "viking://resources/source"},
        okf_config=config,
    )

    assert "[Bob A](a/Bob.md)" in finalized.files[alice].decode()

from pathlib import Path

import pytest

from scripts.maintenance.migrate_okf_facet_layout import (
    Layout,
    MigrationError,
    apply_migration,
    load_layout,
    plan_migration,
)


def _legacy_wiki(root: Path) -> Path:
    wiki = root / "wiki"
    pages = {
        "knowledge/platform/search/what/search.md": "what",
        "knowledge/platform/search/why/search-rationale.md": "why",
        "knowledge/platform/search/how/search-operation.md": "how",
    }
    for relative, content in pages.items():
        path = wiki / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    (wiki / "index.md").write_text(
        "knowledge/platform/search/what/search.md\n",
        encoding="utf-8",
    )
    mining = wiki / "_mining" / "evidence-ledger.json"
    mining.parent.mkdir(parents=True)
    mining.write_text(
        '{"path":"knowledge/platform/search/why/search-rationale.md",'
        '"uri":"viking://resources/run/wiki/knowledge/platform/search/how/'
        'search-operation.md"}',
        encoding="utf-8",
    )
    return wiki


def test_migration_moves_facets_to_root_and_rewrites_references(tmp_path: Path):
    wiki = _legacy_wiki(tmp_path)
    moves = plan_migration(wiki, Layout("knowledge", ("what", "why", "how")))

    assert [move.new_relative for move in moves] == [
        "knowledge/what/platform/search",
        "knowledge/why/platform/search",
        "knowledge/how/platform/search",
    ]

    summary = apply_migration(wiki, moves)

    assert summary.moved_directories == 3
    assert summary.rewritten_files == 2
    assert (wiki / "knowledge/what/platform/search/search.md").read_text() == "what"
    assert (wiki / "knowledge/why/platform/search/search-rationale.md").read_text() == "why"
    assert (wiki / "knowledge/how/platform/search/search-operation.md").read_text() == "how"
    assert "knowledge/what/platform/search/search.md" in (wiki / "index.md").read_text()
    ledger = (wiki / "_mining/evidence-ledger.json").read_text()
    assert "knowledge/why/platform/search/search-rationale.md" in ledger
    assert "wiki/knowledge/how/platform/search/search-operation.md" in ledger
    assert not (wiki / "knowledge/platform/search/what").exists()
    assert plan_migration(wiki, Layout("knowledge", ("what", "why", "how"))) == []


def test_plan_refuses_to_merge_an_existing_target(tmp_path: Path):
    wiki = _legacy_wiki(tmp_path)
    target = wiki / "knowledge/what/platform/search"
    target.mkdir(parents=True)
    (target / "existing.md").write_text("keep", encoding="utf-8")

    with pytest.raises(MigrationError, match="refusing to merge"):
        plan_migration(wiki, Layout("knowledge", ("what", "why", "how")))


def test_topic_named_what_is_not_mistaken_for_a_legacy_facet(tmp_path: Path):
    wiki = tmp_path / "wiki"
    topic = wiki / "knowledge/what/topic"
    topic.mkdir(parents=True)
    (topic / "page.md").write_text("already migrated", encoding="utf-8")

    assert plan_migration(wiki, Layout("knowledge", ("what", "why", "how"))) == []


def test_load_layout_uses_the_okf_main_view_configuration(tmp_path: Path):
    config = tmp_path / "OKF_CONFIG.yaml"
    config.write_text(
        """
main_view:
  root_path: docs/knowledge
  leaf_categories:
    - what
    - why
    - how
""".lstrip(),
        encoding="utf-8",
    )

    assert load_layout(config) == Layout(
        root_path="docs/knowledge",
        facets=("what", "why", "how"),
    )

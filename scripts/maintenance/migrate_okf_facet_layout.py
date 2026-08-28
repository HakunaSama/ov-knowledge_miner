#!/usr/bin/env python3
"""Move legacy OKF facet leaves into the exact configured main-view hierarchy.

Legacy layout::

    knowledge/<view path>/<meta_id>/<facet>/<page.md>

Strict configured layout::

    knowledge/<facet>/<meta_id>/<page.md>

The command is a dry run unless ``--apply`` is passed. In addition to moving
facet directories, it rewrites textual path references in Markdown, JSON,
YAML, and text artifacts below the Wiki root.
"""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import sys
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable, Sequence

import yaml

DEFAULT_FACETS = ("what", "why", "how")
DEFAULT_ROOT_PATH = "knowledge"
DEFAULT_PATH_STRUCTURE = ("facet", "meta_id", "filename")
TEXT_SUFFIXES = {".json", ".md", ".txt", ".yaml", ".yml"}


@dataclass(frozen=True, slots=True)
class Layout:
    root_path: str
    facets: tuple[str, ...]
    path_structure: tuple[str, ...] = DEFAULT_PATH_STRUCTURE


@dataclass(frozen=True, slots=True)
class PlannedMove:
    source: Path
    destination: Path
    old_relative: str
    new_relative: str


@dataclass(frozen=True, slots=True)
class MigrationSummary:
    moved_directories: int
    rewritten_files: int


class MigrationError(RuntimeError):
    """Raised when migration cannot be completed without risking data loss."""


def _safe_relative_path(value: object, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MigrationError(f"{field} must be a non-empty relative path")
    path = PurePosixPath(value.strip())
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise MigrationError(f"{field} must be a safe relative path: {value!r}")
    return path.as_posix()


def load_layout(config_path: Path | None) -> Layout:
    """Load main-view root and facet names from an OKF YAML config."""
    if config_path is None:
        return Layout(DEFAULT_ROOT_PATH, DEFAULT_FACETS, DEFAULT_PATH_STRUCTURE)
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise MigrationError(f"cannot read OKF config {config_path}: {exc}") from exc
    if not isinstance(raw, dict) or not isinstance(raw.get("main_view"), dict):
        raise MigrationError("OKF config must contain a main_view object")
    main_view = raw["main_view"]
    root_path = _safe_relative_path(
        main_view.get("root_path", DEFAULT_ROOT_PATH),
        field="main_view.root_path",
    )
    raw_facets = main_view.get(
        "facet_categories",
        main_view.get("leaf_categories", DEFAULT_FACETS),
    )
    if (
        not isinstance(raw_facets, list)
        or not raw_facets
        or any(not isinstance(item, str) or not item.strip() for item in raw_facets)
    ):
        raise MigrationError("main_view.facet_categories must be a non-empty string list")
    facets = tuple(dict.fromkeys(item.strip() for item in raw_facets))
    if any("/" in facet or facet in {".", ".."} for facet in facets):
        raise MigrationError("main_view.facet_categories must contain safe directory names")
    raw_structure = main_view.get("path_structure", list(DEFAULT_PATH_STRUCTURE))
    if not isinstance(raw_structure, list) or tuple(raw_structure) not in {
        ("facet", "meta_id", "filename"),
        ("meta_id", "facet", "filename"),
    }:
        raise MigrationError(
            "migration supports path_structure facet/meta_id/filename or meta_id/facet/filename"
        )
    return Layout(root_path, facets, tuple(raw_structure))


def _contains_direct_page(directory: Path) -> bool:
    return any(
        child.is_file()
        and not child.is_symlink()
        and child.suffix.lower() == ".md"
        and not child.name.startswith(".")
        for child in directory.iterdir()
    )


def plan_migration(wiki_root: Path, layout: Layout) -> list[PlannedMove]:
    """Return a complete, collision-checked migration plan."""
    wiki_root = wiki_root.resolve()
    knowledge_root = wiki_root.joinpath(*PurePosixPath(layout.root_path).parts)
    if not wiki_root.is_dir():
        raise MigrationError(f"Wiki root is not a directory: {wiki_root}")
    if not knowledge_root.is_dir():
        raise MigrationError(
            f"configured main-view root does not exist below the Wiki root: {layout.root_path}"
        )

    facet_order = {facet: index for index, facet in enumerate(layout.facets)}
    candidates: list[Path] = []
    for directory in knowledge_root.rglob("*"):
        if not directory.is_dir() or directory.is_symlink() or directory.name not in facet_order:
            continue
        relative = directory.relative_to(knowledge_root)
        # knowledge/<facet>/... is already facet-first.
        if len(relative.parts) < 2 or relative.parts[0] in facet_order:
            continue
        # A legacy facet is the immediate parent of at least one Wiki page.
        # This avoids treating an ordinary topic directory named "what" as a facet.
        if _contains_direct_page(directory):
            candidates.append(directory)

    moves: list[PlannedMove] = []
    for source in sorted(
        candidates,
        key=lambda item: (
            facet_order[item.name],
            item.relative_to(knowledge_root).as_posix(),
        ),
    ):
        relative = source.relative_to(knowledge_root)
        meta_id = relative.parts[-2]
        directory_levels = {
            "facet": source.name,
            "meta_id": meta_id,
        }
        destination = knowledge_root.joinpath(
            *(directory_levels[level] for level in layout.path_structure[:-1])
        )
        if destination.exists():
            raise MigrationError(
                "target already exists; refusing to merge directories: "
                f"{destination.relative_to(wiki_root).as_posix()}"
            )
        moves.append(
            PlannedMove(
                source=source,
                destination=destination,
                old_relative=source.relative_to(wiki_root).as_posix(),
                new_relative=destination.relative_to(wiki_root).as_posix(),
            )
        )
    return moves


def _text_updates(
    wiki_root: Path,
    replacements: Sequence[tuple[str, str]],
) -> list[tuple[Path, bytes, bytes, int]]:
    updates: list[tuple[Path, bytes, bytes, int]] = []
    ordered = sorted(replacements, key=lambda item: len(item[0]), reverse=True)
    for path in wiki_root.rglob("*"):
        if not path.is_file() or path.is_symlink() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        original = path.read_bytes()
        try:
            text = original.decode("utf-8")
        except UnicodeDecodeError:
            continue
        rewritten = text
        for old, new in ordered:
            rewritten = rewritten.replace(old, new)
        if rewritten == text:
            continue
        updates.append(
            (
                path,
                original,
                rewritten.encode("utf-8"),
                stat.S_IMODE(path.stat().st_mode),
            )
        )
    return updates


def _atomic_write(path: Path, content: bytes, mode: int) -> None:
    temporary = path.with_name(f".{path.name}.okf-migrate-{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_bytes(content)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _remove_empty_legacy_directories(wiki_root: Path, moves: Iterable[PlannedMove]) -> None:
    parents = {
        parent
        for move in moves
        for parent in move.source.parents
        if parent != wiki_root and wiki_root in parent.parents
    }
    for directory in sorted(parents, key=lambda item: len(item.parts), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass


def apply_migration(wiki_root: Path, moves: Sequence[PlannedMove]) -> MigrationSummary:
    """Apply a plan transactionally and rewrite references to moved paths."""
    wiki_root = wiki_root.resolve()
    if not moves:
        return MigrationSummary(moved_directories=0, rewritten_files=0)

    staging_root = Path(tempfile.mkdtemp(prefix=".okf-facet-migration-", dir=wiki_root.parent))
    staged: list[tuple[PlannedMove, Path]] = []
    installed: list[PlannedMove] = []
    rewritten: list[tuple[Path, bytes, bytes, int]] = []
    try:
        for index, move in enumerate(moves):
            staged_path = staging_root / str(index)
            shutil.move(str(move.source), str(staged_path))
            staged.append((move, staged_path))

        for move, staged_path in staged:
            move.destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged_path), str(move.destination))
            installed.append(move)

        rewritten = _text_updates(
            wiki_root,
            [(move.old_relative, move.new_relative) for move in moves],
        )
        for path, _original, updated, mode in rewritten:
            _atomic_write(path, updated, mode)
    except Exception:
        for path, original, _updated, mode in reversed(rewritten):
            if path.exists():
                _atomic_write(path, original, mode)
        for move in reversed(installed):
            if move.destination.exists():
                move.source.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(move.destination), str(move.source))
        for move, staged_path in reversed(staged):
            if staged_path.exists():
                move.source.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(staged_path), str(move.source))
        raise
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)

    _remove_empty_legacy_directories(wiki_root, moves)
    return MigrationSummary(
        moved_directories=len(moves),
        rewritten_files=len(rewritten),
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Move an existing OKF Wiki from view-first facet leaves to its exact "
            "configured main-view path_structure."
        )
    )
    parser.add_argument("wiki_root", type=Path, help="local path to the mined Wiki root")
    parser.add_argument(
        "--okf-config",
        type=Path,
        help="OKF_CONFIG.yaml used by the result (defaults to knowledge + what/why/how)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="perform the migration; without this flag the command only prints the plan",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        layout = load_layout(args.okf_config)
        moves = plan_migration(args.wiki_root, layout)
        mode = "APPLY" if args.apply else "DRY-RUN"
        print(f"[{mode}] Wiki root: {args.wiki_root.resolve()}")
        print(f"Main-view root: {layout.root_path}")
        print(f"Facet order: {', '.join(layout.facets)}")
        print(f"Path structure: {' / '.join(layout.path_structure)}")
        for move in moves:
            print(f"MOVE {move.old_relative} -> {move.new_relative}")
        if not moves:
            print("No legacy facet directories found; nothing to migrate.")
            return 0
        if not args.apply:
            print(f"Planned {len(moves)} directory moves. Re-run with --apply to execute.")
            return 0
        summary = apply_migration(args.wiki_root, moves)
        print(
            f"Migrated {summary.moved_directories} facet directories and rewrote "
            f"references in {summary.rewritten_files} files."
        )
        return 0
    except (MigrationError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

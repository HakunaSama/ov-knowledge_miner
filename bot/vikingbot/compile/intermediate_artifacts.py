"""Deterministic persistence and incremental merging for Compile audit artifacts."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from hashlib import sha256
from typing import Any

import yaml

from openviking.core.namespace import relative_uri_path
from openviking.utils.path_safety import safe_join_viking_uri
from vikingbot.compile.okf_config import OKFConfig

_FRONTMATTER_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.DOTALL)
_RESERVED_MARKDOWN = frozenset({".abstract.md", ".overview.md"})


def _load(files: Mapping[str, bytes], path: str) -> dict[str, Any]:
    payload = files.get(path)
    if payload is None:
        return {}
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return dict(value) if isinstance(value, Mapping) else {}


def _dump(value: Mapping[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return list(
        dict.fromkeys(item.strip() for item in value if isinstance(item, str) and item.strip())
    )


def _is_within(root: str, resource: str) -> bool:
    normalized_root = root.rstrip("/")
    normalized_resource = resource.rstrip("/")
    if normalized_resource == normalized_root:
        return True
    try:
        return bool(relative_uri_path(normalized_root, normalized_resource))
    except ValueError:
        return False


def _page_metadata(
    files: Mapping[str, bytes], config: OKFConfig
) -> dict[str, dict[str, Any]]:
    """Extract the small amount of page metadata needed by platform-owned ledgers."""
    exempt = set(config.main_view.exempt_paths) if config.main_view is not None else set()
    root = config.main_view.root_path if config.main_view is not None else ""
    pages: dict[str, dict[str, Any]] = {}
    for path, payload in files.items():
        if (
            not path.casefold().endswith(".md")
            or path.rsplit("/", 1)[-1].casefold() in _RESERVED_MARKDOWN
            or (root and path not in exempt and not path.startswith(f"{root}/"))
        ):
            continue
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            continue
        match = _FRONTMATTER_RE.match(text)
        if match is None:
            continue
        try:
            frontmatter = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            continue
        if not isinstance(frontmatter, Mapping) or frontmatter.get("type") not in {
            "entity",
            "concept",
            "synthesis",
        }:
            continue
        source_resources: list[str] = []
        for source in frontmatter.get("sources") or []:
            if not isinstance(source, Mapping) or source.get("kind") == "intermediate":
                continue
            resource = source.get("resource")
            if isinstance(resource, str) and resource.strip().startswith("viking://"):
                source_resources.append(resource.strip().rstrip("/"))
        pages[path] = {
            "type": str(frontmatter.get("type") or "synthesis"),
            "title": str(frontmatter.get("title") or path.rsplit("/", 1)[-1]),
            "description": str(frontmatter.get("description") or "").strip(),
            "meta_id": str(frontmatter.get("meta_id") or "").strip(),
            "source_resources": list(dict.fromkeys(source_resources)),
        }
    return pages


def _artifact_paths(config: OKFConfig) -> dict[str, str]:
    intermediate = config.intermediates
    if intermediate is None:
        return {}
    root = intermediate.root_path
    return {
        "run_manifest": f"{root}/{intermediate.run_manifest}",
        "evidence_ledger": f"{root}/{intermediate.evidence_ledger}",
        "source_coverage": f"{root}/{intermediate.source_coverage}",
        "candidate_knowledge": f"{root}/{intermediate.candidate_knowledge}",
        "readlist": f"{root}/{intermediate.readlist}",
        "evidence_history": f"{root}/{intermediate.evidence_history}",
    }


def _merge_evidence_ledger(
    baseline: Mapping[str, Any],
    current: Mapping[str, Any],
    *,
    pages: Mapping[str, Mapping[str, Any]] | None = None,
    evidence_uri: str | None = None,
) -> dict[str, Any]:
    by_path: dict[str, dict[str, Any]] = {}
    for source in (baseline, current):
        raw_pages = source.get("pages")
        if not isinstance(raw_pages, list):
            continue
        for raw in raw_pages:
            if not isinstance(raw, Mapping) or not isinstance(raw.get("path"), str):
                continue
            entry = dict(raw)
            path = str(entry["path"]).strip("/")
            previous = by_path.get(path, {})
            entry["path"] = path
            entry["source_resources"] = _strings(
                [
                    *_strings(previous.get("source_resources")),
                    *_strings(entry.get("source_resources")),
                ]
            )
            entry["intermediate_resources"] = _strings(
                [
                    *_strings(previous.get("intermediate_resources")),
                    *_strings(entry.get("intermediate_resources")),
                ]
            )
            if "claims" not in entry and "claims" in previous:
                entry["claims"] = previous["claims"]
            by_path[path] = entry
    if pages is not None:
        by_path = {path: by_path.get(path, {"path": path}) for path in pages}
        for path, metadata in pages.items():
            entry = by_path[path]
            entry["path"] = path
            entry["source_resources"] = _strings(
                [
                    *_strings(entry.get("source_resources")),
                    *_strings(metadata.get("source_resources")),
                ]
            )
            entry["intermediate_resources"] = _strings(
                [
                    *_strings(entry.get("intermediate_resources")),
                    *([evidence_uri] if evidence_uri else []),
                ]
            )
            if not isinstance(entry.get("claims"), list):
                entry["claims"] = []
    return {"version": "1.0", "pages": [by_path[path] for path in sorted(by_path)]}


def _merge_source_coverage(
    baseline: Mapping[str, Any],
    current: Mapping[str, Any],
    *,
    stage: str,
    source_units: list[dict[str, Any]] | None = None,
    ledger: Mapping[str, Any] | None = None,
    source_roots: list[str] | None = None,
) -> dict[str, Any]:
    by_resource: dict[str, dict[str, Any]] = {}
    for source in (baseline, current):
        entries = source.get("sources")
        if not isinstance(entries, list):
            continue
        for raw in entries:
            if not isinstance(raw, Mapping) or not isinstance(raw.get("resource"), str):
                continue
            entry = dict(raw)
            resource = str(entry["resource"]).strip().rstrip("/")
            if resource:
                entry["resource"] = resource
                by_resource[resource] = entry
    if source_units is not None:
        for unit in source_units:
            resource = str(unit.get("resource") or "").strip().rstrip("/")
            if not resource:
                continue
            by_resource.setdefault(
                resource,
                {
                    "resource": resource,
                    "inspected": True,
                    "status": "skipped",
                    "reason": "Inspected completely but did not produce a distinct knowledge page.",
                },
            )
    if ledger is not None:
        ledger_pages = ledger.get("pages")
        known_roots = sorted(
            {
                root.strip().rstrip("/")
                for root in (source_roots or [])
                if isinstance(root, str) and root.strip().startswith("viking://")
            },
            key=len,
            reverse=True,
        )
        # Recover coverage entries from the canonical page ledger when an older
        # incremental run already overwrote source-coverage.json. Prefer the
        # supplied upload/source root over a parser fragment URI.
        for page in ledger_pages if isinstance(ledger_pages, list) else []:
            if not isinstance(page, Mapping):
                continue
            for evidence_resource in _strings(page.get("source_resources")):
                matching_root = next(
                    (root for root in known_roots if _is_within(root, evidence_resource)),
                    evidence_resource.rstrip("/"),
                )
                if matching_root not in by_resource:
                    by_resource[matching_root] = {
                        "resource": matching_root,
                        "inspected": True,
                        "status": "skipped",
                        "reason": (
                            "Recovered from retained page provenance; no current page match."
                        ),
                    }
        for resource, entry in by_resource.items():
            matching_pages: list[str] = []
            matching_evidence: list[str] = []
            for page in ledger_pages if isinstance(ledger_pages, list) else []:
                if not isinstance(page, Mapping) or not isinstance(page.get("path"), str):
                    continue
                evidence = [
                    candidate
                    for candidate in _strings(page.get("source_resources"))
                    if _is_within(resource, candidate)
                ]
                if evidence:
                    matching_pages.append(str(page["path"]).strip("/"))
                    matching_evidence.extend(evidence)
            entry["inspected"] = True
            if matching_pages:
                entry["status"] = "cited"
                entry.pop("reason", None)
                entry.pop("merged_into", None)
                entry["page_paths"] = sorted(set(matching_pages))
                entry["evidence_resources"] = list(dict.fromkeys(matching_evidence))
            elif entry.get("status") not in {"merged", "skipped"}:
                entry["status"] = "skipped"
                entry["reason"] = (
                    "Inspected completely but did not produce a distinct knowledge page."
                )
    dispositions = ("cited", "merged", "skipped")
    counts = {"uploaded": len(by_resource), "inspected": 0, **dict.fromkeys(dispositions, 0)}
    for entry in by_resource.values():
        if entry.get("inspected") is True:
            counts["inspected"] += 1
        status = entry.get("status")
        if status in dispositions:
            counts[str(status)] += 1
    return {
        "version": "1.0",
        "stage": stage,
        "sources": [by_resource[key] for key in sorted(by_resource)],
        "summary": counts,
    }


def _merge_candidates(
    baseline: Mapping[str, Any],
    current: Mapping[str, Any],
    *,
    stage: str,
    pages: Mapping[str, Mapping[str, Any]] | None = None,
    source_units: list[dict[str, Any]] | None = None,
    exempt_paths: set[str] | None = None,
) -> dict[str, Any]:
    by_id: dict[str, dict[str, Any]] = {}
    for source in (baseline, current):
        candidates = source.get("candidates")
        if not isinstance(candidates, list):
            continue
        for raw in candidates:
            if not isinstance(raw, Mapping) or not isinstance(raw.get("id"), str):
                continue
            entry = dict(raw)
            candidate_id = str(entry["id"]).strip()
            if candidate_id:
                entry["id"] = candidate_id
                entry.setdefault("stage", stage)
                by_id[candidate_id] = entry
    if pages is not None:
        exempt = exempt_paths or set()
        knowledge_pages = {path: value for path, value in pages.items() if path not in exempt}
        grouped: dict[str, list[str]] = {}
        for path, metadata in knowledge_pages.items():
            meta_id = str(metadata.get("meta_id") or "").strip()
            if meta_id:
                grouped.setdefault(meta_id, []).append(path)

        candidate_for_meta: dict[str, str] = {}
        for candidate_id, entry in by_id.items():
            meta_id = str(entry.get("meta_id") or "").strip()
            if meta_id:
                candidate_for_meta[meta_id] = candidate_id

        for meta_id, page_paths in grouped.items():
            candidate_id = candidate_for_meta.get(meta_id, meta_id)
            metadata = knowledge_pages[sorted(page_paths)[0]]
            entry = by_id.get(candidate_id, {"id": candidate_id})
            page_sources = list(
                dict.fromkeys(
                    source
                    for path in page_paths
                    for source in _strings(knowledge_pages[path].get("source_resources"))
                )
            )
            entry.update(
                {
                    "id": candidate_id,
                    "title": str(entry.get("title") or metadata.get("title") or meta_id),
                    "kind": (
                        entry.get("kind")
                        if entry.get("kind") in {"entity", "concept", "synthesis"}
                        else metadata.get("type", "synthesis")
                    ),
                    "summary": str(
                        entry.get("summary")
                        or metadata.get("description")
                        or f"Knowledge candidate {meta_id}."
                    ),
                    "source_resources": _strings(
                        [*_strings(entry.get("source_resources")), *page_sources]
                    ),
                    "disposition": "promoted",
                    "meta_id": meta_id,
                    "page_paths": sorted(page_paths),
                }
            )
            entry.setdefault("stage", stage)
            entry.pop("reason", None)
            entry.pop("merged_into", None)
            by_id[candidate_id] = entry

        valid_pages = set(knowledge_pages)
        for candidate_id in list(by_id):
            entry = by_id[candidate_id]
            entry["page_paths"] = [
                path for path in _strings(entry.get("page_paths")) if path in valid_pages
            ]
            if entry.get("disposition") == "promoted" and not entry["page_paths"]:
                del by_id[candidate_id]

    if source_units is not None:
        covered_sources = {
            source
            for entry in by_id.values()
            for source in _strings(entry.get("source_resources"))
        }
        for unit in source_units:
            resource = str(unit.get("resource") or "").strip().rstrip("/")
            if not resource or any(_is_within(resource, source) for source in covered_sources):
                continue
            digest = sha256(resource.encode("utf-8")).hexdigest()[:12]
            candidate_id = f"source-without-candidate-{digest}"
            by_id[candidate_id] = {
                "id": candidate_id,
                "title": str(unit.get("title") or resource.rsplit("/", 1)[-1]),
                "kind": "synthesis",
                "summary": "The source was inspected but did not support a distinct knowledge unit.",
                "source_resources": [resource],
                "disposition": "rejected",
                "reason": "No sufficiently supported distinct knowledge unit was found.",
                "page_paths": [],
                "stage": stage,
            }

    for candidate_id, entry in by_id.items():
        entry["id"] = candidate_id
        entry["title"] = str(entry.get("title") or candidate_id)
        entry["summary"] = str(
            entry.get("summary") or "The candidate was recorded during knowledge mining."
        )
        if entry.get("kind") not in {"entity", "concept", "synthesis"}:
            entry["kind"] = "synthesis"
        entry["source_resources"] = _strings(entry.get("source_resources"))
        entry["page_paths"] = _strings(entry.get("page_paths"))
        entry.setdefault("stage", stage)
        disposition = entry.get("disposition")
        if disposition not in {"promoted", "merged", "deferred", "rejected"}:
            entry["disposition"] = "rejected"
            disposition = "rejected"
            entry.setdefault("reason", "The candidate disposition was invalid.")
        if disposition == "merged":
            target = by_id.get(str(entry.get("merged_into") or ""))
            if target is None or target.get("disposition") != "promoted":
                entry["disposition"] = "rejected"
                entry.pop("merged_into", None)
                entry.setdefault("reason", "The merge target is unavailable in this checkout.")
        elif disposition in {"deferred", "rejected"}:
            entry.setdefault("reason", "The candidate was not promoted in this run.")
    dispositions = ("promoted", "merged", "deferred", "rejected")
    counts = {"total": len(by_id), **dict.fromkeys(dispositions, 0)}
    for entry in by_id.values():
        disposition = entry.get("disposition")
        if disposition in dispositions:
            counts[str(disposition)] += 1
    return {
        "version": "1.0",
        "stage": stage,
        "candidates": [by_id[key] for key in sorted(by_id)],
        "summary": counts,
    }


def _readlist_run(
    *,
    task_id: str,
    stage: str,
    recorded_at: str,
    source_units: list[dict[str, Any]],
    read_paths: set[str],
) -> dict[str, Any]:
    units: list[dict[str, Any]] = []
    for raw in source_units:
        leaves = raw.get("leaves") if isinstance(raw, Mapping) else []
        materialized = [
            str(leaf.get("workspace_path") or "")
            for leaf in leaves or []
            if isinstance(leaf, Mapping)
            and leaf.get("status") == "materialized"
            and str(leaf.get("workspace_path") or "")
        ]
        required = _strings(raw.get("required_read_paths"))
        observed = sorted(set(materialized) & read_paths)
        missing = sorted(set(required) - read_paths)
        units.append(
            {
                "resource": str(raw.get("resource") or "").rstrip("/"),
                "title": str(raw.get("title") or ""),
                "inspection_strategy": str(raw.get("inspection_strategy") or "all"),
                "materialized_paths": sorted(materialized),
                "required_read_paths": required,
                "read_paths": observed,
                "missing_required_read_paths": missing,
                "complete": not missing,
            }
        )
    return {
        "task_id": task_id,
        "generated_by": "compile",
        "stage": stage,
        "recorded_at": recorded_at,
        "source_units": units,
        "read_paths": sorted(read_paths),
    }


def _merge_readlist(baseline: Mapping[str, Any], current_run: Mapping[str, Any]) -> dict[str, Any]:
    runs_by_id: dict[str, dict[str, Any]] = {}
    prior = baseline.get("runs")
    if isinstance(prior, list):
        for raw in prior:
            if isinstance(raw, Mapping) and isinstance(raw.get("task_id"), str):
                runs_by_id[str(raw["task_id"])] = dict(raw)
    runs_by_id[str(current_run["task_id"])] = dict(current_run)
    runs = list(runs_by_id.values())[-100:]
    units = [
        unit
        for run in runs
        for unit in (run.get("source_units") or [])
        if isinstance(unit, Mapping)
    ]
    return {
        "version": "1.0",
        "runs": runs,
        "summary": {
            "runs": len(runs),
            "source_units": len(units),
            "complete_source_units": sum(unit.get("complete") is True for unit in units),
            "required_reads": sum(len(unit.get("required_read_paths") or []) for unit in units),
            "completed_required_reads": sum(
                len(unit.get("required_read_paths") or [])
                - len(unit.get("missing_required_read_paths") or [])
                for unit in units
            ),
        },
    }


def prepare_persistent_intermediates(
    checkout: Mapping[str, bytes],
    *,
    baseline: Mapping[str, bytes],
    config: OKFConfig,
    task_id: str,
    recorded_at: str,
    source_units: list[dict[str, Any]],
    read_paths: set[str],
    target_uri: str | None = None,
    source_roots: Mapping[str, str] | None = None,
) -> dict[str, bytes]:
    """Merge model-authored artifacts and inject immutable platform audit trails."""
    paths = _artifact_paths(config)
    if not paths:
        return dict(checkout)
    result = dict(checkout)
    manifest = _load(result, paths["run_manifest"])
    stage = str(manifest.get("stage") or "documents")
    if stage not in {"documents", "memory_incremental", "human_incremental"}:
        stage = "documents"
    manifest.update(
        {
            "version": "1.0",
            "stage": stage,
            **({"target": target_uri.rstrip("/")} if target_uri else {}),
        }
    )
    if source_roots is not None:
        manifest["source_roots"] = sorted(
            {
                value.rstrip("/")
                for value in source_roots.values()
                if value and (not target_uri or not value.startswith(f"{target_uri.rstrip('/')}/"))
            }
        )
    result[paths["run_manifest"]] = _dump(manifest)
    pages = _page_metadata(result, config)
    canonical_pages = pages or None
    evidence_uri = (
        safe_join_viking_uri(target_uri.rstrip("/"), paths["evidence_ledger"]).rstrip("/")
        if target_uri
        else None
    )

    ledger = _merge_evidence_ledger(
        _load(baseline, paths["evidence_ledger"]),
        _load(result, paths["evidence_ledger"]),
        pages=canonical_pages,
        evidence_uri=evidence_uri,
    )
    result[paths["evidence_ledger"]] = _dump(ledger)

    coverage = _merge_source_coverage(
        _load(baseline, paths["source_coverage"]),
        _load(result, paths["source_coverage"]),
        stage=stage,
        source_units=source_units,
        ledger=ledger,
        source_roots=(list(source_roots.values()) if source_roots is not None else None),
    )
    result[paths["source_coverage"]] = _dump(coverage)

    candidates = _merge_candidates(
        _load(baseline, paths["candidate_knowledge"]),
        _load(result, paths["candidate_knowledge"]),
        stage=stage,
        pages=canonical_pages,
        source_units=source_units,
        exempt_paths=(set(config.main_view.exempt_paths) if config.main_view is not None else set()),
    )
    result[paths["candidate_knowledge"]] = _dump(candidates)

    current_run = _readlist_run(
        task_id=task_id,
        stage=stage,
        recorded_at=recorded_at,
        source_units=source_units,
        read_paths=read_paths,
    )
    result[paths["readlist"]] = _dump(
        _merge_readlist(_load(baseline, paths["readlist"]), current_run)
    )

    history = _load(baseline, paths["evidence_history"])
    runs = [dict(item) for item in history.get("runs", []) if isinstance(item, Mapping)]
    runs = [item for item in runs if item.get("task_id") != task_id]
    runs.append(
        {
            "task_id": task_id,
            "stage": stage,
            "recorded_at": recorded_at,
            "pages": ledger["pages"],
        }
    )
    result[paths["evidence_history"]] = _dump(
        {"version": "1.0", "generated_by": "compile", "runs": runs[-100:]}
    )
    return result


__all__ = ["prepare_persistent_intermediates"]

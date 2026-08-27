"""Deterministic OKF Wiki rendering for compile bundles."""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Mapping
from urllib.parse import unquote

import yaml

from openviking.core.namespace import context_type_for_uri, relative_uri_path
from openviking.session.memory.dataclass import MemoryFile, StoredLink
from openviking.session.memory.utils.link_renderer import LinkRenderer
from openviking.session.memory.utils.link_resolver import resolve_wiki_links
from openviking.session.memory.utils.memory_file_utils import (
    MemoryFileUtils,
    next_memory_version,
)
from openviking.session.memory.utils.resource_refs import sync_memory_resource_refs
from openviking.utils.path_safety import (
    safe_join_viking_uri,
    sanitize_relative_viking_path,
    validate_safe_viking_uri_path,
)
from openviking_cli.utils import VikingURI
from vikingbot.compile.models import CompileLimits, WikiBundleDraft, WikiLanguage
from vikingbot.compile.okf_config import OKFConfig

_FRONTMATTER_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.DOTALL)
_FRONTMATTER_START_RE = re.compile(rb"\A---[ \t]*\r?\n")
_FRONTMATTER_END_RE = re.compile(rb"\r?\n---[ \t]*(?:\r?\n|\Z)")
_OKF_TYPE_DECLARATION_RE = re.compile(rb"""(?m)^(?:type|["']type["'])[ \t]*:""")
_BARE_VIKING_URI_RE = re.compile(r"""viking://[^\s<>\[\](){}"'«»，。；：！？]+""")
_LEADING_H1_RE = re.compile(r"\A(?:[ \t]*\r?\n)*#[ \t]+[^\r\n]*(?:\r?\n|\Z)")
_LEGACY_RELATED_PAGES_RE = re.compile(
    r"(?mi)^##[ \t]+(?:Related pages|相关页面)[ \t]*\r?\n"
    r"(?:[ \t]*\r?\n)*(?:[ \t]*-[^\r\n]*(?:\r?\n|\Z))+"
)
_RESERVED_FILENAMES = frozenset({".abstract.md", ".overview.md", ".relations.json", ".source.json"})
_PLATFORM_FRONTMATTER_FIELDS = frozenset({"type", "title", "description", "tags"})
_DOUBLE_BRACKET_WIKILINK_RE = re.compile(r"\[\[([^\[\]\r\n]+)\]\]")


@dataclass(slots=True)
class RenderedBundle:
    operations: list[dict[str, Any]] = field(default_factory=list)
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    wiki_uris: list[str] = field(default_factory=list)
    link_count: int = 0


@dataclass(slots=True)
class FinalizedCheckout:
    files: dict[str, bytes] = field(default_factory=dict)
    wiki_paths: set[str] = field(default_factory=set)
    link_count: int = 0
    intermediate_artifacts: list[dict[str, Any]] = field(default_factory=list)
    investigation_status: str | None = None
    question_count: int = 0
    source_coverage: dict[str, Any] | None = None


def wiki_page_path_from_title(title: str) -> str:
    title = re.sub(r"\s+[-–—]\s+", " ", title.strip())
    return VikingURI.sanitize_segment(title)


def _split_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    match = _FRONTMATTER_RE.match(content or "")
    if not match:
        return {}, content or ""
    parsed = yaml.safe_load(match.group(1)) or {}
    if not isinstance(parsed, dict):
        raise ValueError("existing OKF frontmatter must be a YAML object")
    return parsed, content[match.end() :]


def strip_okf_frontmatter(content: str) -> str:
    """Return the editable Wiki body from a materialized OKF Markdown file."""
    return _split_frontmatter(content)[1].lstrip("\r\n")


def extract_okf_source_resources(content: bytes | str) -> set[str]:
    """Return declared source resources from one existing OKF Markdown page."""
    try:
        text = content.decode("utf-8") if isinstance(content, bytes) else content
        frontmatter, _body = _split_frontmatter(text)
    except (UnicodeDecodeError, ValueError, yaml.YAMLError):
        return set()
    sources = frontmatter.get("sources")
    if not isinstance(sources, list):
        return set()
    return {
        str(source.get("resource")).strip().rstrip("/")
        for source in sources
        if isinstance(source, Mapping)
        and isinstance(source.get("resource"), str)
        and str(source.get("resource")).strip().startswith("viking://")
    }


def has_unclosed_frontmatter(content: bytes) -> bool:
    opening = _FRONTMATTER_START_RE.match(content)
    return opening is not None and _FRONTMATTER_END_RE.search(content[opening.end() :]) is None


def validate_declared_okf_markdown(path: str, content: bytes) -> str | None:
    """Validate a Markdown artifact and return its declared OKF type, if any."""
    if not path.casefold().endswith(".md"):
        return
    opening = _FRONTMATTER_START_RE.match(content)
    if opening is None:
        return

    remainder = content[opening.end() :]
    closing = _FRONTMATTER_END_RE.search(remainder)
    raw_frontmatter = remainder[: closing.start()] if closing else remainder
    raw_declares_type = _OKF_TYPE_DECLARATION_RE.search(raw_frontmatter) is not None

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        if raw_declares_type:
            raise ValueError(f'OKF Markdown file "{path}" must be UTF-8') from exc
        return

    match = _FRONTMATTER_RE.match(text)
    if match is None:
        if raw_declares_type:
            raise ValueError(f'OKF Markdown file "{path}" has unterminated YAML frontmatter')
        return
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as exc:
        if raw_declares_type:
            raise ValueError(f'OKF Markdown file "{path}" has invalid YAML frontmatter') from exc
        return
    if not isinstance(frontmatter, dict):
        if raw_declares_type:
            raise ValueError(f'OKF Markdown file "{path}" frontmatter must be a YAML object')
        return
    if "type" not in frontmatter:
        return
    if not isinstance(frontmatter["type"], str) or not frontmatter["type"].strip():
        raise ValueError(
            f'OKF Markdown file "{path}" frontmatter field "type" must be a non-empty string'
        )
    return frontmatter["type"].strip()


def _normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in tags:
        tag = value.strip()
        if tag and tag not in normalized:
            normalized.append(tag)
    return normalized


def _frontmatter(
    *,
    old: Mapping[str, Any],
    page_type: str,
    title: str,
    summary: str,
    tags: list[str],
) -> str:
    data = {key: value for key, value in old.items() if key not in _PLATFORM_FRONTMATTER_FIELDS}
    data = {
        "type": page_type,
        "title": title,
        "description": summary,
        **data,
    }
    normalized_tags = _normalize_tags(tags)
    dumped = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=10**9)
    if normalized_tags:
        inline_tags = yaml.safe_dump(
            normalized_tags,
            allow_unicode=True,
            width=10**9,
            default_flow_style=True,
        ).strip()
        dumped += f"tags: {inline_tags}\n"
    return "---\n" + dumped + "---\n\n"


def _citation_target_allowed(target: str, source_roots: Mapping[str, str]) -> bool:
    if not target.startswith("viking://"):
        return False
    try:
        target = validate_safe_viking_uri_path(target)
    except ValueError:
        return False
    for root in source_roots.values():
        if target.rstrip("/") == root.rstrip("/") or relative_uri_path(root, target):
            return True
    return False


def _linkify_source_uris(body: str, source_roots: Mapping[str, str]) -> str:
    protected = LinkRenderer.protected_markdown_spans(body)
    replacements: list[tuple[int, int, str]] = []
    for match in _BARE_VIKING_URI_RE.finditer(body):
        start = match.start()
        target = match.group(0).rstrip(".,;:!?")
        end = start + len(target)
        if any(not (end <= span_start or start >= span_end) for span_start, span_end in protected):
            continue
        if start > 0 and end < len(body) and body[start - 1] == "<" and body[end] == ">":
            continue
        if not _citation_target_allowed(target, source_roots):
            continue
        label = unquote(target.rstrip("/").rsplit("/", 1)[-1]).removesuffix(".md")
        label = label.replace("[", r"\[").replace("]", r"\]") or "Source"
        replacements.append((start, end, f"[{label}]({target})"))

    rendered = list(body)
    for start, end, replacement in reversed(replacements):
        rendered[start:end] = replacement
    return "".join(rendered)


def _wiki_page_basename(uri: str) -> str:
    name = unquote(uri.rstrip("/").rsplit("/", 1)[-1])
    return name[:-3] if name.casefold().endswith(".md") else name


def _wiki_mention_targets(uris: set[str]) -> dict[str, str]:
    """Return unambiguous basename -> URI targets, excluding the root index."""
    grouped: dict[str, list[tuple[str, str]]] = {}
    for uri in sorted(uris):
        name = _wiki_page_basename(uri).strip()
        if not name or name.casefold() == "index":
            continue
        grouped.setdefault(name.casefold(), []).append((name, uri))
    return {items[0][0]: items[0][1] for items in grouped.values() if len(items) == 1}


def _frontmatter_with_defaults(
    content: str,
    *,
    config: OKFConfig,
    generated_metadata: Mapping[str, str],
) -> tuple[dict[str, Any], str]:
    """Apply configured defaults and return a stable complete OKF document."""
    frontmatter, body = _split_frontmatter(content)
    changed = False
    for key, value in config.frontmatter_defaults.items():
        if key not in frontmatter:
            frontmatter[key] = value
            changed = True
    if "generated" in config.required_frontmatter:
        generated = frontmatter.get("generated")
        generated = dict(generated) if isinstance(generated, Mapping) else {}
        for key, value in generated_metadata.items():
            if key in config.generated_fields and generated.get(key) != value:
                generated[key] = value
                changed = True
        frontmatter["generated"] = generated
    if not changed:
        return frontmatter, content
    dumped = yaml.safe_dump(frontmatter, allow_unicode=True, sort_keys=False, width=10**9)
    return frontmatter, f"---\n{dumped}---\n{body}"


def _validate_configured_frontmatter(
    path: str,
    frontmatter: Mapping[str, Any],
    *,
    body: str,
    config: OKFConfig,
    source_roots: Mapping[str, str],
    control_uris: set[str],
    target_uri: str,
) -> None:
    missing = [field for field in config.required_frontmatter if field not in frontmatter]
    if missing:
        raise ValueError(
            f'OKF Markdown file "{path}" is missing configured frontmatter fields: '
            + ", ".join(missing)
        )
    page_type = frontmatter.get("type")
    if not isinstance(page_type, str) or page_type.strip() not in config.allowed_types:
        raise ValueError(
            f'OKF Markdown file "{path}" frontmatter type must be one of: '
            + ", ".join(config.allowed_types)
        )
    expected_type = config.expected_type(path)
    if expected_type is None:
        raise ValueError(
            f'OKF Markdown file "{path}" does not match any configured path_types rule'
        )
    if page_type.strip() != expected_type:
        raise ValueError(
            f'OKF Markdown file "{path}" must use type "{expected_type}" according to '
            "the configured path_types rules"
        )
    if config.main_view is not None and path not in config.main_view.exempt_paths:
        segments = path.split("/")
        if not path.startswith(f"{config.main_view.root_path}/"):
            raise ValueError(
                f'OKF Markdown file "{path}" must live under main-view root '
                f'"{config.main_view.root_path}/"'
            )
        if len(segments) < 3 or segments[-2] not in config.main_view.leaf_categories:
            categories = ", ".join(config.main_view.leaf_categories)
            raise ValueError(
                f'OKF Markdown file "{path}" must use one configured main-view leaf '
                f"category as its immediate parent directory: {categories}"
            )

    for field_name in ("title", "description", "status"):
        if field_name in config.required_frontmatter and (
            not isinstance(frontmatter.get(field_name), str)
            or not str(frontmatter[field_name]).strip()
        ):
            raise ValueError(
                f'OKF Markdown file "{path}" frontmatter field "{field_name}" '
                "must be a non-empty string"
            )
    if "tags" in config.required_frontmatter and not isinstance(frontmatter.get("tags"), list):
        raise ValueError(f'OKF Markdown file "{path}" frontmatter field "tags" must be a list')
    tags = frontmatter.get("tags", [])
    if not isinstance(tags, list) or any(
        not isinstance(tag, str) or not tag.strip() for tag in tags
    ):
        raise ValueError(
            f'OKF Markdown file "{path}" frontmatter field "tags" must contain strings'
        )
    normalized_tags = {tag.strip() for tag in tags}
    validate_derived_views = not (
        config.main_view is not None
        and path in config.main_view.exempt_paths
        and not config.main_view.derived_views_include_exempt
    )
    for view in config.views if validate_derived_views else ():
        known = {group.tag for group in view.groups}
        unknown = sorted(
            tag for tag in normalized_tags if tag.startswith(view.tag_prefix) and tag not in known
        )
        if unknown:
            raise ValueError(
                f'OKF Markdown file "{path}" uses unknown tags for view "{view.id}": '
                + ", ".join(unknown)
            )
        selected = sorted(normalized_tags & known)
        if not selected:
            raise ValueError(
                f'OKF Markdown file "{path}" must select at least one tag for view "{view.id}"'
            )
        if view.selection == "exactly_one" and len(selected) != 1:
            raise ValueError(
                f'OKF Markdown file "{path}" must select exactly one tag for view "{view.id}"'
            )

    if "sources" in config.required_frontmatter:
        sources = frontmatter.get("sources")
        if not isinstance(sources, list) or not sources:
            raise ValueError(
                f'OKF Markdown file "{path}" frontmatter field "sources" must be a non-empty list'
            )
        source_kinds: set[str] = set()
        for index, source in enumerate(sources):
            if not isinstance(source, Mapping):
                raise ValueError(
                    f'OKF Markdown file "{path}" sources[{index}] must be a YAML object'
                )
            absent = [name for name in config.source_fields if name not in source]
            if absent:
                raise ValueError(
                    f'OKF Markdown file "{path}" sources[{index}] is missing: ' + ", ".join(absent)
                )
            for name in config.source_fields:
                if not isinstance(source.get(name), str):
                    raise ValueError(
                        f'OKF Markdown file "{path}" sources[{index}].{name} must be a string'
                    )
            resource = source.get("resource")
            kind = str(source.get("kind") or "").strip()
            if config.source_allowed_kinds:
                if kind not in config.source_allowed_kinds:
                    raise ValueError(
                        f'OKF Markdown file "{path}" sources[{index}].kind must be one of: '
                        + ", ".join(config.source_allowed_kinds)
                    )
                source_kinds.add(kind)
            normalized_resource = resource.strip().rstrip("/") if isinstance(resource, str) else ""
            is_intermediate = kind == "intermediate"
            allowed_intermediate_paths = (
                {
                    safe_join_viking_uri(target_uri, artifact_path).rstrip("/")
                    for artifact_path in config.intermediates.paths
                }
                if config.intermediates is not None
                else set()
            )
            resource_allowed = (
                normalized_resource in allowed_intermediate_paths
                if is_intermediate
                else _citation_target_allowed(normalized_resource, source_roots)
            )
            if "resource" in config.source_fields and (
                not normalized_resource
                or not resource_allowed
                or normalized_resource in control_uris
            ):
                expected = (
                    "a configured intermediate artifact" if is_intermediate else "a supplied source"
                )
                raise ValueError(
                    f'OKF Markdown file "{path}" sources[{index}].resource must reference '
                    + expected
                )
        if config.source_require_input and not (source_kinds - {"intermediate"}):
            raise ValueError(
                f'OKF Markdown file "{path}" must include at least one non-intermediate input source'
            )
        if config.source_require_intermediate and "intermediate" not in source_kinds:
            raise ValueError(
                f'OKF Markdown file "{path}" must include an intermediate artifact source'
            )

    if config.cross_knowledge is not None:
        field_name = config.cross_knowledge.frontmatter_field
        links = frontmatter.get(field_name, [])
        if not isinstance(links, list):
            raise ValueError(
                f'OKF Markdown file "{path}" frontmatter field "{field_name}" must be a list'
            )
        page_uri = safe_join_viking_uri(target_uri, path).rstrip("/")
        for index, link in enumerate(links):
            if not isinstance(link, Mapping):
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}] must be a YAML object'
                )
            resource = link.get("resource")
            title = link.get("title")
            relation = link.get("relation")
            direction = link.get("direction")
            context = link.get(config.cross_knowledge.context_field)
            if (
                not isinstance(resource, str)
                or not resource.strip().startswith("viking://")
                or resource.strip().rstrip("/") == page_uri
            ):
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].resource must be a '
                    "non-self OpenViking knowledge URI"
                )
            if not isinstance(title, str) or not title.strip():
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].title must be non-empty'
                )
            if relation not in config.cross_knowledge.allowed_relations:
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].relation must be one of: '
                    + ", ".join(config.cross_knowledge.allowed_relations)
                )
            if direction not in {"outgoing", "incoming", "bidirectional"}:
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].direction must be '
                    "outgoing, incoming, or bidirectional"
                )
            if not isinstance(context, str) or not context.strip():
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].'
                    f"{config.cross_knowledge.context_field} must identify the body passage "
                    "where this relation is used"
                )
            if context.strip() not in body:
                raise ValueError(
                    f'OKF Markdown file "{path}" {field_name}[{index}].'
                    f"{config.cross_knowledge.context_field} must occur verbatim in the page body"
                )
            if config.cross_knowledge.require_body_link:
                normalized_resource = LinkRenderer.normalize_markdown_target(resource.strip())
                body_targets = {
                    LinkRenderer.normalize_markdown_target(markdown_link.target)
                    for markdown_link in LinkRenderer.iter_markdown_links(body)
                    if markdown_link.start == 0 or body[markdown_link.start - 1] != "!"
                }
                if normalized_resource not in body_targets:
                    raise ValueError(
                        f'OKF Markdown file "{path}" {field_name}[{index}].resource must '
                        "also appear as a readable Markdown link at its contextual body passage"
                    )

    if "generated" in config.required_frontmatter:
        generated = frontmatter.get("generated")
        if not isinstance(generated, Mapping):
            raise ValueError(
                f'OKF Markdown file "{path}" frontmatter field "generated" must be a YAML object'
            )
        for name in config.generated_fields:
            value = generated.get(name)
            is_timestamp = name == "at" and isinstance(value, (date, datetime))
            if not is_timestamp and (not isinstance(value, str) or not value.strip()):
                raise ValueError(
                    f'OKF Markdown file "{path}" generated.{name} must be a non-empty string'
                )


def _configured_wikilink_protected_spans(body: str, config: OKFConfig) -> list[tuple[int, int]]:
    spans = LinkRenderer.protected_markdown_spans(body)
    spans.extend(
        (match.start(), match.end()) for match in _DOUBLE_BRACKET_WIKILINK_RE.finditer(body)
    )
    if "headings" in config.wikilinks.exclude:
        spans.extend(
            (match.start(), match.end())
            for match in re.finditer(r"(?m)^[ \t]{0,3}#{1,6}[ \t]+.*(?:\r?\n|\Z)", body)
        )
    if "tables" in config.wikilinks.exclude:
        spans.extend(
            (match.start(), match.end())
            for match in re.finditer(r"(?m)^[^\r\n]*\|[^\r\n]*(?:\r?\n|\Z)", body)
        )
    return sorted(set(spans))


def _paragraph_spans(body: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in re.finditer(r"(?ms)(?:\A|\r?\n[ \t]*\r?\n+)(.*?)(?=\r?\n[ \t]*\r?\n+|\Z)", body):
        start, end = match.start(1), match.end(1)
        if body[start:end].strip():
            spans.append((start, end))
    return spans


def _finalize_double_bracket_wikilinks(
    body: str,
    *,
    path: str,
    source_uri: str,
    targets: Mapping[str, str],
    config: OKFConfig,
) -> tuple[str, int]:
    """Validate and proactively insert literal ``[[filename stem]]`` links."""
    if not config.wikilinks.enabled:
        return body, 0
    by_case = {name.casefold(): (name, uri) for name, uri in targets.items()}
    protected = _configured_wikilink_protected_spans(body, config)
    for match in _DOUBLE_BRACKET_WIKILINK_RE.finditer(body):
        target_name = match.group(1).strip()
        resolved = by_case.get(target_name.casefold())
        if config.wikilinks.catalog_only and resolved is None:
            raise ValueError(
                f'OKF Markdown file "{path}" WikiLink [[{target_name}]] does not match an '
                "unambiguous existing page filename"
            )
        if resolved is not None:
            canonical, target_uri = resolved
            if target_name != canonical:
                raise ValueError(
                    f'OKF Markdown file "{path}" WikiLink [[{target_name}]] must match the '
                    f"actual filename stem [[{canonical}]] exactly"
                )
            if target_uri == source_uri:
                raise ValueError(f'OKF Markdown file "{path}" must not contain a self WikiLink')
        excluded = [span for span in protected if span != (match.start(), match.end())]
        if any(
            not (match.end() <= span_start or match.start() >= span_end)
            for span_start, span_end in excluded
        ):
            raise ValueError(
                f'OKF Markdown file "{path}" contains a WikiLink in an excluded context'
            )

    if not config.wikilinks.auto_link:
        return body, 0
    replacements: list[tuple[int, int, str]] = []
    ordered_targets = sorted(targets.items(), key=lambda item: len(item[0]), reverse=True)
    paragraphs = (
        _paragraph_spans(body)
        if config.wikilinks.first_occurrence_per_paragraph
        else [(0, len(body))]
    )
    for paragraph_start, paragraph_end in paragraphs:
        paragraph = body[paragraph_start:paragraph_end]
        local_protected = [
            (max(0, start - paragraph_start), min(paragraph_end, end) - paragraph_start)
            for start, end in protected
            if start < paragraph_end and end > paragraph_start
        ]
        for name, target_uri in ordered_targets:
            if target_uri == source_uri or f"[[{name}]]" in paragraph:
                continue
            match_span = LinkRenderer._find_match_span(  # noqa: SLF001
                paragraph,
                name,
                protected_spans=local_protected,
            )
            if match_span is None:
                continue
            start, end = (paragraph_start + match_span[0], paragraph_start + match_span[1])
            if any(
                not (end <= old_start or start >= old_end) for old_start, old_end, _ in replacements
            ):
                continue
            replacements.append((start, end, f"[[{name}]]"))
            local_protected.append(match_span)

    rendered = list(body)
    for start, end, replacement in sorted(replacements, reverse=True):
        rendered[start:end] = list(replacement)
    return "".join(rendered), len(replacements)


def _has_link_to(body: str, source_uri: str, target_uri: str) -> bool:
    relative = LinkRenderer.relative_path(source_uri, target_uri)
    expected = {
        LinkRenderer.normalize_markdown_target(target_uri),
        LinkRenderer.normalize_markdown_target(relative if relative is not None else target_uri),
    }
    return any(
        link.start == 0 or body[link.start - 1] != "!"
        for link in LinkRenderer.iter_markdown_links(body)
        if LinkRenderer.normalize_markdown_target(link.target) in expected
    )


def _strip_legacy_related_pages(body: str) -> str:
    rendered, count = _LEGACY_RELATED_PAGES_RE.subn("", body)
    return rendered.rstrip() if count else body


def _link_wiki_mentions(
    content: str,
    *,
    source_uri: str,
    targets: Mapping[str, str],
) -> tuple[str, int]:
    """Link the first body mention of each unambiguous Wiki filename."""
    frontmatter = _FRONTMATTER_RE.match(content)
    prefix = content[: frontmatter.end()] if frontmatter else ""
    body = content[frontmatter.end() :] if frontmatter else content
    title = _LEADING_H1_RE.match(body)
    if title:
        prefix += body[: title.end()]
        body = body[title.end() :]
    body = _strip_legacy_related_pages(body)

    links = [
        {
            "match_text": name,
            "to_uri": target_uri,
            "weight": len(name),
        }
        for name, target_uri in targets.items()
        if target_uri != source_uri and not _has_link_to(body, source_uri, target_uri)
    ]
    rendered, count = LinkRenderer.render_links_with_count(body, source_uri, links)
    return prefix + rendered, count


def _load_json_artifact(files: Mapping[str, bytes], path: str) -> Mapping[str, Any]:
    payload = files.get(path)
    if payload is None:
        raise ValueError(f'required Compile intermediate artifact is missing: "{path}"')
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(
            f'Compile intermediate artifact "{path}" must be valid UTF-8 JSON'
        ) from exc
    if not isinstance(value, Mapping):
        raise ValueError(f'Compile intermediate artifact "{path}" must contain a JSON object')
    if value.get("version") != "1.0":
        raise ValueError(f'Compile intermediate artifact "{path}" must use version "1.0"')
    return value


def _string_array(value: Any, *, label: str) -> list[str]:
    if not isinstance(value, list) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise ValueError(f"{label} must be a JSON array of non-empty strings")
    return [item.strip() for item in value]


def _validate_intermediate_artifacts(
    files: Mapping[str, bytes],
    *,
    target_uri: str,
    source_roots: Mapping[str, str],
    wiki_paths: set[str],
    config: OKFConfig,
    source_units: list[dict[str, Any]],
    read_paths: set[str],
) -> tuple[list[dict[str, Any]], str | None, int, dict[str, Any] | None]:
    intermediate = config.intermediates
    if intermediate is None:
        return [], None, 0, None
    expected = {
        "run_manifest": f"{intermediate.root_path}/{intermediate.run_manifest}",
        "evidence_ledger": f"{intermediate.root_path}/{intermediate.evidence_ledger}",
        "investigation_report": f"{intermediate.root_path}/{intermediate.investigation_report}",
        "questionnaire": f"{intermediate.root_path}/{intermediate.questionnaire}",
        "source_coverage": f"{intermediate.root_path}/{intermediate.source_coverage}",
        "candidate_knowledge": (f"{intermediate.root_path}/{intermediate.candidate_knowledge}"),
        "readlist": f"{intermediate.root_path}/{intermediate.readlist}",
        "evidence_history": f"{intermediate.root_path}/{intermediate.evidence_history}",
    }
    if not intermediate.required and not any(path in files for path in expected.values()):
        return [], None, 0, None

    manifest = _load_json_artifact(files, expected["run_manifest"])
    if manifest.get("target") != target_uri.rstrip("/"):
        raise ValueError(
            "Compile run manifest target must equal the exact Compile target URI: "
            f"{target_uri.rstrip('/')}"
        )
    stage = manifest.get("stage")
    if stage not in {"documents", "memory_incremental", "human_incremental"}:
        raise ValueError(
            "Compile run manifest stage must be documents, memory_incremental, or human_incremental"
        )
    manifest_sources = set(
        _string_array(manifest.get("source_roots"), label="run manifest source_roots")
    )
    current_sources = {
        value.rstrip("/")
        for value in source_roots.values()
        if not value.startswith(f"{target_uri.rstrip('/')}/")
    }
    manifest_source_set = {value.rstrip("/") for value in manifest_sources}
    missing_sources = sorted(current_sources - manifest_source_set)
    if missing_sources:
        missing_json = json.dumps(missing_sources, ensure_ascii=False)
        raise ValueError(
            "Compile run manifest must include every supplied source root exactly; "
            f"missing source_roots: {missing_json}"
        )

    ledger = _load_json_artifact(files, expected["evidence_ledger"])
    ledger_pages = ledger.get("pages")
    if not isinstance(ledger_pages, list):
        raise ValueError("Compile evidence ledger pages must be a JSON array")
    pages_by_path: dict[str, Mapping[str, Any]] = {}
    for index, entry in enumerate(ledger_pages):
        if not isinstance(entry, Mapping) or not isinstance(entry.get("path"), str):
            raise ValueError(f"Compile evidence ledger pages[{index}] must contain path")
        page_path = str(entry["path"]).strip("/")
        if page_path in pages_by_path:
            raise ValueError(f'Compile evidence ledger contains duplicate page: "{page_path}"')
        pages_by_path[page_path] = entry
    if set(pages_by_path) != wiki_paths:
        missing = sorted(wiki_paths - set(pages_by_path))
        unknown = sorted(set(pages_by_path) - wiki_paths)
        details = []
        if missing:
            details.append("missing " + ", ".join(missing))
        if unknown:
            details.append("unknown " + ", ".join(unknown))
        raise ValueError(
            "Compile evidence ledger must cover every Wiki page exactly: " + "; ".join(details)
        )
    evidence_uri = safe_join_viking_uri(target_uri, expected["evidence_ledger"]).rstrip("/")
    for page_path, entry in pages_by_path.items():
        source_resources = _string_array(
            entry.get("source_resources"),
            label=f'evidence ledger page "{page_path}" source_resources',
        )
        if not any(
            _citation_target_allowed(resource, source_roots) for resource in source_resources
        ):
            raise ValueError(
                f'Compile evidence ledger page "{page_path}" must reference a supplied input source'
            )
        intermediate_resources = _string_array(
            entry.get("intermediate_resources"),
            label=f'evidence ledger page "{page_path}" intermediate_resources',
        )
        if evidence_uri not in {resource.rstrip("/") for resource in intermediate_resources}:
            raise ValueError(
                f'Compile evidence ledger page "{page_path}" must reference its evidence ledger URI'
            )
        claims = entry.get("claims")
        if not isinstance(claims, list):
            raise ValueError(f'Compile evidence ledger page "{page_path}" claims must be an array')

    report = _load_json_artifact(files, expected["investigation_report"])
    investigation_status = report.get("status")
    if investigation_status not in {"clear", "needs_human_input"}:
        raise ValueError("Compile investigation report status must be clear or needs_human_input")
    issue_ids: set[str] = set()
    issue_count = 0
    for field_name in ("conflicts", "evidence_gaps"):
        issues = report.get(field_name)
        if not isinstance(issues, list):
            raise ValueError(f"Compile investigation report {field_name} must be an array")
        for index, issue in enumerate(issues):
            if not isinstance(issue, Mapping):
                raise ValueError(
                    f"Compile investigation report {field_name}[{index}] must be an object"
                )
            issue_id = issue.get("id")
            summary = issue.get("summary")
            impact = issue.get("impact")
            if not isinstance(issue_id, str) or not issue_id.strip() or issue_id in issue_ids:
                raise ValueError("Compile investigation issue ids must be unique non-empty strings")
            if (
                not isinstance(summary, str)
                or not summary.strip()
                or not isinstance(impact, str)
                or not impact.strip()
            ):
                raise ValueError(
                    f"Compile investigation issue {issue_id} needs non-empty string "
                    "summary and impact fields"
                )
            resources = _string_array(
                issue.get("source_resources"),
                label=f"Compile investigation issue {issue_id} source_resources",
            )
            if resources and any(
                not _citation_target_allowed(resource, source_roots) for resource in resources
            ):
                raise ValueError(
                    f"Compile investigation issue {issue_id} references an unknown source"
                )
            issue_ids.add(issue_id)
            issue_count += 1
    expected_status = "needs_human_input" if issue_count else "clear"
    if investigation_status != expected_status:
        raise ValueError(
            f"Compile investigation report status must be {expected_status} for its issue count"
        )

    questionnaire = _load_json_artifact(files, expected["questionnaire"])
    questionnaire_status = questionnaire.get("status")
    if questionnaire_status not in {"not_required", "open", "answered"}:
        raise ValueError("Compile questionnaire status must be not_required, open, or answered")
    questions = questionnaire.get("questions")
    if not isinstance(questions, list):
        raise ValueError("Compile questionnaire questions must be an array")
    covered_issue_ids: set[str] = set()
    question_ids: set[str] = set()
    for index, question in enumerate(questions):
        if not isinstance(question, Mapping):
            raise ValueError(f"Compile questionnaire questions[{index}] must be an object")
        question_id = question.get("id")
        prompt = question.get("prompt")
        reason = question.get("reason")
        kind = question.get("kind")
        if (
            not isinstance(question_id, str)
            or not question_id.strip()
            or question_id in question_ids
        ):
            raise ValueError("Compile questionnaire question ids must be unique non-empty strings")
        if (
            not isinstance(prompt, str)
            or not prompt.strip()
            or not isinstance(reason, str)
            or not reason.strip()
        ):
            raise ValueError(
                f"Compile questionnaire question {question_id} needs non-empty string "
                "prompt and reason fields"
            )
        if kind not in {"single_choice", "multiple_choice", "free_text"}:
            raise ValueError(
                f"Compile questionnaire question {question_id} kind must be single_choice, "
                "multiple_choice, or free_text"
            )
        options = question.get("options", [])
        if kind != "free_text" and not _string_array(
            options, label=f"question {question_id} options"
        ):
            raise ValueError(f"Compile questionnaire question {question_id} needs options")
        if kind == "free_text" and not isinstance(options, list):
            raise ValueError(
                f"Compile questionnaire question {question_id} options must be an array"
            )
        related_ids = set(
            _string_array(
                question.get("related_issue_ids"),
                label=f"question {question_id} related_issue_ids",
            )
        )
        if questionnaire_status != "answered" and not related_ids.issubset(issue_ids):
            raise ValueError(
                f"Compile questionnaire question {question_id} references an unknown issue"
            )
        covered_issue_ids.update(related_ids)
        question_ids.add(question_id)
    if issue_ids and (
        questionnaire_status not in {"open", "answered"}
        or not covered_issue_ids.issuperset(issue_ids)
    ):
        raise ValueError(
            "Compile questionnaire must ask at least one question covering every issue"
        )
    if not issue_ids and questionnaire_status == "not_required" and questions:
        raise ValueError(
            "Compile questionnaire must be not_required with no questions when the report is clear"
        )
    if not issue_ids and questionnaire_status not in {"not_required", "answered"}:
        raise ValueError(
            "Compile questionnaire must be not_required or answered when the report is clear"
        )

    coverage = _load_json_artifact(files, expected["source_coverage"])
    if coverage.get("stage") != stage:
        raise ValueError("Compile source coverage stage must match the run manifest stage")
    coverage_sources = coverage.get("sources")
    if not isinstance(coverage_sources, list):
        raise ValueError("Compile source coverage sources must be a JSON array")
    coverage_by_resource: dict[str, Mapping[str, Any]] = {}
    for index, entry in enumerate(coverage_sources):
        if not isinstance(entry, Mapping):
            raise ValueError(f"Compile source coverage sources[{index}] must be an object")
        resource = entry.get("resource")
        if not isinstance(resource, str) or not resource.strip().startswith("viking://"):
            raise ValueError(
                f"Compile source coverage sources[{index}] needs an exact Viking resource URI"
            )
        normalized = resource.strip().rstrip("/")
        if normalized in coverage_by_resource:
            raise ValueError(f'Compile source coverage contains duplicate source: "{normalized}"')
        coverage_by_resource[normalized] = entry

    expected_units = {
        str(unit.get("resource") or "").rstrip("/"): unit
        for unit in source_units
        if str(unit.get("resource") or "").strip()
    }
    if expected_units and not set(coverage_by_resource).issuperset(expected_units):
        missing = sorted(set(expected_units) - set(coverage_by_resource))
        raise ValueError(
            "Compile source coverage must account for every upload-level source exactly: "
            + "missing "
            + ", ".join(missing)
        )
    for resource in set(coverage_by_resource) - set(expected_units):
        if not any(
            resource == root.rstrip("/")
            or bool(relative_uri_path(resource, root.rstrip("/")))
            or bool(relative_uri_path(root.rstrip("/"), resource))
            for root in source_roots.values()
        ):
            raise ValueError(
                f'Compile source coverage contains an unrelated retained source: "{resource}"'
            )

    dispositions = {"cited", "merged", "skipped"}
    counts = {
        "uploaded": len(coverage_by_resource),
        "inspected": 0,
        **dict.fromkeys(dispositions, 0),
    }
    for resource, entry in coverage_by_resource.items():
        inspected = entry.get("inspected")
        if inspected is not True:
            raise ValueError(f'Compile source coverage source "{resource}" must be inspected')
        counts["inspected"] += 1
        status = entry.get("status")
        if status not in dispositions:
            raise ValueError(
                f'Compile source coverage source "{resource}" status must be cited, merged, or skipped'
            )
        counts[str(status)] += 1
        reason = entry.get("reason")
        if status in {"merged", "skipped"} and (not isinstance(reason, str) or not reason.strip()):
            raise ValueError(
                f'Compile source coverage source "{resource}" needs a non-empty {status} reason'
            )

        unit = expected_units.get(resource)
        leaves = unit.get("leaves", []) if isinstance(unit, Mapping) else []
        materialized_paths = {
            str(leaf.get("workspace_path") or "")
            for leaf in leaves
            if isinstance(leaf, Mapping) and leaf.get("status") == "materialized"
        }
        declared_required = unit.get("required_read_paths", []) if isinstance(unit, Mapping) else []
        required_paths = {str(path) for path in declared_required if isinstance(path, str) and path}
        if not required_paths and materialized_paths:
            # Backward-compatible deterministic fallback for callers that have not yet
            # attached upload-level probe metadata.
            ordered_paths = sorted(materialized_paths)
            if len(ordered_paths) <= 8:
                required_paths = set(ordered_paths)
            else:
                probe_indexes = [
                    round(index * (len(ordered_paths) - 1) / 7) for index in range(8)
                ]
                middle_index = len(ordered_paths) // 2
                if middle_index not in probe_indexes:
                    replace_at = min(
                        range(1, len(probe_indexes) - 1),
                        key=lambda index: abs(probe_indexes[index] - middle_index),
                    )
                    probe_indexes[replace_at] = middle_index
                required_paths = {ordered_paths[index] for index in probe_indexes}
        unknown_required = sorted(required_paths - materialized_paths)
        if unknown_required:
            raise ValueError(
                f'Compile source coverage source "{resource}" declares non-materialized '
                "required_read_paths: " + ", ".join(unknown_required)
            )
        missing_required = sorted(required_paths - read_paths)
        if missing_required:
            raise ValueError(
                f'Compile source coverage source "{resource}" was declared inspected but '
                "required readlist probes are missing: " + ", ".join(missing_required)
            )

        if status == "cited":
            page_paths = _string_array(
                entry.get("page_paths"),
                label=f'Compile source coverage source "{resource}" page_paths',
            )
            evidence_resources = _string_array(
                entry.get("evidence_resources"),
                label=f'Compile source coverage source "{resource}" evidence_resources',
            )
            if not page_paths or not evidence_resources:
                raise ValueError(
                    f'Compile source coverage cited source "{resource}" needs non-empty '
                    "page_paths and evidence_resources"
                )
            unknown_pages = sorted(set(page_paths) - wiki_paths)
            if unknown_pages:
                raise ValueError(
                    f'Compile source coverage source "{resource}" cites unknown pages: '
                    + ", ".join(unknown_pages)
                )
            for evidence_resource in evidence_resources:
                normalized_evidence = evidence_resource.rstrip("/")
                if normalized_evidence != resource and not relative_uri_path(
                    resource, normalized_evidence
                ):
                    raise ValueError(
                        f'Compile source coverage evidence "{evidence_resource}" is outside '
                        f'source "{resource}"'
                    )
            cited_by_ledger = {
                page_path
                for page_path in page_paths
                if set(
                    _string_array(
                        pages_by_path[page_path].get("source_resources"),
                        label=f'evidence ledger page "{page_path}" source_resources',
                    )
                )
                & set(evidence_resources)
            }
            if cited_by_ledger != set(page_paths):
                raise ValueError(
                    f'Compile source coverage source "{resource}" must be backed by the '
                    "evidence ledger for every declared page"
                )
        elif status == "merged":
            merged_into = entry.get("merged_into")
            if (
                not isinstance(merged_into, str)
                or merged_into.rstrip("/") not in coverage_by_resource
            ):
                raise ValueError(
                    f'Compile source coverage source "{resource}" needs merged_into pointing '
                    "to another covered source"
                )
            if merged_into.rstrip("/") == resource:
                raise ValueError(
                    f'Compile source coverage source "{resource}" cannot merge into itself'
                )

    for resource, entry in coverage_by_resource.items():
        if entry.get("status") == "merged":
            target = coverage_by_resource[str(entry.get("merged_into")).rstrip("/")]
            if target.get("status") != "cited":
                raise ValueError(
                    f'Compile source coverage source "{resource}" must merge into a cited source'
                )

    declared_summary = coverage.get("summary")
    if not isinstance(declared_summary, Mapping) or any(
        declared_summary.get(key) != value for key, value in counts.items()
    ):
        raise ValueError("Compile source coverage summary must exactly match its source entries")
    coverage_summary = dict(counts)
    coverage_summary["artifact_uri"] = safe_join_viking_uri(
        target_uri, expected["source_coverage"]
    ).rstrip("/")

    candidates = _load_json_artifact(files, expected["candidate_knowledge"])
    if candidates.get("stage") != stage:
        raise ValueError("Compile candidate knowledge stage must match the run manifest stage")
    candidate_entries = candidates.get("candidates")
    if not isinstance(candidate_entries, list):
        raise ValueError("Compile candidate knowledge candidates must be a JSON array")
    candidates_by_id: dict[str, Mapping[str, Any]] = {}
    candidate_sources: set[str] = set()
    promoted_pages: set[str] = set()
    candidate_counts = {
        "total": len(candidate_entries),
        "promoted": 0,
        "merged": 0,
        "deferred": 0,
        "rejected": 0,
    }
    for index, entry in enumerate(candidate_entries):
        if not isinstance(entry, Mapping):
            raise ValueError(f"Compile candidate knowledge candidates[{index}] must be an object")
        candidate_id = entry.get("id")
        if (
            not isinstance(candidate_id, str)
            or not candidate_id.strip()
            or candidate_id in candidates_by_id
        ):
            raise ValueError("Compile candidate ids must be unique non-empty strings")
        for field_name in ("title", "summary"):
            if not isinstance(entry.get(field_name), str) or not str(entry[field_name]).strip():
                raise ValueError(f'Compile candidate "{candidate_id}" needs non-empty {field_name}')
        if entry.get("kind") not in {"entity", "concept", "synthesis"}:
            raise ValueError(
                f'Compile candidate "{candidate_id}" kind must be entity, concept, or synthesis'
            )
        disposition = entry.get("disposition")
        if disposition not in {"promoted", "merged", "deferred", "rejected"}:
            raise ValueError(f'Compile candidate "{candidate_id}" has invalid disposition')
        candidate_counts[str(disposition)] += 1
        source_resources = _string_array(
            entry.get("source_resources"),
            label=f'candidate "{candidate_id}" source_resources',
        )
        if any(
            not _citation_target_allowed(resource, source_roots) for resource in source_resources
        ):
            raise ValueError(f'Compile candidate "{candidate_id}" references an unknown source')
        candidate_sources.update(resource.rstrip("/") for resource in source_resources)
        page_paths = _string_array(
            entry.get("page_paths", []), label=f'candidate "{candidate_id}" page_paths'
        )
        unknown_pages = sorted(set(page_paths) - wiki_paths)
        if unknown_pages:
            raise ValueError(
                f'Compile candidate "{candidate_id}" references unknown pages: '
                + ", ".join(unknown_pages)
            )
        if disposition == "promoted":
            if not isinstance(entry.get("meta_id"), str) or not str(entry["meta_id"]).strip():
                raise ValueError(f'Compile promoted candidate "{candidate_id}" needs meta_id')
            if not page_paths:
                raise ValueError(f'Compile promoted candidate "{candidate_id}" needs page_paths')
            promoted_pages.update(page_paths)
        elif disposition == "merged":
            if (
                not isinstance(entry.get("merged_into"), str)
                or not str(entry["merged_into"]).strip()
            ):
                raise ValueError(f'Compile merged candidate "{candidate_id}" needs merged_into')
            if not isinstance(entry.get("reason"), str) or not str(entry["reason"]).strip():
                raise ValueError(f'Compile merged candidate "{candidate_id}" needs reason')
        elif not isinstance(entry.get("reason"), str) or not str(entry["reason"]).strip():
            raise ValueError(f'Compile {disposition} candidate "{candidate_id}" needs reason')
        candidates_by_id[candidate_id] = entry
    for candidate_id, entry in candidates_by_id.items():
        if entry.get("disposition") == "merged":
            merged_into = str(entry.get("merged_into") or "")
            target = candidates_by_id.get(merged_into)
            if target is None or target.get("disposition") != "promoted":
                raise ValueError(
                    f'Compile merged candidate "{candidate_id}" must point to a promoted candidate'
                )
    missing_candidate_sources = sorted(
        resource
        for resource in expected_units
        if not any(
            candidate_source == resource or bool(relative_uri_path(resource, candidate_source))
            for candidate_source in candidate_sources
        )
    )
    if missing_candidate_sources:
        raise ValueError(
            "Compile candidate knowledge must account for every upload-level source: missing "
            + ", ".join(missing_candidate_sources)
        )
    exempt_paths = set(config.main_view.exempt_paths) if config.main_view is not None else set()
    missing_candidate_pages = sorted((wiki_paths - exempt_paths) - promoted_pages)
    if missing_candidate_pages:
        raise ValueError(
            "Every non-index Wiki page must be produced by a promoted candidate: missing "
            + ", ".join(missing_candidate_pages)
        )
    if candidates.get("summary") != candidate_counts:
        raise ValueError("Compile candidate knowledge summary must exactly match its candidates")

    persisted_readlist = _load_json_artifact(files, expected["readlist"])
    readlist_runs = persisted_readlist.get("runs")
    if not isinstance(readlist_runs, list) or not readlist_runs:
        raise ValueError("Compile persisted readlist must contain at least one run")
    latest_units = (
        readlist_runs[-1].get("source_units") if isinstance(readlist_runs[-1], Mapping) else None
    )
    if not isinstance(latest_units, list) or any(
        not isinstance(unit, Mapping) or unit.get("complete") is not True for unit in latest_units
    ):
        raise ValueError("Compile persisted readlist latest run has incomplete source units")
    if (
        isinstance(readlist_runs[-1], Mapping)
        and readlist_runs[-1].get("generated_by") == "compile"
    ):
        latest_by_resource = {
            str(unit.get("resource") or "").rstrip("/"): unit
            for unit in latest_units
            if isinstance(unit, Mapping) and str(unit.get("resource") or "").strip()
        }
        if set(latest_by_resource) != set(expected_units):
            raise ValueError(
                "Compile persisted readlist latest run must match current upload-level sources"
            )
        for resource, source_unit in expected_units.items():
            persisted_required = set(
                _string_array(
                    latest_by_resource[resource].get("required_read_paths", []),
                    label=f'persisted readlist source "{resource}" required_read_paths',
                )
            )
            expected_required = {
                str(path)
                for path in source_unit.get("required_read_paths", [])
                if isinstance(path, str) and path
            }
            if persisted_required != expected_required:
                raise ValueError(
                    f'Compile persisted readlist source "{resource}" has incorrect required probes'
                )
        latest_read_paths = set(
            _string_array(
                readlist_runs[-1].get("read_paths", []),
                label="persisted readlist latest run read_paths",
            )
        )
        if latest_read_paths != read_paths:
            raise ValueError("Compile persisted readlist latest run does not match the read trace")

    evidence_history = _load_json_artifact(files, expected["evidence_history"])
    history_runs = evidence_history.get("runs")
    if not isinstance(history_runs, list) or not history_runs:
        raise ValueError("Compile evidence history must contain at least one run")
    latest_history_pages = (
        history_runs[-1].get("pages") if isinstance(history_runs[-1], Mapping) else None
    )
    if evidence_history.get("generated_by") == "compile" and latest_history_pages != ledger_pages:
        raise ValueError("Compile evidence history latest snapshot must equal the evidence ledger")

    artifacts = [
        {
            "kind": kind,
            "path": path,
            "uri": safe_join_viking_uri(target_uri, path).rstrip("/"),
        }
        for kind, path in expected.items()
    ]
    return artifacts, str(investigation_status), len(questions), coverage_summary


def _validate_meta_knowledge_units(
    wiki_paths: set[str],
    frontmatter_by_path: Mapping[str, Mapping[str, Any]],
    *,
    config: OKFConfig,
) -> None:
    """Require one complete what/why/how page set for every explicit meta id."""
    main_view = config.main_view
    meta = main_view.meta_knowledge if main_view is not None else None
    if main_view is None or meta is None:
        return

    required_facets = set(main_view.leaf_categories)
    units: dict[str, dict[str, str]] = {}
    for path in sorted(wiki_paths - set(main_view.exempt_paths)):
        segments = path.split("/")
        facet = segments[-2]
        meta_id = frontmatter_by_path[path].get(meta.id_field)
        if not isinstance(meta_id, str) or not meta_id.strip():
            raise ValueError(
                f'OKF Markdown file "{path}" must declare a non-empty '
                f'frontmatter "{meta.id_field}" for its meta-knowledge unit'
            )
        normalized_meta_id = meta_id.strip()
        if "/" in normalized_meta_id or normalized_meta_id in {".", ".."}:
            raise ValueError(
                f'OKF Markdown file "{path}" frontmatter "{meta.id_field}" '
                "must be a safe id without slashes"
            )
        if meta.require_id_directory:
            if len(segments) < 4 or segments[-3] != normalized_meta_id:
                raise ValueError(
                    f'OKF Markdown file "{path}" must place meta-knowledge "{normalized_meta_id}" '
                    "in its own directory immediately before the what/why/how facet"
                )
            unit_key = "/".join(segments[:-2])
        else:
            unit_key = "/".join([*segments[:-2], normalized_meta_id])
        facet_paths = units.setdefault(unit_key, {})
        if facet in facet_paths:
            raise ValueError(
                f'Meta-knowledge unit "{unit_key}" contains more than one "{facet}" page'
            )
        facet_paths[facet] = path

    for unit_key, facet_paths in units.items():
        present_facets = set(facet_paths)
        if meta.require_complete and present_facets != required_facets:
            missing = sorted(required_facets - present_facets)
            extra = sorted(present_facets - required_facets)
            details: list[str] = []
            if missing:
                details.append("missing " + ", ".join(missing))
            if extra:
                details.append("unexpected " + ", ".join(extra))
            raise ValueError(
                f'Meta-knowledge unit "{unit_key}" must contain exactly one page for every '
                f"main-view facet ({', '.join(main_view.leaf_categories)}): " + "; ".join(details)
            )

        if not meta.shared_view_tags:
            continue
        for view in config.views:
            expected: tuple[str, ...] | None = None
            expected_path = ""
            known_tags = {group.tag for group in view.groups}
            for path in facet_paths.values():
                tags = frontmatter_by_path[path].get("tags", [])
                selected = tuple(sorted(set(tags) & known_tags))
                if expected is None:
                    expected = selected
                    expected_path = path
                    continue
                if selected != expected:
                    raise ValueError(
                        f'Meta-knowledge unit "{unit_key}" must use identical tags for view '
                        f'"{view.id}" across its what/why/how pages; "{expected_path}" and '
                        f'"{path}" disagree'
                    )


def finalize_resource_checkout(
    files: Mapping[str, bytes],
    *,
    target_uri: str,
    source_roots: Mapping[str, str],
    okf_config: OKFConfig | None = None,
    control_uris: set[str] | None = None,
    generated_metadata: Mapping[str, str] | None = None,
    source_units: list[dict[str, Any]] | None = None,
    read_paths: set[str] | None = None,
) -> FinalizedCheckout:
    """Validate and deterministically finalize one Resource checkout.

    The checkout already contains the final file layout. This pass only identifies
    self-declared OKF Wiki pages, makes supplied source URIs readable, and links the
    first body mention of another unambiguous Wiki filename. It does not decide create
    versus update.
    """
    wiki_paths: set[str] = set()
    frontmatter_by_path: dict[str, Mapping[str, Any]] = {}
    normalized_control_uris = {uri.rstrip("/") for uri in (control_uris or set())}
    for path, payload in files.items():
        page_type = validate_declared_okf_markdown(path, payload)
        if okf_config is not None and path.casefold().endswith(".md") and page_type is None:
            raise ValueError(
                f'OKF Markdown file "{path}" must declare YAML frontmatter type when '
                "an external OKF config is active"
            )
        if page_type is not None:
            text = payload.decode("utf-8")
            frontmatter, text = (
                _frontmatter_with_defaults(
                    text,
                    config=okf_config,
                    generated_metadata=generated_metadata or {},
                )
                if okf_config is not None
                else (_split_frontmatter(text)[0], text)
            )
            if okf_config is not None:
                _validate_configured_frontmatter(
                    path,
                    frontmatter,
                    body=_split_frontmatter(text)[1],
                    config=okf_config,
                    source_roots=source_roots,
                    control_uris=normalized_control_uris,
                    target_uri=target_uri,
                )
                files = {**files, path: text.encode("utf-8")}
            missing = [
                field
                for field in ("type", "title", "description")
                if not isinstance(frontmatter.get(field), str)
                or not str(frontmatter[field]).strip()
            ]
            if missing:
                raise ValueError(
                    f'OKF Markdown file "{path}" must have non-empty YAML frontmatter fields: '
                    + ", ".join(missing)
                )
            description = str(frontmatter["description"]).strip()
            if "\n" in description or "\r" in description:
                raise ValueError(
                    f'OKF Markdown file "{path}" frontmatter description must be one line'
                )
            wiki_paths.add(path)
            frontmatter_by_path[path] = frontmatter

    intermediate_artifacts: list[dict[str, Any]] = []
    investigation_status: str | None = None
    question_count = 0
    source_coverage: dict[str, Any] | None = None
    if okf_config is not None:
        (
            intermediate_artifacts,
            investigation_status,
            question_count,
            source_coverage,
        ) = _validate_intermediate_artifacts(
            files,
            target_uri=target_uri,
            source_roots=source_roots,
            wiki_paths=wiki_paths,
            config=okf_config,
            source_units=list(source_units or []),
            read_paths=set(read_paths or set()),
        )
        _validate_meta_knowledge_units(
            wiki_paths,
            frontmatter_by_path,
            config=okf_config,
        )

    wiki_uris = {safe_join_viking_uri(target_uri, path).rstrip("/") for path in wiki_paths}
    mention_targets = _wiki_mention_targets(wiki_uris)
    finalized = dict(files)
    link_count = 0
    for path in sorted(wiki_paths):
        payload = files[path]
        try:
            content = payload.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f'OKF Markdown file "{path}" must be UTF-8') from exc
        uri = safe_join_viking_uri(target_uri, path).rstrip("/")
        frontmatter = _FRONTMATTER_RE.match(content)
        if frontmatter:
            content = content[: frontmatter.end()] + _linkify_source_uris(
                content[frontmatter.end() :], source_roots
            )
        else:
            content = _linkify_source_uris(content, source_roots)
        if okf_config is not None:
            frontmatter_match = _FRONTMATTER_RE.match(content)
            prefix = content[: frontmatter_match.end()] if frontmatter_match else ""
            body = content[frontmatter_match.end() :] if frontmatter_match else content
            body, rendered_count = _finalize_double_bracket_wikilinks(
                body,
                path=path,
                source_uri=uri,
                targets=mention_targets,
                config=okf_config,
            )
            content = prefix + body
        else:
            content, rendered_count = _link_wiki_mentions(
                content,
                source_uri=uri,
                targets=mention_targets,
            )
        finalized[path] = content.encode("utf-8")
        link_count += rendered_count

    return FinalizedCheckout(
        files=finalized,
        wiki_paths=wiki_paths,
        link_count=link_count,
        intermediate_artifacts=intermediate_artifacts,
        investigation_status=investigation_status,
        question_count=question_count,
        source_coverage=source_coverage,
    )


def _render_source_fallback(
    body: str,
    *,
    source_ids: list[str],
    source_roots: Mapping[str, str],
    wiki_language: WikiLanguage | None,
) -> str:
    linked_targets = {
        LinkRenderer.normalize_markdown_target(link.target)
        for link in LinkRenderer.iter_markdown_links(body)
        if _citation_target_allowed(
            LinkRenderer.normalize_markdown_target(link.target), source_roots
        )
    }
    missing: list[tuple[str, str]] = []
    for source_id in source_ids:
        target = source_roots[source_id]
        if any(
            linked.rstrip("/") == target.rstrip("/") or relative_uri_path(target, linked)
            for linked in linked_targets
        ):
            continue
        label = unquote(target.rstrip("/").rsplit("/", 1)[-1]) or f"Source {source_id}"
        missing.append((label, target))
    if not missing:
        return body.rstrip()
    heading = "来源" if wiki_language == "zh-CN" else "Sources"
    lines = [f"- [{label}]({target})" for label, target in missing]
    return body.rstrip() + f"\n\n## {heading}\n\n" + "\n".join(lines) + "\n"


def validate_relative_page_path(path: str) -> str:
    relative = sanitize_relative_viking_path(path).strip("/")
    if not relative.lower().endswith(".md"):
        relative += ".md"
    segments = [segment for segment in relative.split("/") if segment]
    if not segments or any(segment.startswith(".") for segment in segments):
        raise ValueError(f"invalid Wiki page path: {path}")
    if segments[-1].lower() in _RESERVED_FILENAMES:
        raise ValueError(f"reserved Wiki page path: {path}")
    return "/".join(segments)


def validate_relative_file_path(path: str) -> str:
    relative = sanitize_relative_viking_path(path).strip("/")
    segments = relative.split("/")
    if (
        not relative
        or any(not segment or segment in {".", ".."} for segment in segments)
        or any(segment.startswith(".") for segment in segments)
    ):
        raise ValueError(f"invalid output file path: {path}")
    if segments[-1].lower() in _RESERVED_FILENAMES:
        raise ValueError(f"reserved output file path: {path}")
    return relative


def is_reserved_wiki_page_uri(uri: str) -> bool:
    return uri.rstrip("/").rsplit("/", 1)[-1].lower() in _RESERVED_FILENAMES


def _merge_stored_links(
    existing: list[dict[str, Any]], new_links: list[StoredLink]
) -> list[dict[str, Any]]:
    result = [dict(item) for item in existing if isinstance(item, dict)]
    seen = {
        (
            item.get("from_uri"),
            item.get("to_uri"),
            item.get("link_type"),
            item.get("weight"),
            item.get("match_text"),
            item.get("description"),
        )
        for item in result
    }
    for link in new_links:
        item = link.model_dump()
        key = (
            item.get("from_uri"),
            item.get("to_uri"),
            item.get("link_type"),
            item.get("weight"),
            item.get("match_text"),
            item.get("description"),
        )
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


class WikiRenderer:
    def __init__(self, limits: CompileLimits | None = None):
        self.limits = limits or CompileLimits()

    def render(
        self,
        *,
        bundle: WikiBundleDraft,
        target_uri: str,
        source_roots: Mapping[str, str],
        catalog_uris: set[str],
        existing_raw: Mapping[str, str],
        wiki_language: WikiLanguage | None = None,
        file_catalog_uris: set[str] | None = None,
        existing_bytes: Mapping[str, bytes] | None = None,
        file_payloads: list[bytes | None] | None = None,
    ) -> RenderedBundle:
        file_catalog_uris = set(catalog_uris) | set(file_catalog_uris or ())
        existing_bytes = existing_bytes or {}
        file_payloads = file_payloads or []
        if len(bundle.pages) > self.limits.output_pages:
            raise ValueError("Wiki bundle exceeds the page limit")
        if len(bundle.files) > self.limits.output_files:
            raise ValueError("Wiki bundle exceeds the file limit")
        if len(bundle.pages) + len(bundle.files) > self.limits.output_operations:
            raise ValueError("Wiki bundle exceeds the combined output operation limit")
        if not bundle.pages and bundle.links:
            raise ValueError("an empty Wiki bundle cannot contain links")
        target_type = context_type_for_uri(target_uri)
        memory_target = target_type == "memory"
        if memory_target and bundle.files:
            raise ValueError("raw artifact files are only supported for Resource targets")

        page_ids: set[int] = set()
        page_uris: dict[int, list[str]] = {}
        page_by_id = {}
        output_uris: set[str] = set()
        for page in bundle.pages:
            if page.page_id in page_ids:
                raise ValueError(f"duplicate page_id: {page.page_id}")
            page_ids.add(page.page_id)
            page_by_id[page.page_id] = page
            title = page.title.strip()
            page_type = page.page_type.strip()
            summary = page.summary.strip()
            if not title or not page_type or not summary:
                raise ValueError(f"page {page.page_id} title, page_type and summary are required")
            if "\n" in summary or "\r" in summary:
                raise ValueError(f"page {page.page_id} summary must be a single line")
            if _FRONTMATTER_RE.match(page.body_markdown.lstrip()):
                raise ValueError(f"page {page.page_id} body_markdown must not contain frontmatter")
            source_ids = list(
                dict.fromkeys(value.strip() for value in page.source_ids if value.strip())
            )
            if not source_ids or any(source_id not in source_roots for source_id in source_ids):
                raise ValueError(f"page {page.page_id} must reference valid source_ids")

            if page.update_uri:
                uri = page.update_uri.rstrip("/")
                if is_reserved_wiki_page_uri(uri):
                    raise ValueError(f"reserved Wiki page cannot be updated: {uri}")
                if uri not in catalog_uris:
                    raise ValueError(f"update_uri is not in the target catalog: {uri}")
                if page.path_hint:
                    raise ValueError("path_hint is not allowed with update_uri")
                if uri not in existing_raw:
                    raise ValueError(f"raw content was not loaded for update_uri: {uri}")
            else:
                hint = page.path_hint or wiki_page_path_from_title(title)
                relative = validate_relative_page_path(hint)
                uri = safe_join_viking_uri(target_uri, relative).rstrip("/")
                if uri in file_catalog_uris:
                    raise ValueError(f"Wiki page already exists; use update_uri: {uri}")
            if uri in output_uris:
                raise ValueError(f"duplicate final Wiki path: {uri}")
            output_uris.add(uri)
            page_uris[page.page_id] = [uri]

        file_uris: list[str] = []
        for index, file in enumerate(bundle.files):
            if file.update_uri:
                uri = validate_safe_viking_uri_path(file.update_uri).rstrip("/")
                if is_reserved_wiki_page_uri(uri):
                    raise ValueError(f"reserved output file cannot be updated: {uri}")
                if uri not in file_catalog_uris:
                    raise ValueError(f"file update_uri is not in the target catalog: {uri}")
                if uri not in existing_bytes:
                    raise ValueError(f"raw bytes were not loaded for file update_uri: {uri}")
            else:
                relative = validate_relative_file_path(file.path or "")
                uri = safe_join_viking_uri(target_uri, relative).rstrip("/")
                if uri in file_catalog_uris:
                    raise ValueError(f"output file already exists; use update_uri: {uri}")
            if uri in output_uris:
                raise ValueError(f"duplicate final output path: {uri}")
            output_uris.add(uri)
            file_uris.append(uri)

            if file.workspace_path is not None and (
                index >= len(file_payloads) or file_payloads[index] is None
            ):
                raise ValueError(f"workspace payload was not loaded for file {index}")

        for link in bundle.links:
            if link.f is None or link.t is None or link.f == link.t:
                raise ValueError("WikiLink endpoints must be non-null and non-self")
            source_page = page_by_id.get(link.f)
            if source_page is None or link.t not in page_by_id:
                raise ValueError(f"WikiLink references an unknown page_id: f={link.f}, t={link.t}")
            if not link.match_text:
                raise ValueError("WikiLink match_text is required")
            if not LinkRenderer.can_render_link(
                source_page.body_markdown,
                link.match_text,
                page_uris[link.f][0],
                page_uris[link.t][0],
            ):
                raise ValueError(
                    f"WikiLink match_text is not a satisfiable body anchor: {link.match_text!r}"
                )

        resolved_links = resolve_wiki_links(bundle.links, page_uris, strict=True)
        mention_targets = (
            _wiki_mention_targets(set(existing_raw) | {uris[0] for uris in page_uris.values()})
            if not memory_target and bundle.pages
            else {}
        )
        result = RenderedBundle()
        total_bytes = 0
        for page in bundle.pages:
            uri = page_uris[page.page_id][0]
            result.wiki_uris.append(uri)
            is_update = page.update_uri is not None
            old_raw = existing_raw.get(uri, "")
            if memory_target and is_update:
                old_memory = MemoryFileUtils.read(old_raw, uri=uri)
                old_visible = old_memory.content
            else:
                old_memory = None
                old_visible = old_raw
            old_frontmatter, _ = _split_frontmatter(old_visible)

            outgoing = (
                [link for link in resolved_links if link.from_uri == uri] if memory_target else []
            )
            incoming = (
                [link for link in resolved_links if link.to_uri == uri] if memory_target else []
            )
            if memory_target:
                rendered_body, rendered_count = LinkRenderer.render_links_with_count(
                    page.body_markdown.strip(),
                    uri,
                    [link.model_dump() for link in outgoing],
                )
            else:
                rendered_body = page.body_markdown.strip()
                rendered_count = 0
            result.link_count += rendered_count
            rendered_body = _linkify_source_uris(rendered_body, source_roots)
            source_ids = list(
                dict.fromkeys(value.strip() for value in page.source_ids if value.strip())
            )
            rendered_body = _render_source_fallback(
                rendered_body,
                source_ids=source_ids,
                source_roots=source_roots,
                wiki_language=wiki_language,
            )
            visible = (
                _frontmatter(
                    old=old_frontmatter,
                    page_type=page.page_type.strip(),
                    title=page.title.strip(),
                    summary=page.summary.strip(),
                    tags=page.tags,
                )
                + rendered_body
            )

            if not memory_target:
                visible, automatic_count = _link_wiki_mentions(
                    visible,
                    source_uri=uri,
                    targets=mention_targets,
                )
                result.link_count += automatic_count

            if memory_target:
                mf = old_memory or MemoryFile(uri=uri)
                mf.uri = uri
                mf.content = visible
                mf.extra_fields["category"] = page.page_type.strip()
                mf.extra_fields["version"] = (
                    int(mf.extra_fields.get("version", 1) or 1) if old_memory else 1
                )
                mf.links = _merge_stored_links(mf.links, outgoing)
                mf.backlinks = _merge_stored_links(mf.backlinks, incoming)
                sync_memory_resource_refs(mf, source="compile")
                candidate = MemoryFileUtils.write(mf, render_links=False)
                if old_memory is not None and candidate != old_raw:
                    mf.extra_fields["version"] = next_memory_version(old_memory)
                    candidate = MemoryFileUtils.write(mf, render_links=False)
            else:
                candidate = visible

            total_bytes += len(candidate.encode("utf-8"))
            if total_bytes > self.limits.output_total_bytes:
                raise ValueError("Wiki bundle exceeds the final content size limit")
            if candidate == old_raw:
                result.unchanged.append(uri)
                continue
            if is_update:
                result.updated.append(uri)
            else:
                result.created.append(uri)
            result.operations.append({"uri": uri, "content": candidate, "mode": "upsert"})

        if not memory_target and bundle.pages:
            for uri, old_raw in sorted(existing_raw.items()):
                if uri in output_uris:
                    continue
                candidate, automatic_count = _link_wiki_mentions(
                    old_raw,
                    source_uri=uri,
                    targets=mention_targets,
                )
                if candidate == old_raw:
                    continue
                result.link_count += automatic_count
                total_bytes += len(candidate.encode("utf-8"))
                if total_bytes > self.limits.output_total_bytes:
                    raise ValueError("Wiki bundle exceeds the final content size limit")
                result.updated.append(uri)
                result.wiki_uris.append(uri)
                result.operations.append(
                    {
                        "uri": uri,
                        "content": candidate,
                        "mode": "upsert",
                    }
                )
            if len(result.created) + len(result.updated) > self.limits.output_pages:
                raise ValueError("Wiki mention linking exceeds the page limit")

        for index, file in enumerate(bundle.files):
            uri = file_uris[index]
            if file.content is not None:
                candidate = file.content.encode("utf-8")
                operation_content = {"content": file.content}
            else:
                candidate = file_payloads[index]
                assert candidate is not None
                operation_content = {"content_base64": base64.b64encode(candidate).decode("ascii")}

            total_bytes += len(candidate)
            if total_bytes > self.limits.output_total_bytes:
                raise ValueError("Wiki bundle exceeds the final content size limit")
            if target_type == "resource":
                page_type = validate_declared_okf_markdown(uri, candidate)
                if page_type is not None:
                    result.wiki_uris.append(uri)
                if file.update_uri and uri in catalog_uris and page_type is None:
                    raise ValueError(
                        "an existing Wiki page updated as a raw file must retain "
                        "valid OKF frontmatter with a non-empty type"
                    )

            is_update = file.update_uri is not None
            old = existing_bytes.get(uri)
            if old is not None and candidate == old:
                result.unchanged.append(uri)
                continue
            if is_update:
                assert old is not None
                result.updated.append(uri)
            else:
                result.created.append(uri)
            result.operations.append({"uri": uri, **operation_content, "mode": "upsert"})
        if len(result.operations) > self.limits.output_operations:
            raise ValueError("Wiki bundle exceeds the combined output operation limit")
        return result


__all__ = [
    "FinalizedCheckout",
    "RenderedBundle",
    "WikiRenderer",
    "finalize_resource_checkout",
    "has_unclosed_frontmatter",
    "extract_okf_source_resources",
    "strip_okf_frontmatter",
    "is_reserved_wiki_page_uri",
    "validate_declared_okf_markdown",
    "validate_relative_file_path",
    "validate_relative_page_path",
    "wiki_page_path_from_title",
]

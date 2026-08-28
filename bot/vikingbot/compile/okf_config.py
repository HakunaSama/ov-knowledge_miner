"""External OKF contract used by VikingBot Compile resource checkouts."""

from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

import yaml

DEFAULT_OKF_CONFIG_NAME = "OKF_CONFIG.yaml"
MAX_OKF_CONFIG_BYTES = 256 * 1024


@dataclass(frozen=True, slots=True)
class OKFPathRule:
    pattern: str
    page_type: str


@dataclass(frozen=True, slots=True)
class OKFWikiLinkConfig:
    enabled: bool = True
    auto_link: bool = True
    catalog_only: bool = True
    first_occurrence_per_paragraph: bool = True
    exclude: tuple[str, ...] = ("headings", "tables", "code")


@dataclass(frozen=True, slots=True)
class OKFViewGroup:
    id: str
    title: str
    description: str
    tag: str
    path: tuple["OKFViewPathSegment", ...] = ()


@dataclass(frozen=True, slots=True)
class OKFViewPathSegment:
    id: str
    title: str
    description: str

    def public_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
        }


@dataclass(frozen=True, slots=True)
class OKFView:
    id: str
    title: str
    description: str
    tag_prefix: str
    selection: Literal["one_or_more", "exactly_one"]
    groups: tuple[OKFViewGroup, ...]

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "selection": self.selection,
            "groups": [
                {
                    "id": group.id,
                    "title": group.title,
                    "description": group.description,
                    "tag": group.tag,
                    "path": [segment.public_dict() for segment in group.path],
                }
                for group in self.groups
            ],
        }


@dataclass(frozen=True, slots=True)
class OKFMainView:
    single_source_of_truth: bool
    root_path: str
    facet_categories: tuple[str, ...]
    path_structure: tuple[Literal["facet", "route", "meta_id", "filename"], ...]
    exempt_paths: tuple[str, ...]
    directory_routes: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    meta_knowledge: "OKFMetaKnowledgeConfig | None" = None
    derived_views_include_exempt: bool = False

    def public_dict(self) -> dict[str, Any]:
        return {
            "single_source_of_truth": self.single_source_of_truth,
            "root_path": self.root_path,
            "facet_categories": list(self.facet_categories),
            "path_structure": list(self.path_structure),
            "directory_routes": {
                facet: list(routes) for facet, routes in self.directory_routes.items()
            },
            "exempt_paths": list(self.exempt_paths),
            "derived_views_include_exempt": self.derived_views_include_exempt,
            "meta_knowledge": (
                self.meta_knowledge.public_dict() if self.meta_knowledge is not None else None
            ),
        }


@dataclass(frozen=True, slots=True)
class OKFMetaKnowledgeConfig:
    """Contract for one meta-knowledge unit represented by a facet page set."""

    group_by: Literal["frontmatter_field"]
    id_field: str
    require_complete: bool
    shared_view_tags: bool
    require_id_directory: bool = False

    def public_dict(self) -> dict[str, Any]:
        return {
            "group_by": self.group_by,
            "id_field": self.id_field,
            "require_complete": self.require_complete,
            "shared_view_tags": self.shared_view_tags,
            "require_id_directory": self.require_id_directory,
        }


@dataclass(frozen=True, slots=True)
class OKFIntermediateConfig:
    required: bool
    root_path: str
    run_manifest: str
    evidence_ledger: str
    investigation_report: str
    questionnaire: str
    source_coverage: str
    candidate_knowledge: str
    readlist: str
    evidence_history: str

    @property
    def paths(self) -> tuple[str, ...]:
        return (
            f"{self.root_path}/{self.run_manifest}",
            f"{self.root_path}/{self.evidence_ledger}",
            f"{self.root_path}/{self.investigation_report}",
            f"{self.root_path}/{self.questionnaire}",
            f"{self.root_path}/{self.source_coverage}",
            f"{self.root_path}/{self.candidate_knowledge}",
            f"{self.root_path}/{self.readlist}",
            f"{self.root_path}/{self.evidence_history}",
        )

    def public_dict(self) -> dict[str, Any]:
        return {
            "required": self.required,
            "root_path": self.root_path,
            "run_manifest": self.run_manifest,
            "evidence_ledger": self.evidence_ledger,
            "investigation_report": self.investigation_report,
            "questionnaire": self.questionnaire,
            "source_coverage": self.source_coverage,
            "candidate_knowledge": self.candidate_knowledge,
            "readlist": self.readlist,
            "evidence_history": self.evidence_history,
        }


@dataclass(frozen=True, slots=True)
class OKFCrossKnowledgeConfig:
    frontmatter_field: str
    allowed_relations: tuple[str, ...]
    context_field: str
    require_body_link: bool


@dataclass(frozen=True, slots=True)
class OKFConfig:
    """Validated subset of the user-supplied OKF configuration contract."""

    version: str
    required_frontmatter: tuple[str, ...]
    allowed_types: tuple[str, ...]
    frontmatter_defaults: Mapping[str, Any] = field(default_factory=dict)
    source_fields: tuple[str, ...] = ("resource", "title", "author")
    source_allowed_kinds: tuple[str, ...] = ()
    source_require_input: bool = False
    source_require_intermediate: bool = False
    generated_fields: tuple[str, ...] = ("by", "at")
    generated_by_template: str = "{skill}/{model}"
    path_rules: tuple[OKFPathRule, ...] = ()
    wikilinks: OKFWikiLinkConfig = field(default_factory=OKFWikiLinkConfig)
    views: tuple[OKFView, ...] = ()
    main_view: OKFMainView | None = None
    intermediates: OKFIntermediateConfig | None = None
    cross_knowledge: OKFCrossKnowledgeConfig | None = None

    def expected_type(self, path: str) -> str | None:
        """Return the last matching path rule, allowing exact rules to override groups."""
        expected: str | None = None
        for rule in self.path_rules:
            if fnmatch.fnmatchcase(path, rule.pattern):
                expected = rule.page_type
        return expected


def _mapping(value: Any, *, field_name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f'OKF config field "{field_name}" must be a YAML object')
    return value


def _string_list(value: Any, *, field_name: str, allow_empty: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise ValueError(f'OKF config field "{field_name}" must be a YAML list')
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f'OKF config field "{field_name}" must contain non-empty strings')
        normalized = item.strip()
        if normalized not in result:
            result.append(normalized)
    if not result and not allow_empty:
        raise ValueError(f'OKF config field "{field_name}" must not be empty')
    return tuple(result)


_VIEW_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
_OKF_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9._/-]{0,127}$")
_RELATIVE_PATH_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._/-]{0,255}$")


def _required_string(value: Any, *, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'OKF config field "{field_name}" must be a non-empty string')
    return value.strip()


def _boolean(value: Any, *, field_name: str, default: bool) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError(f'OKF config field "{field_name}" must be a boolean')
    return value


def _relative_path(value: Any, *, field_name: str, allow_slash: bool = True) -> str:
    normalized = _required_string(value, field_name=field_name).strip("/")
    if (
        not _RELATIVE_PATH_RE.fullmatch(normalized)
        or any(segment in {"", ".", ".."} for segment in normalized.split("/"))
        or (not allow_slash and "/" in normalized)
    ):
        raise ValueError(f'OKF config field "{field_name}" must be a safe relative path')
    return normalized


def _parse_main_view(value: Any) -> OKFMainView | None:
    if value is None:
        return None
    view = _mapping(value, field_name="main_view")
    single_source = _boolean(
        view.get("single_source_of_truth"),
        field_name="main_view.single_source_of_truth",
        default=True,
    )
    root_path = _relative_path(view.get("root_path", "knowledge"), field_name="main_view.root_path")
    raw_facets = view.get("facet_categories")
    if raw_facets is None:
        # Parse the pre-1.1 name so an existing user contract fails only when its
        # structure is actually ambiguous. Public results always expose the new,
        # position-neutral name.
        raw_facets = view.get("leaf_categories")
    facet_categories = _string_list(raw_facets, field_name="main_view.facet_categories")
    if len(facet_categories) > 8 or any(
        not _VIEW_ID_RE.fullmatch(item) for item in facet_categories
    ):
        raise ValueError(
            'OKF config field "main_view.facet_categories" must contain at most 8 lowercase slugs'
        )
    raw_path_structure = view.get("path_structure")
    if (
        isinstance(raw_path_structure, list)
        and all(isinstance(item, str) for item in raw_path_structure)
        and len(raw_path_structure) != len(dict.fromkeys(raw_path_structure))
    ):
        raise ValueError('OKF config field "main_view.path_structure" must not repeat levels')
    path_structure = _string_list(raw_path_structure, field_name="main_view.path_structure")
    allowed_structure = {"facet", "route", "meta_id", "filename"}
    unknown_structure = sorted(set(path_structure) - allowed_structure)
    if unknown_structure:
        raise ValueError(
            'OKF config field "main_view.path_structure" contains unsupported levels: '
            + ", ".join(unknown_structure)
        )
    if path_structure[-1] != "filename":
        raise ValueError('OKF config field "main_view.path_structure" must end with filename')
    if "facet" not in path_structure:
        raise ValueError('OKF config field "main_view.path_structure" must contain facet')
    raw_directory_routes = view.get("directory_routes")
    directory_routes: dict[str, tuple[str, ...]] = {}
    if raw_directory_routes is not None:
        routes = _mapping(raw_directory_routes, field_name="main_view.directory_routes")
        unknown_facets = sorted(set(routes) - set(facet_categories))
        missing_facets = sorted(set(facet_categories) - set(routes))
        if unknown_facets or missing_facets:
            details: list[str] = []
            if missing_facets:
                details.append("missing " + ", ".join(missing_facets))
            if unknown_facets:
                details.append("unknown " + ", ".join(unknown_facets))
            raise ValueError(
                'OKF config field "main_view.directory_routes" must define exactly '
                "the configured facets: " + "; ".join(details)
            )
        for facet in facet_categories:
            raw_routes = _string_list(
                routes[facet], field_name=f"main_view.directory_routes.{facet}"
            )
            normalized_routes = tuple(
                _relative_path(
                    route,
                    field_name=f"main_view.directory_routes.{facet}[]",
                )
                for route in raw_routes
            )
            directory_routes[facet] = normalized_routes
    if "route" in path_structure and not directory_routes:
        raise ValueError(
            'OKF config field "main_view.path_structure" uses route but '
            "main_view.directory_routes is missing"
        )
    if directory_routes and "route" not in path_structure:
        raise ValueError(
            'OKF config field "main_view.path_structure" must contain route when '
            "main_view.directory_routes is configured"
        )
    if "route" in path_structure and tuple(path_structure) != (
        "facet",
        "route",
        "meta_id",
        "filename",
    ):
        raise ValueError(
            'OKF config field "main_view.path_structure" must be '
            "facet/route/meta_id/filename when directory routes are configured"
        )
    exempt_paths = _string_list(
        view.get("exempt_paths", ["index.md"]),
        field_name="main_view.exempt_paths",
        allow_empty=True,
    )
    exempt_paths = tuple(
        _relative_path(item, field_name="main_view.exempt_paths[]") for item in exempt_paths
    )
    meta_value = view.get("meta_knowledge")
    meta_knowledge: OKFMetaKnowledgeConfig | None = None
    if meta_value is not None:
        meta = _mapping(meta_value, field_name="main_view.meta_knowledge")
        group_by = meta.get("group_by", "frontmatter_field")
        if group_by != "frontmatter_field":
            raise ValueError(
                'OKF config field "main_view.meta_knowledge.group_by" must be frontmatter_field'
            )
        id_field = meta.get("id_field", "meta_id")
        if not isinstance(id_field, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", id_field):
            raise ValueError(
                'OKF config field "main_view.meta_knowledge.id_field" must be a lowercase slug'
            )
        meta_knowledge = OKFMetaKnowledgeConfig(
            group_by="frontmatter_field",
            id_field=id_field,
            require_complete=_boolean(
                meta.get("require_complete"),
                field_name="main_view.meta_knowledge.require_complete",
                default=True,
            ),
            shared_view_tags=_boolean(
                meta.get("shared_view_tags"),
                field_name="main_view.meta_knowledge.shared_view_tags",
                default=True,
            ),
            require_id_directory=_boolean(
                meta.get("require_id_directory"),
                field_name="main_view.meta_knowledge.require_id_directory",
                default=False,
            ),
        )
        if "meta_id" not in path_structure:
            raise ValueError(
                'OKF config field "main_view.path_structure" must contain meta_id when '
                "main_view.meta_knowledge is configured"
            )
    elif "meta_id" in path_structure:
        raise ValueError(
            'OKF config field "main_view.path_structure" cannot contain meta_id without '
            "main_view.meta_knowledge"
        )
    return OKFMainView(
        single_source_of_truth=single_source,
        root_path=root_path,
        facet_categories=facet_categories,
        path_structure=path_structure,
        directory_routes=directory_routes,
        exempt_paths=exempt_paths,
        meta_knowledge=meta_knowledge,
        derived_views_include_exempt=_boolean(
            view.get("derived_views_include_exempt"),
            field_name="main_view.derived_views_include_exempt",
            default=False,
        ),
    )


def _parse_intermediates(value: Any) -> OKFIntermediateConfig | None:
    if value is None:
        return None
    config = _mapping(value, field_name="intermediates")
    result = OKFIntermediateConfig(
        required=_boolean(
            config.get("required"), field_name="intermediates.required", default=True
        ),
        root_path=_relative_path(
            config.get("root_path", "_mining"), field_name="intermediates.root_path"
        ),
        run_manifest=_relative_path(
            config.get("run_manifest", "run-manifest.json"),
            field_name="intermediates.run_manifest",
            allow_slash=False,
        ),
        evidence_ledger=_relative_path(
            config.get("evidence_ledger", "evidence-ledger.json"),
            field_name="intermediates.evidence_ledger",
            allow_slash=False,
        ),
        investigation_report=_relative_path(
            config.get("investigation_report", "investigation-report.json"),
            field_name="intermediates.investigation_report",
            allow_slash=False,
        ),
        questionnaire=_relative_path(
            config.get("questionnaire", "questionnaire.json"),
            field_name="intermediates.questionnaire",
            allow_slash=False,
        ),
        source_coverage=_relative_path(
            config.get("source_coverage", "source-coverage.json"),
            field_name="intermediates.source_coverage",
            allow_slash=False,
        ),
        candidate_knowledge=_relative_path(
            config.get("candidate_knowledge", "candidate-knowledge.json"),
            field_name="intermediates.candidate_knowledge",
            allow_slash=False,
        ),
        readlist=_relative_path(
            config.get("readlist", "readlist.json"),
            field_name="intermediates.readlist",
            allow_slash=False,
        ),
        evidence_history=_relative_path(
            config.get("evidence_history", "evidence-history.json"),
            field_name="intermediates.evidence_history",
            allow_slash=False,
        ),
    )
    if len(set(result.paths)) != len(result.paths):
        raise ValueError("OKF config intermediates artifact paths must be unique")
    if any(not path.casefold().endswith(".json") for path in result.paths):
        raise ValueError("OKF config intermediates artifacts must use .json filenames")
    return result


def _parse_cross_knowledge(value: Any) -> OKFCrossKnowledgeConfig | None:
    if value is None:
        return None
    config = _mapping(value, field_name="cross_knowledge")
    frontmatter_field = _required_string(
        config.get("frontmatter_field", "knowledge_links"),
        field_name="cross_knowledge.frontmatter_field",
    )
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", frontmatter_field):
        raise ValueError(
            'OKF config field "cross_knowledge.frontmatter_field" must be a lowercase key'
        )
    relations = _string_list(
        config.get("allowed_relations", ["related", "depends_on", "derived_from"]),
        field_name="cross_knowledge.allowed_relations",
    )
    if any(not _VIEW_ID_RE.fullmatch(relation) for relation in relations):
        raise ValueError(
            'OKF config field "cross_knowledge.allowed_relations" must contain lowercase slugs'
        )
    context_field = _required_string(
        config.get("context_field", "context"),
        field_name="cross_knowledge.context_field",
    )
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", context_field):
        raise ValueError('OKF config field "cross_knowledge.context_field" must be a lowercase key')
    return OKFCrossKnowledgeConfig(
        frontmatter_field=frontmatter_field,
        allowed_relations=relations,
        context_field=context_field,
        require_body_link=_boolean(
            config.get("require_body_link"),
            field_name="cross_knowledge.require_body_link",
            default=False,
        ),
    )


def _parse_view_groups(
    value: Any,
    *,
    path: str,
    tag_prefix: str,
    seen_tags: set[str],
) -> tuple[OKFViewGroup, ...]:
    leaves: list[OKFViewGroup] = []

    def visit(
        raw_groups: Any,
        *,
        group_path: str,
        ancestors: tuple[OKFViewPathSegment, ...],
    ) -> None:
        if not isinstance(raw_groups, list) or not raw_groups:
            raise ValueError(f'OKF config field "{group_path}" must be a non-empty YAML list')
        seen_sibling_ids: set[str] = set()
        for group_index, raw_group in enumerate(raw_groups):
            item_path = f"{group_path}[{group_index}]"
            group = _mapping(raw_group, field_name=item_path)
            group_id = _required_string(group.get("id"), field_name=f"{item_path}.id")
            if not _VIEW_ID_RE.fullmatch(group_id):
                raise ValueError(
                    f'OKF config field "{item_path}.id" must use lowercase letters, '
                    "digits, and hyphens"
                )
            if group_id in seen_sibling_ids:
                raise ValueError(
                    f'OKF config field "{group_path}" contains duplicate id: {group_id}'
                )
            seen_sibling_ids.add(group_id)
            title = _required_string(group.get("title"), field_name=f"{item_path}.title")
            description = _required_string(
                group.get("description"), field_name=f"{item_path}.description"
            )
            segment = OKFViewPathSegment(
                id=group_id,
                title=title,
                description=description,
            )
            group_hierarchy = (*ancestors, segment)
            children = group.get("groups")
            if children is not None:
                if group.get("tag") is not None:
                    raise ValueError(
                        f'OKF config field "{item_path}.tag" is only valid on a leaf group'
                    )
                visit(
                    children,
                    group_path=f"{item_path}.groups",
                    ancestors=group_hierarchy,
                )
                continue

            full_id = "/".join(item.id for item in group_hierarchy)
            tag = group.get("tag", f"{tag_prefix}{full_id}")
            tag = _required_string(tag, field_name=f"{item_path}.tag")
            if not tag.startswith(tag_prefix) or not _OKF_TAG_RE.fullmatch(tag):
                raise ValueError(
                    f'OKF config field "{item_path}.tag" must be a valid OKF tag under '
                    f'prefix "{tag_prefix}"'
                )
            if tag in seen_tags:
                raise ValueError(f"OKF config views contain duplicate tag: {tag}")
            seen_tags.add(tag)
            leaves.append(
                OKFViewGroup(
                    id=full_id,
                    title=title,
                    description=description,
                    tag=tag,
                    path=group_hierarchy,
                )
            )

    visit(value, group_path=path, ancestors=())
    if len(leaves) > 32:
        raise ValueError(f'OKF config field "{path}" supports at most 32 leaf groups')
    return tuple(leaves)


def _parse_views(value: Any) -> tuple[OKFView, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError('OKF config field "views" must be a YAML list')
    if len(value) > 8:
        raise ValueError('OKF config field "views" supports at most 8 views')

    views: list[OKFView] = []
    seen_view_ids: set[str] = set()
    seen_tags: set[str] = set()
    for view_index, raw_view in enumerate(value):
        path = f"views[{view_index}]"
        view = _mapping(raw_view, field_name=path)
        view_id = _required_string(view.get("id"), field_name=f"{path}.id")
        if not _VIEW_ID_RE.fullmatch(view_id):
            raise ValueError(
                f'OKF config field "{path}.id" must use lowercase letters, digits, and hyphens'
            )
        if view_id in seen_view_ids:
            raise ValueError(f'OKF config field "views" contains duplicate id: {view_id}')
        seen_view_ids.add(view_id)
        title = _required_string(view.get("title"), field_name=f"{path}.title")
        description = _required_string(view.get("description"), field_name=f"{path}.description")
        tag_prefix = view.get("tag_prefix", f"view/{view_id}/")
        tag_prefix = _required_string(tag_prefix, field_name=f"{path}.tag_prefix")
        if not tag_prefix.endswith("/") or not _OKF_TAG_RE.fullmatch(tag_prefix[:-1]):
            raise ValueError(
                f'OKF config field "{path}.tag_prefix" must be an OKF tag prefix ending in /'
            )
        selection = view.get("selection", "one_or_more")
        if selection not in {"one_or_more", "exactly_one"}:
            raise ValueError(
                f'OKF config field "{path}.selection" must be one_or_more or exactly_one'
            )
        groups = _parse_view_groups(
            view.get("groups"),
            path=f"{path}.groups",
            tag_prefix=tag_prefix,
            seen_tags=seen_tags,
        )
        views.append(
            OKFView(
                id=view_id,
                title=title,
                description=description,
                tag_prefix=tag_prefix,
                selection=selection,
                groups=groups,
            )
        )
    return tuple(views)


def parse_okf_config(content: str, *, source: str = DEFAULT_OKF_CONFIG_NAME) -> OKFConfig:
    """Parse and validate one external YAML OKF contract."""
    if len(content.encode("utf-8")) > MAX_OKF_CONFIG_BYTES:
        raise ValueError(f'OKF config "{source}" exceeds the {MAX_OKF_CONFIG_BYTES}-byte limit')
    try:
        raw = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ValueError(f'OKF config "{source}" is not valid YAML') from exc
    root = _mapping(raw, field_name="root")
    version = root.get("version")
    if not isinstance(version, (str, int, float)) or not str(version).strip():
        raise ValueError('OKF config field "version" must be a non-empty scalar')

    frontmatter = _mapping(root.get("frontmatter"), field_name="frontmatter")
    required = _string_list(frontmatter.get("required"), field_name="frontmatter.required")
    allowed_types = _string_list(
        frontmatter.get("allowed_types"), field_name="frontmatter.allowed_types"
    )
    if "type" not in required:
        raise ValueError('OKF config "frontmatter.required" must contain "type"')
    defaults = frontmatter.get("defaults") or {}
    defaults = _mapping(defaults, field_name="frontmatter.defaults")

    sources = _mapping(frontmatter.get("sources") or {}, field_name="frontmatter.sources")
    source_fields = _string_list(
        sources.get("required_fields", ["resource", "title", "author"]),
        field_name="frontmatter.sources.required_fields",
        allow_empty=True,
    )
    source_allowed_kinds = _string_list(
        sources.get("allowed_kinds", []),
        field_name="frontmatter.sources.allowed_kinds",
        allow_empty=True,
    )
    if source_allowed_kinds and "kind" not in source_fields:
        raise ValueError(
            'OKF config "frontmatter.sources.required_fields" must contain "kind" when '
            "allowed_kinds is configured"
        )
    if any(not _VIEW_ID_RE.fullmatch(kind) for kind in source_allowed_kinds):
        raise ValueError(
            'OKF config field "frontmatter.sources.allowed_kinds" must contain lowercase slugs'
        )
    source_require_input = _boolean(
        sources.get("require_input"),
        field_name="frontmatter.sources.require_input",
        default=False,
    )
    source_require_intermediate = _boolean(
        sources.get("require_intermediate"),
        field_name="frontmatter.sources.require_intermediate",
        default=False,
    )
    if (source_require_input or source_require_intermediate) and not source_allowed_kinds:
        raise ValueError(
            "OKF config source kind requirements need frontmatter.sources.allowed_kinds"
        )
    generated = _mapping(frontmatter.get("generated") or {}, field_name="frontmatter.generated")
    generated_fields = _string_list(
        generated.get("required_fields", ["by", "at"]),
        field_name="frontmatter.generated.required_fields",
        allow_empty=True,
    )
    generated_by_template = generated.get("by_template", "{skill}/{model}")
    if not isinstance(generated_by_template, str) or not generated_by_template.strip():
        raise ValueError(
            'OKF config field "frontmatter.generated.by_template" must be a non-empty string'
        )

    raw_rules = root.get("path_types")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ValueError('OKF config field "path_types" must be a non-empty YAML list')
    path_rules: list[OKFPathRule] = []
    for index, item in enumerate(raw_rules):
        rule = _mapping(item, field_name=f"path_types[{index}]")
        pattern = rule.get("pattern")
        page_type = rule.get("type")
        if not isinstance(pattern, str) or not pattern.strip():
            raise ValueError(f'OKF config field "path_types[{index}].pattern" is required')
        if not isinstance(page_type, str) or page_type.strip() not in allowed_types:
            raise ValueError(
                f'OKF config field "path_types[{index}].type" must be one of: '
                + ", ".join(allowed_types)
            )
        path_rules.append(OKFPathRule(pattern.strip(), page_type.strip()))

    raw_wikilinks = _mapping(root.get("wikilinks") or {}, field_name="wikilinks")
    syntax = raw_wikilinks.get("syntax", "double-bracket")
    if syntax != "double-bracket":
        raise ValueError("OKF config currently supports only wikilinks.syntax: double-bracket")
    exclude = _string_list(
        raw_wikilinks.get("exclude", ["headings", "tables", "code"]),
        field_name="wikilinks.exclude",
        allow_empty=True,
    )
    unsupported = set(exclude) - {"headings", "tables", "code"}
    if unsupported:
        raise ValueError(
            "OKF config wikilinks.exclude contains unsupported values: "
            + ", ".join(sorted(unsupported))
        )

    def boolean(name: str, default: bool) -> bool:
        value = raw_wikilinks.get(name, default)
        if not isinstance(value, bool):
            raise ValueError(f'OKF config field "wikilinks.{name}" must be a boolean')
        return value

    return OKFConfig(
        version=str(version).strip(),
        required_frontmatter=required,
        allowed_types=allowed_types,
        frontmatter_defaults=dict(defaults),
        source_fields=source_fields,
        source_allowed_kinds=source_allowed_kinds,
        source_require_input=source_require_input,
        source_require_intermediate=source_require_intermediate,
        generated_fields=generated_fields,
        generated_by_template=generated_by_template.strip(),
        path_rules=tuple(path_rules),
        wikilinks=OKFWikiLinkConfig(
            enabled=boolean("enabled", True),
            auto_link=boolean("auto_link", True),
            catalog_only=boolean("catalog_only", True),
            first_occurrence_per_paragraph=boolean("first_occurrence_per_paragraph", True),
            exclude=exclude,
        ),
        views=_parse_views(root.get("views")),
        main_view=_parse_main_view(root.get("main_view")),
        intermediates=_parse_intermediates(root.get("intermediates")),
        cross_knowledge=_parse_cross_knowledge(root.get("cross_knowledge")),
    )


__all__ = [
    "DEFAULT_OKF_CONFIG_NAME",
    "MAX_OKF_CONFIG_BYTES",
    "OKFConfig",
    "OKFCrossKnowledgeConfig",
    "OKFIntermediateConfig",
    "OKFMainView",
    "OKFMetaKnowledgeConfig",
    "OKFPathRule",
    "OKFView",
    "OKFViewGroup",
    "OKFWikiLinkConfig",
    "parse_okf_config",
]

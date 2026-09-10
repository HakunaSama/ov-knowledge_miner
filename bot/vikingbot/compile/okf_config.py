"""External OKF contract used by VikingBot Compile resource checkouts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from typing import Any, Literal, Mapping

import yaml

DEFAULT_OKF_CONFIG_NAME = "OKF_CONFIG.yaml"
MAX_OKF_CONFIG_BYTES = 256 * 1024


@dataclass(frozen=True, slots=True)
class OKFMarkdownLinkConfig:
    enabled: bool = True
    auto_link: bool = True
    catalog_only: bool = True
    first_occurrence_per_paragraph: bool = True
    exclude: tuple[str, ...] = ("headings", "tables", "code")


@dataclass(frozen=True, slots=True)
class OKFNamedCategory:
    id: str
    title: str
    description: str

    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
        }


@dataclass(frozen=True, slots=True)
class OKFBusinessDomain:
    id: str
    title: str
    description: str
    subdomains: tuple[OKFNamedCategory, ...]


    def public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "subdomains": [item.public_dict() for item in self.subdomains],
        }


@dataclass(frozen=True, slots=True)
class OKFNavigationConfig:
    filename: str
    type: str

    def public_dict(self) -> dict[str, str]:
        return {"filename": self.filename, "type": self.type}


@dataclass(frozen=True, slots=True)
class OKFMainView:
    root_path: str
    path_structure: tuple[
        Literal["page_role", "business_domain", "subdomain", "subject_path", "filename"],
        ...,
    ]
    page_roles: tuple[OKFNamedCategory, ...]
    business_domains: tuple[OKFBusinessDomain, ...]
    navigation: OKFNavigationConfig | None
    exempt_paths: tuple[str, ...]

    def is_exempt(self, path: str) -> bool:
        prefix = f"{self.root_path}/"
        if not path.startswith(prefix):
            return False
        relative = path[len(prefix) :]
        return any(
            fnmatchcase(relative, pattern)
            or (pattern.startswith("**/") and fnmatchcase(relative, pattern[3:]))
            for pattern in self.exempt_paths
        )

    def public_dict(self) -> dict[str, Any]:
        return {
            "root_path": self.root_path,
            "path_structure": list(self.path_structure),
            "page_roles": [item.public_dict() for item in self.page_roles],
            "business_domains": [item.public_dict() for item in self.business_domains],
            "navigation": self.navigation.public_dict() if self.navigation is not None else None,
            "exempt_paths": list(self.exempt_paths),
        }


@dataclass(frozen=True, slots=True)
class OKFIntermediateConfig:
    required: bool
    root_path: str
    run_manifest: str
    evidence_ledger: str
    investigation_report: str
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
            "source_coverage": self.source_coverage,
            "candidate_knowledge": self.candidate_knowledge,
            "readlist": self.readlist,
            "evidence_history": self.evidence_history,
        }


@dataclass(frozen=True, slots=True)
class OKFConfig:
    """Validated subset of the user-supplied OKF configuration contract."""

    version: str
    required_frontmatter: tuple[str, ...]
    allowed_types: tuple[str, ...]
    source_fields: tuple[str, ...] = ("resource", "title")
    generated_fields: tuple[str, ...] = ("by", "at")
    generated_by_template: str = "{skill}/{model}"
    markdown_links: OKFMarkdownLinkConfig = field(default_factory=OKFMarkdownLinkConfig)
    main_view: OKFMainView | None = None
    intermediates: OKFIntermediateConfig | None = None

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


def _relative_path_pattern(value: Any, *, field_name: str) -> str:
    normalized = _required_string(value, field_name=field_name).strip("/")
    segments = normalized.split("/")
    if any(
        segment in {"", ".", ".."}
        or (segment not in {"*", "**"} and not _RELATIVE_PATH_RE.fullmatch(segment))
        for segment in segments
    ):
        raise ValueError(
            f'OKF config field "{field_name}" must be a safe relative path or */** pattern'
        )
    return normalized


def _parse_named_categories(value: Any, *, field_name: str) -> tuple[OKFNamedCategory, ...]:
    if not isinstance(value, list) or not value:
        raise ValueError(f'OKF config field "{field_name}" must be a non-empty YAML list')
    result: list[OKFNamedCategory] = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        item_path = f"{field_name}[{index}]"
        item = _mapping(raw, field_name=item_path)
        item_id = _required_string(item.get("id"), field_name=f"{item_path}.id")
        if not _VIEW_ID_RE.fullmatch(item_id):
            raise ValueError(
                f'OKF config field "{item_path}.id" must use lowercase letters, '
                "digits, and hyphens"
            )
        if item_id in seen:
            raise ValueError(f'OKF config field "{field_name}" contains duplicate id: {item_id}')
        seen.add(item_id)
        title = _required_string(item.get("title"), field_name=f"{item_path}.title")
        description = item.get("description", title)
        description = _required_string(description, field_name=f"{item_path}.description")
        result.append(OKFNamedCategory(id=item_id, title=title, description=description))
    return tuple(result)


def _parse_business_domains(value: Any) -> tuple[OKFBusinessDomain, ...]:
    if not isinstance(value, list) or not value:
        raise ValueError(
            'OKF config field "main_view.business_domains" must be a non-empty YAML list'
        )
    result: list[OKFBusinessDomain] = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        item_path = f"main_view.business_domains[{index}]"
        item = _mapping(raw, field_name=item_path)
        domain_id = _required_string(item.get("id"), field_name=f"{item_path}.id")
        if not _VIEW_ID_RE.fullmatch(domain_id):
            raise ValueError(
                f'OKF config field "{item_path}.id" must use lowercase letters, '
                "digits, and hyphens"
            )
        if domain_id in seen:
            raise ValueError(
                f'OKF config field "main_view.business_domains" contains duplicate id: '
                f"{domain_id}"
            )
        seen.add(domain_id)
        title = _required_string(item.get("title"), field_name=f"{item_path}.title")
        description = _required_string(
            item.get("description", title), field_name=f"{item_path}.description"
        )
        subdomains = _parse_named_categories(
            item.get("subdomains"), field_name=f"{item_path}.subdomains"
        )
        result.append(
            OKFBusinessDomain(
                id=domain_id,
                title=title,
                description=description,
                subdomains=subdomains,
            )
        )
    return tuple(result)


def _parse_main_view(value: Any) -> OKFMainView | None:
    if value is None:
        return None
    view = _mapping(value, field_name="main_view")
    legacy_fields = sorted(
        set(view)
        & {
            "facet_categories",
            "leaf_categories",
            "directory_routes",
            "meta_knowledge",
            "single_source_of_truth",
            "derived_views_include_exempt",
        }
    )
    if legacy_fields:
        raise ValueError(
            "OKF config main_view contains removed fields: "
            + ", ".join(legacy_fields)
        )
    root_path = _relative_path(
        view.get("root_path", "knowledge"), field_name="main_view.root_path"
    )
    raw_path_structure = view.get("path_structure")
    if (
        isinstance(raw_path_structure, list)
        and all(isinstance(item, str) for item in raw_path_structure)
        and len(raw_path_structure) != len(dict.fromkeys(raw_path_structure))
    ):
        raise ValueError('OKF config field "main_view.path_structure" must not repeat levels')
    path_structure = _string_list(raw_path_structure, field_name="main_view.path_structure")
    allowed_structure = {
        "page_role",
        "business_domain",
        "subdomain",
        "subject_path",
        "filename",
    }
    unknown_structure = sorted(set(path_structure) - allowed_structure)
    if unknown_structure:
        raise ValueError(
            'OKF config field "main_view.path_structure" contains unsupported levels: '
            + ", ".join(unknown_structure)
        )
    required_structure = {"page_role", "business_domain", "subdomain", "filename"}
    missing_structure = sorted(required_structure - set(path_structure))
    if missing_structure:
        raise ValueError(
            'OKF config field "main_view.path_structure" is missing required levels: '
            + ", ".join(missing_structure)
        )
    if path_structure[-1] != "filename":
        raise ValueError('OKF config field "main_view.path_structure" must end with filename')
    if "subject_path" in path_structure and path_structure[-2] != "subject_path":
        raise ValueError(
            'OKF config field "main_view.path_structure" must place subject_path immediately '
            "before filename"
        )
    page_roles = _parse_named_categories(
        view.get("page_roles"), field_name="main_view.page_roles"
    )
    business_domains = _parse_business_domains(view.get("business_domains"))
    navigation: OKFNavigationConfig | None = None
    if view.get("navigation") is not None:
        raw_navigation = _mapping(view.get("navigation"), field_name="main_view.navigation")
        navigation = OKFNavigationConfig(
            filename=_relative_path(
                raw_navigation.get("filename", "index.md"),
                field_name="main_view.navigation.filename",
                allow_slash=False,
            ),
            type=_required_string(
                raw_navigation.get("type", "index"),
                field_name="main_view.navigation.type",
            ),
        )
    exempt_paths = _string_list(
        view.get("exempt_paths", ["index.md"]),
        field_name="main_view.exempt_paths",
        allow_empty=True,
    )
    exempt_paths = tuple(
        _relative_path_pattern(item, field_name="main_view.exempt_paths[]")
        for item in exempt_paths
    )
    return OKFMainView(
        root_path=root_path,
        path_structure=path_structure,
        page_roles=page_roles,
        business_domains=business_domains,
        navigation=navigation,
        exempt_paths=exempt_paths,
    )


def _parse_intermediates(value: Any) -> OKFIntermediateConfig | None:
    if value is None:
        return None
    config = _mapping(value, field_name="intermediates")
    if "questionnaire" in config:
        raise ValueError('OKF config field "intermediates.questionnaire" was removed')
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


def parse_okf_config(content: str, *, source: str = DEFAULT_OKF_CONFIG_NAME) -> OKFConfig:
    """Parse and validate one external YAML OKF contract."""
    if len(content.encode("utf-8")) > MAX_OKF_CONFIG_BYTES:
        raise ValueError(f'OKF config "{source}" exceeds the {MAX_OKF_CONFIG_BYTES}-byte limit')
    try:
        raw = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ValueError(f'OKF config "{source}" is not valid YAML') from exc
    root = _mapping(raw, field_name="root")
    removed_root_fields = sorted(set(root) & {"views", "cross_knowledge"})
    if removed_root_fields:
        raise ValueError(
            "OKF config contains removed top-level fields: " + ", ".join(removed_root_fields)
        )
    if "wikilinks" in root:
        raise ValueError(
            'OKF config field "wikilinks" was removed; use "markdown_links" instead'
        )
    if "path_types" in root:
        raise ValueError(
            'OKF config field "path_types" was removed; a promoted candidate now declares one '
            "page_path and its kind must match that page's frontmatter type"
        )
    version = root.get("version")
    if not isinstance(version, (str, int, float)) or not str(version).strip():
        raise ValueError('OKF config field "version" must be a non-empty scalar')

    frontmatter = _mapping(root.get("frontmatter"), field_name="frontmatter")
    if "defaults" in frontmatter:
        raise ValueError('OKF config field "frontmatter.defaults" was removed')
    required = _string_list(frontmatter.get("required"), field_name="frontmatter.required")
    allowed_types = _string_list(
        frontmatter.get("allowed_types"), field_name="frontmatter.allowed_types"
    )
    if "type" not in required:
        raise ValueError('OKF config "frontmatter.required" must contain "type"')
    sources = _mapping(frontmatter.get("sources") or {}, field_name="frontmatter.sources")
    removed_source_fields = sorted(
        set(sources) & {"allowed_kinds", "require_input", "require_intermediate"}
    )
    if removed_source_fields:
        raise ValueError(
            "OKF config frontmatter.sources contains removed fields: "
            + ", ".join(removed_source_fields)
        )
    source_fields = _string_list(
        sources.get("required_fields", ["resource", "title"]),
        field_name="frontmatter.sources.required_fields",
        allow_empty=True,
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

    raw_markdown_links = _mapping(
        root.get("markdown_links") or {}, field_name="markdown_links"
    )
    exclude = _string_list(
        raw_markdown_links.get("exclude", ["headings", "tables", "code"]),
        field_name="markdown_links.exclude",
        allow_empty=True,
    )
    unsupported = set(exclude) - {"headings", "tables", "code"}
    if unsupported:
        raise ValueError(
            "OKF config markdown_links.exclude contains unsupported values: "
            + ", ".join(sorted(unsupported))
        )

    def boolean(name: str, default: bool) -> bool:
        value = raw_markdown_links.get(name, default)
        if not isinstance(value, bool):
            raise ValueError(f'OKF config field "markdown_links.{name}" must be a boolean')
        return value

    main_view = _parse_main_view(root.get("main_view"))
    if (
        main_view is not None
        and main_view.navigation is not None
        and main_view.navigation.type not in allowed_types
    ):
        raise ValueError(
            'OKF config field "main_view.navigation.type" must be listed in '
            '"frontmatter.allowed_types"'
        )

    return OKFConfig(
        version=str(version).strip(),
        required_frontmatter=required,
        allowed_types=allowed_types,
        source_fields=source_fields,
        generated_fields=generated_fields,
        generated_by_template=generated_by_template.strip(),
        markdown_links=OKFMarkdownLinkConfig(
            enabled=boolean("enabled", True),
            auto_link=boolean("auto_link", True),
            catalog_only=boolean("catalog_only", True),
            first_occurrence_per_paragraph=boolean("first_occurrence_per_paragraph", True),
            exclude=exclude,
        ),
        main_view=main_view,
        intermediates=_parse_intermediates(root.get("intermediates")),
    )


__all__ = [
    "DEFAULT_OKF_CONFIG_NAME",
    "MAX_OKF_CONFIG_BYTES",
    "OKFBusinessDomain",
    "OKFConfig",
    "OKFIntermediateConfig",
    "OKFMainView",
    "OKFMarkdownLinkConfig",
    "OKFNamedCategory",
    "OKFNavigationConfig",
    "parse_okf_config",
]

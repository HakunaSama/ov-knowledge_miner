#!/usr/bin/env python3
"""Check the structural boundary of a three-file workflow/business Skill split."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


REQUIRED_FILES = (
    "SKILL.md",
    "USER_PROFILE.md",
    "USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md",
)

PROCESS_PATTERNS = {
    "提交接口": re.compile(
        r"\b(?:submit_source_coverage|submit_candidate_knowledge|submit_wiki_bundle)\b",
        re.IGNORECASE,
    ),
    "审计产物路径": re.compile(
        r"(?:_mining/|source-coverage\.json|candidate-knowledge\.json|"
        r"evidence-ledger\.json|readlist\.json|evidence-history\.json)",
        re.IGNORECASE,
    ),
    "实现配置路径": re.compile(r"(?:compile_config/|_source-units\.json)", re.IGNORECASE),
}


def read_text(path: Path, errors: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{path.name}: 不是 UTF-8 文本")
    except OSError as exc:
        errors.append(f"{path.name}: 无法读取 ({exc})")
    return ""


def has_boundary_statement(text: str) -> bool:
    lowered = text.lower()
    fixed_boundary = any(
        term in lowered
        for term in ("cannot override", "does not define or override", "不能覆盖", "不得覆盖")
    )
    return fixed_boundary and "okf" in lowered


def check_frontmatter(text: str, errors: list[str]) -> None:
    if not text.startswith("---\n"):
        errors.append("SKILL.md: 缺少 YAML frontmatter")
        return
    end = text.find("\n---\n", 4)
    if end < 0:
        errors.append("SKILL.md: frontmatter 未闭合")
        return
    header = text[4:end]
    if not re.search(r"(?m)^name:\s*\S+", header):
        errors.append("SKILL.md: frontmatter 缺少 name")
    if not re.search(r"(?m)^description:\s*\S+", header):
        errors.append("SKILL.md: frontmatter 缺少 description")


def main() -> int:
    parser = argparse.ArgumentParser(description="验证 SKILL.md 与两个业务 Profile 的职责边界。")
    parser.add_argument("directory", type=Path, help="包含三个拆分文件的目录")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="将 Profile 中疑似流程实现内容的警告视为错误",
    )
    args = parser.parse_args()

    root = args.directory.expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if not root.is_dir():
        print(f"ERROR: 目录不存在: {root}")
        return 1

    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        errors.append("缺少文件: " + ", ".join(missing))

    texts = {
        name: read_text(root / name, errors)
        for name in REQUIRED_FILES
        if (root / name).is_file()
    }

    skill = texts.get("SKILL.md", "")
    default_profile = texts.get("USER_PROFILE.md", "")
    atomic_profile = texts.get("USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md", "")

    if skill:
        check_frontmatter(skill, errors)
        if "USER_PROFILE.md" not in skill:
            errors.append("SKILL.md: 没有声明加载 USER_PROFILE.md")
        if "OKF" not in skill.upper():
            warnings.append("SKILL.md: 未发现 OKF 加载或优先级说明")

    for filename, content in (
        ("USER_PROFILE.md", default_profile),
        ("USER_PROFILE_ATOMIC_ENTERPRISE_KNOWLEDGE.md", atomic_profile),
    ):
        if not content:
            continue
        if not has_boundary_statement(content):
            errors.append(f"{filename}: 缺少不能覆盖固定流程与 OKF 的边界声明")
        for label, pattern in PROCESS_PATTERNS.items():
            matches = sorted(set(match.group(0) for match in pattern.finditer(content)))
            if matches:
                warnings.append(f"{filename}: 疑似包含{label}: " + ", ".join(matches))

    if default_profile and atomic_profile:
        normalize = lambda value: re.sub(r"\s+", " ", value).strip().lower()
        if normalize(default_profile) == normalize(atomic_profile):
            warnings.append("两个 Profile 内容完全相同，候选 Profile 可能没有独立价值")

    if args.strict and warnings:
        errors.extend(f"严格模式: {warning}" for warning in warnings)

    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")

    if errors:
        print(f"FAIL: {len(errors)} 个错误，{len(warnings)} 个警告")
        return 1

    print(f"PASS: {root} 的三文件拆分结构通过检查")
    return 0


if __name__ == "__main__":
    sys.exit(main())

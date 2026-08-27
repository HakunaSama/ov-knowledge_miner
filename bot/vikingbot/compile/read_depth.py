"""Deterministic read-depth policy for materialized Compile source units."""

from __future__ import annotations


def required_probe_count(fragment_count: int) -> int:
    """Return an adaptive probe budget for one parsed upload-level source.

    Small sources are read completely. Larger parsed documents get progressively
    denser coverage so a long PDF cannot be declared inspected after the same
    eight reads used for a much shorter document.
    """
    if fragment_count <= 8:
        return max(fragment_count, 0)
    if fragment_count <= 24:
        return min(fragment_count, 12)
    if fragment_count <= 64:
        return 16
    return 24


def distributed_probe_indexes(fragment_count: int) -> list[int]:
    """Choose deterministic head/middle/tail-spanning fragment indexes."""
    probe_count = required_probe_count(fragment_count)
    if probe_count <= 0:
        return []
    if probe_count >= fragment_count:
        return list(range(fragment_count))
    indexes = [
        round(index * (fragment_count - 1) / (probe_count - 1))
        for index in range(probe_count)
    ]
    middle_index = fragment_count // 2
    if middle_index not in indexes:
        replace_at = min(
            range(1, len(indexes) - 1),
            key=lambda index: abs(indexes[index] - middle_index),
        )
        indexes[replace_at] = middle_index
    return sorted(set(indexes))


__all__ = ["distributed_probe_indexes", "required_probe_count"]

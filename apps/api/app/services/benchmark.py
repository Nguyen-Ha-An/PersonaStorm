"""Benchmark metrics (spec §8) — Python mirror of
apps/web/lib/server/engine/benchmark.ts.

Pure functions so the backtest gate (apps/api/tests/test_benchmark_backtest.py)
is deterministic and unit-testable independently of the data. The gate itself
runs the full blend path against committed recorded fixtures and applies
thresholds measured on this engine's output (see the gate module docstring).
"""

from __future__ import annotations


def outcome_rank(label: str) -> int:
    return 2 if label == "hit" else 1 if label == "moderate" else 0


def _rankdata(xs: list[float]) -> list[float]:
    """1-based ranks, averaging ties (SciPy's `rankdata(method="average")`)."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg_rank = (i + j) / 2 + 1  # average rank for ties, 1-based
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or len(a) < 2:
        return 0.0
    ra = _rankdata(a)
    rb = _rankdata(b)
    n = len(a)
    mean = (n + 1) / 2
    num = 0.0
    da = 0.0
    db = 0.0
    for i in range(n):
        num += (ra[i] - mean) * (rb[i] - mean)
        da += (ra[i] - mean) ** 2
        db += (rb[i] - mean) ** 2
    return 0.0 if da == 0 or db == 0 else num / (da * db) ** 0.5


def failure_mode_hit_rate(results: list[dict]) -> float:
    """`results`: list of {"known": list[str], "topBlockers": list[str]}."""
    with_modes = [r for r in results if r["known"]]
    if not with_modes:
        return 1.0
    hits = sum(1 for r in with_modes if any(m in r["topBlockers"] for m in r["known"]))
    return hits / len(with_modes)


def within_category_inversions(rows: list[dict]) -> int:
    """`rows`: list of {"category": str, "score": float, "rank": int}."""
    inversions = 0
    by_cat: dict[str, list[dict]] = {}
    for r in rows:
        by_cat.setdefault(r["category"], []).append(r)
    for group in by_cat.values():
        for gi in group:
            for gj in group:
                if gi["rank"] > gj["rank"] and gi["score"] < gj["score"]:
                    inversions += 1
    return inversions

"""Trait correlation structure (mirror of apps/web .../persona/correlation.ts).

Unverified correlations are shrunk x0.5 (less claimed structure where there
is less evidence). Cholesky failure = configuration error -> raises at load.
"""
from __future__ import annotations

import math

TRAIT_ORDER = [
    "price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
    "social_influence", "risk_tolerance", "privacy_sensitivity",
]

_UNVERIFIED_SHRINK = 0.5

# Global default. All entries unverified (hence shrunk x0.5 at build time)
# until curated with psychometric sources in the priors files.
DEFAULT_CORRELATIONS: list[tuple[str, str, float, str]] = [
    ("novelty_seeking", "risk_tolerance", 0.4, "unverified"),
    ("skepticism", "brand_trust", -0.4, "unverified"),
    ("price_sensitivity", "risk_tolerance", -0.3, "unverified"),
    ("privacy_sensitivity", "skepticism", 0.25, "unverified"),
    ("social_influence", "novelty_seeking", 0.2, "unverified"),
]


def build_cholesky(pairs: list[tuple[str, str, float, str]], preset_key: str) -> list[list[float]]:
    n = len(TRAIT_ORDER)
    idx = {t: i for i, t in enumerate(TRAIT_ORDER)}
    m = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for a, b, r, status in pairs:
        if a not in idx:
            raise ValueError(f"correlation for preset '{preset_key}': unknown trait '{a}'")
        if b not in idx:
            raise ValueError(f"correlation for preset '{preset_key}': unknown trait '{b}'")
        # Only "unverified" correlations are shrunk -- "derived" and "sourced"
        # pass through at full strength.
        rr = r * _UNVERIFIED_SHRINK if status == "unverified" else r
        m[idx[a]][idx[b]] = rr
        m[idx[b]][idx[a]] = rr
    return _cholesky(m, preset_key)


def _cholesky(m: list[list[float]], preset_key: str) -> list[list[float]]:
    n = len(m)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = m[i][j] - sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                if s <= 1e-10:
                    raise ValueError(f"correlation matrix for preset '{preset_key}' is not positive definite")
                L[i][j] = math.sqrt(s)
            else:
                L[i][j] = s / L[j][j]
    return L


def apply_cholesky(L: list[list[float]], z: list[float]) -> list[float]:
    """y = L * z (lower-triangular multiply)."""
    return [sum(L[i][k] * z[k] for k in range(i + 1)) for i in range(len(L))]

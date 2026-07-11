"""Semantic grounding types + sanitizer (spec §7). The assessor LLM proposes
per-segment scores for the 5 grounded criteria; sanitize_semantic is the trust
boundary — every score is clamped to [0,1] or DROPPED (so the blend falls back
to the formula for that field). No raw LLM number ever reaches the scorer.

Mirror of apps/web/lib/server/engine/semantic/types.ts.
"""

from __future__ import annotations

import math
from typing import Literal, TypedDict

GROUNDED_CRITERIA: tuple[str, ...] = (
    "solution_fit", "need_intensity", "differentiation", "workflow_fit", "problem_awareness",
)

_GROUNDED = set(GROUNDED_CRITERIA)

SemanticSource = Literal["nvidia", "fireworks", "fallback_formulas"]


class SegmentAssessment(TypedDict):
    scores: dict[str, float]
    rationales: dict[str, str]


class SemanticMatrix(TypedDict):
    segments: dict[str, SegmentAssessment]
    real_alternatives_considered: list[str]
    source: SemanticSource


def _is_finite_unit_score(value: object) -> bool:
    """True score iff it is a real number (not bool) in [0, 1] and finite.

    json.loads happily parses NaN/Infinity (unlike JSON.parse), so this must
    check math.isfinite explicitly rather than relying on 0 <= s <= 1 alone
    (NaN comparisons are always False, but Infinity would pass the range
    check on one side while failing the other — isfinite is the one check
    that mirrors JS's Number.isFinite for every case).
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value) and 0 <= value <= 1


def sanitize_semantic(raw: object, segment_names: list[str]) -> SemanticMatrix | None:
    if not isinstance(raw, dict):
        return None
    segs_in = raw.get("segments")
    if not isinstance(segs_in, dict):
        return None

    expected = set(segment_names)
    segments: dict[str, SegmentAssessment] = {}
    for name, val in segs_in.items():
        if name not in expected or not isinstance(val, dict):
            continue
        scores: dict[str, float] = {}
        rationales: dict[str, str] = {}
        for cid, cell in val.items():
            if cid not in _GROUNDED or not isinstance(cell, dict):
                continue
            score = cell.get("score")
            if _is_finite_unit_score(score):
                scores[cid] = float(score)
                rationale = cell.get("rationale")
                if isinstance(rationale, str):
                    rationales[cid] = rationale[:300]
        segments[name] = {"scores": scores, "rationales": rationales}

    alts_in = raw.get("real_alternatives_considered")
    alts = (
        [a for a in alts_in if isinstance(a, str)][:12]
        if isinstance(alts_in, list)
        else []
    )

    return {"segments": segments, "real_alternatives_considered": alts, "source": "fallback_formulas"}

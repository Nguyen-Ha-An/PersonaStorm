"""Authoritative market-fit scorer.

`compute_market_fit` blends a category-weighted core score with an
age-overlay score (weighted by a per-category/life-stage lambda), applies
bounded rule-based modifiers, then applies hard multiplicative gates.
See spec §5 for the exact algorithm.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.utils.text import clamp

from . import age_overlays
from .presets import resolve_preset
from .registry import CORE_IDS, effective


class MarketFitBreakdown(BaseModel):
    market_fit_score: float
    category_weighted_core_score: float
    age_overlay_score: float
    age_overlay_lambda: float
    modifier_adjustment: float
    modifier_reasons: list[str]
    gates: list[dict]


def compute_market_fit(
    core: dict[str, float],
    overlay: dict[str, float],
    category: str,
    life_stage: str,
    *,
    is_high_risk: bool = False,
    is_teen_paid_edu: bool = False,
) -> MarketFitBreakdown:
    preset = resolve_preset(category)

    category_weighted_core_score = sum(
        preset.weights[cid] * effective(cid, core.get(cid, 0.0)) for cid in CORE_IDS
    )

    if overlay:
        age_overlay_score = sum(effective(cid, v) for cid, v in overlay.items()) / len(overlay)
    else:
        age_overlay_score = category_weighted_core_score

    age_overlay_lambda = clamp(
        preset.age_overlay_lambda + age_overlays.lambda_bump(life_stage), 0.05, 0.35
    )

    raw = (1 - age_overlay_lambda) * category_weighted_core_score + age_overlay_lambda * age_overlay_score

    modifier_adjustment = 0.0
    modifier_reasons: list[str] = []

    if core.get("trust", 0.0) < 0.30 and core.get("proof_requirement", 0.0) > 0.75:
        modifier_adjustment += -0.05
        modifier_reasons.append("trust gap with high proof demand")

    if (
        core.get("need_intensity", 0.0) > 0.75
        and core.get("solution_fit", 0.0) > 0.75
        and core.get("urgency", 0.0) > 0.60
    ):
        modifier_adjustment += 0.04
        modifier_reasons.append("strong, urgent need well matched")

    if core.get("pricing_acceptance", 0.0) < 0.25 and core.get("perceived_roi", 0.0) < 0.35:
        modifier_adjustment += -0.05
        modifier_reasons.append("price rejected and ROI unconvincing")

    modifier_adjustment = clamp(modifier_adjustment, -0.10, 0.10)

    score = clamp(raw + modifier_adjustment, 0.0, 1.0)

    gates: list[dict] = []

    if life_stage == "teen_student" and is_teen_paid_edu and overlay.get("parent_approval", 1.0) < 0.20:
        gate = {
            "gate_applied": True,
            "gate_name": "Low parent approval",
            "reason": "Teen personas cannot realistically purchase without parent approval.",
            "score_multiplier": 0.75,
        }
        gates.append(gate)
        score *= gate["score_multiplier"]

    if is_high_risk and core.get("trust", 1.0) < 0.20:
        gate = {
            "gate_applied": True,
            "gate_name": "Trust floor for high-risk product",
            "reason": "High-risk products fail without baseline trust.",
            "score_multiplier": 0.60,
        }
        gates.append(gate)
        score *= gate["score_multiplier"]

    market_fit_score = clamp(score, 0.0, 1.0)

    return MarketFitBreakdown(
        market_fit_score=round(market_fit_score, 4),
        category_weighted_core_score=round(category_weighted_core_score, 4),
        age_overlay_score=round(age_overlay_score, 4),
        age_overlay_lambda=round(age_overlay_lambda, 4),
        modifier_adjustment=round(modifier_adjustment, 4),
        modifier_reasons=modifier_reasons,
        gates=gates,
    )

"""Tests for the internal-consistency checker (Task 11).

The checker is DIAGNOSTIC-ONLY: it inspects a persona/reaction pair and
returns violated-rule labels. It must never mutate the reaction.
"""

from app.schemas.persona import Persona
from app.schemas.reaction import PersonaReaction
from app.services.quality.consistency_checker import (
    check_consistency,
    criteria_consistency_score,
)

CORE_DEFAULTS = dict(
    problem_awareness=0.6, need_intensity=0.6, urgency=0.6, solution_fit=0.6,
    value_clarity=0.6, differentiation=0.6, trust=0.6, proof_requirement=0.3,
    pricing_acceptance=0.6, perceived_roi=0.6, ease_of_understanding=0.6,
    workflow_fit=0.6, switching_willingness=0.6, activation_likelihood=0.6,
    repeat_usage_potential=0.6, shareability=0.6, retention_potential=0.6,
)


def _mk_persona(persona_id="P_0001", monthly_budget_usd=200.0) -> Persona:
    return Persona(
        persona_id=persona_id, preset="us_smb", segment="test", sub_segment="test",
        age=30, region="US", income_band="test", occupation="owner",
        price_sensitivity=0.5, skepticism=0.5, novelty_seeking=0.5,
        brand_trust=0.5, social_influence=0.5, risk_tolerance=0.5,
        privacy_sensitivity=0.5, category_familiarity="medium",
        research_style="reads reviews", buying_trigger="clear ROI",
        dealbreakers=["unclear pricing"], monthly_budget_usd=monthly_budget_usd,
    )


def _mk_reaction(persona_id="P_0001", criteria_overrides=None, **flat) -> PersonaReaction:
    scores = {**CORE_DEFAULTS, **(criteria_overrides or {})}
    payload = dict(
        persona_id=persona_id,
        segment="test",
        sub_segment="test",
        life_stage="early_career",
        criteria_scores=scores,
        reasoning_summary="test reasoning",
        qualitative={},
        research_recommendation={},
    )
    payload.update(flat)
    # sensible defaults for the flat-compat decision fields unless overridden
    payload.setdefault("buy_likelihood", 0.5)
    payload.setdefault("status", "yellow")
    payload.setdefault("max_price", 20.0)
    payload.setdefault("market_fit_score", 0.5)
    return PersonaReaction(**payload)


# --------------------------------------------------------------------- rules

def test_trust_vs_buy_violation_detected():
    persona = _mk_persona()
    reaction = _mk_reaction(
        criteria_overrides={"trust": 0.05},
        buy_likelihood=0.95,
    )
    violations = check_consistency(persona, reaction)
    assert "trust_vs_buy" in violations


def test_fully_consistent_reaction_returns_empty():
    persona = _mk_persona(monthly_budget_usd=200.0)
    # trust moderate, buy_likelihood moderate, proof_requirement low,
    # pricing_acceptance high, max_price well within budget, varied criteria.
    varied_scores = dict(CORE_DEFAULTS)
    varied_scores.update({
        "problem_awareness": 0.55, "need_intensity": 0.62, "urgency": 0.48,
        "solution_fit": 0.7, "value_clarity": 0.66, "differentiation": 0.4,
        "trust": 0.6, "proof_requirement": 0.3, "pricing_acceptance": 0.65,
        "perceived_roi": 0.58, "ease_of_understanding": 0.72,
        "workflow_fit": 0.45, "switching_willingness": 0.5,
        "activation_likelihood": 0.6, "repeat_usage_potential": 0.55,
        "shareability": 0.35, "retention_potential": 0.5,
    })
    reaction = _mk_reaction(
        criteria_overrides=varied_scores,
        buy_likelihood=0.5,
        max_price=30.0,  # well under 0.4 * 200 = 80
    )
    violations = check_consistency(persona, reaction)
    assert violations == []


def test_price_vs_wtp_violation_detected():
    persona = _mk_persona(monthly_budget_usd=100.0)
    reaction = _mk_reaction(
        criteria_overrides={"pricing_acceptance": 0.1},
        max_price=50.0,  # > 0.4 * 100 = 40
        buy_likelihood=0.5,
    )
    violations = check_consistency(persona, reaction)
    assert "price_vs_wtp" in violations


def test_proof_vs_trust_violation_detected():
    persona = _mk_persona()
    reaction = _mk_reaction(
        criteria_overrides={"proof_requirement": 0.85, "trust": 0.8},
        buy_likelihood=0.5,
    )
    violations = check_consistency(persona, reaction)
    assert "proof_vs_trust" in violations


def test_uniform_criteria_violation_detected():
    persona = _mk_persona()
    uniform_scores = {cid: 0.5 for cid in CORE_DEFAULTS}
    reaction = _mk_reaction(criteria_overrides=uniform_scores, buy_likelihood=0.5)
    violations = check_consistency(persona, reaction)
    assert "uniform_criteria" in violations


def test_checker_does_not_mutate_reaction():
    persona = _mk_persona()
    reaction = _mk_reaction(criteria_overrides={"trust": 0.05}, buy_likelihood=0.95)
    before = reaction.model_dump()
    check_consistency(persona, reaction)
    after = reaction.model_dump()
    assert before == after


# --------------------------------------------------------------- aggregate

def test_criteria_consistency_score_all_consistent():
    persona = _mk_persona(persona_id="P_A")
    varied_scores = dict(CORE_DEFAULTS)
    varied_scores.update({
        "problem_awareness": 0.55, "need_intensity": 0.62, "urgency": 0.48,
        "solution_fit": 0.7, "value_clarity": 0.66, "differentiation": 0.4,
        "trust": 0.6, "proof_requirement": 0.3, "pricing_acceptance": 0.65,
        "perceived_roi": 0.58, "ease_of_understanding": 0.72,
        "workflow_fit": 0.45, "switching_willingness": 0.5,
        "activation_likelihood": 0.6, "repeat_usage_potential": 0.55,
        "shareability": 0.35, "retention_potential": 0.5,
    })
    reaction = _mk_reaction(
        persona_id="P_A", criteria_overrides=varied_scores,
        buy_likelihood=0.5, max_price=30.0,
    )
    score = criteria_consistency_score([persona], [reaction])
    assert score == 1.0


def test_criteria_consistency_score_partial_violations():
    consistent_persona = _mk_persona(persona_id="P_A")
    inconsistent_persona = _mk_persona(persona_id="P_B")

    varied_scores = dict(CORE_DEFAULTS)
    varied_scores.update({
        "problem_awareness": 0.55, "need_intensity": 0.62, "urgency": 0.48,
        "solution_fit": 0.7, "value_clarity": 0.66, "differentiation": 0.4,
        "trust": 0.6, "proof_requirement": 0.3, "pricing_acceptance": 0.65,
        "perceived_roi": 0.58, "ease_of_understanding": 0.72,
        "workflow_fit": 0.45, "switching_willingness": 0.5,
        "activation_likelihood": 0.6, "repeat_usage_potential": 0.55,
        "shareability": 0.35, "retention_potential": 0.5,
    })
    good_reaction = _mk_reaction(
        persona_id="P_A", criteria_overrides=varied_scores,
        buy_likelihood=0.5, max_price=30.0,
    )
    bad_reaction = _mk_reaction(
        persona_id="P_B", criteria_overrides={"trust": 0.05}, buy_likelihood=0.95,
    )

    score = criteria_consistency_score(
        [consistent_persona, inconsistent_persona], [good_reaction, bad_reaction]
    )
    assert 0.0 <= score < 1.0
    assert score == 0.5


def test_criteria_consistency_score_no_pairs_returns_one():
    assert criteria_consistency_score([], []) == 1.0

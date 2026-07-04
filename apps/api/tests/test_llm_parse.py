import json

import pytest

from app.schemas.persona import Persona
from app.services.inference.fireworks_provider import parse_llm_reaction
from app.services.criteria.scoring import compute_market_fit
from app.services.criteria.classifier import classify_category, is_high_risk
from app.services.criteria.registry import CORE_IDS
from app.services.stimulus_parser import parse_stimulus


def _persona():
    return Persona(persona_id="P1", preset="us_smb", segment="s", sub_segment="s", age=30,
        region="US", income_band="b", occupation="o", price_sensitivity=0.5, skepticism=0.5,
        novelty_seeking=0.5, brand_trust=0.5, social_influence=0.5, risk_tolerance=0.5,
        privacy_sensitivity=0.5, category_familiarity="medium", research_style="r",
        buying_trigger="t", dealbreakers=["unclear pricing"], monthly_budget_usd=200.0)


def test_parse_computes_market_fit_server_side():
    features = parse_stimulus("AI copilot for sales teams, $40/seat/mo.", "X", "product_concept")
    core = {c: 0.6 for c in CORE_IDS}
    payload = {"criteria_scores": core, "age_specific_scores": {},
        "qualitative": {"first_objection":"no proof","top_positive_trigger":"clear",
          "top_negative_trigger":"price","dealbreaker":"none","proof_needed":"case study",
          "emotional_reaction":"curious","would_tell":"maybe","quote":"Interesting for $40/seat."},
        "buy_likelihood": 0.7, "max_price": 45, "recommended_pricing_model": "seat_based",
        "research_recommendation": {"should_validate_with_humans": True,
          "validation_question":"Would you pay $40/seat?","best_next_test":"pricing_test"},
        "reasoning_summary": "Decent fit, price is the question."}
    p = _persona()
    r = parse_llm_reaction(json.dumps(payload), p, features)
    cat = classify_category(features)[0]
    expected = compute_market_fit(core, {}, cat, p.life_stage,
        is_high_risk=is_high_risk(features),
        is_teen_paid_edu=(p.life_stage=="teen_student" and cat=="education_product"))
    assert abs(r.decision.market_fit_score - expected.market_fit_score) < 1e-9
    assert r.decision.status == ("green" if r.decision.overall_buy_likelihood>=0.62 else "yellow" if r.decision.overall_buy_likelihood>=0.38 else "red")
    assert set(r.criteria_scores.as_dict().keys()) == set(CORE_IDS)


def test_parse_missing_criteria_scores_raises():
    payload = {
        "qualitative": {"first_objection": "no proof", "top_positive_trigger": "clear",
          "top_negative_trigger": "price", "dealbreaker": "none", "proof_needed": "case study",
          "emotional_reaction": "curious", "would_tell": "maybe", "quote": "Interesting."},
        "buy_likelihood": 0.7, "max_price": 45, "recommended_pricing_model": "seat_based",
        "research_recommendation": {"should_validate_with_humans": True,
          "validation_question": "Would you pay?", "best_next_test": "pricing_test"},
        "reasoning_summary": "Missing criteria_scores entirely.",
    }
    p = _persona()
    with pytest.raises(Exception):
        parse_llm_reaction(json.dumps(payload), p, None)

"""MockPersonaProvider behavior tests — determinism, variety, trait-adherence."""

import asyncio

from app.schemas.persona import Persona
from app.schemas.reaction import PersonaReaction
from app.services.criteria.age_overlays import overlay_ids_for
from app.services.criteria.classifier import classify_category, is_high_risk
from app.services.criteria.registry import CORE_IDS
from app.services.criteria.scoring import compute_market_fit
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.stimulus_parser import parse_stimulus

STIM_PRICED = (
    "TaskHero is a project tracker for small agencies. Kanban boards, client "
    "portals, invoice export. $29/month per team, 14-day free trial. "
    "Trusted by 900 agencies; teams report 20% faster delivery."
)
STIM_VAGUE = (
    "Introducing SynergyMax, the revolutionary AI-powered platform that "
    "transforms how modern enterprises unlock productivity and drive innovation "
    "across every workflow imaginable."
)


def _react_all(personas, stimulus, seed=99):
    provider = MockPersonaProvider(seed=seed)
    features = parse_stimulus(stimulus, "Test", "product_concept")
    return asyncio.run(
        provider.react_batch(personas, stimulus, "product_concept", features)
    )


def test_reactions_are_deterministic():
    personas, _ = PersonaGenerator(seed=5).generate("us_smb", 30)
    a = _react_all(personas, STIM_PRICED)
    b = _react_all(personas, STIM_PRICED)
    assert [r.model_dump() for r in a] == [r.model_dump() for r in b]


def test_different_stimulus_changes_reactions():
    personas, _ = PersonaGenerator(seed=5).generate("us_smb", 30)
    a = _react_all(personas, STIM_PRICED)
    b = _react_all(personas, STIM_VAGUE)
    changed = sum(1 for x, y in zip(a, b) if x.quote != y.quote or x.status != y.status)
    assert changed >= 20, "stimulus content must drive reactions"


def test_output_variety_no_generic_clones():
    personas, _ = PersonaGenerator(seed=5).generate("sea_genz", 150)
    reactions = _react_all(personas, STIM_PRICED)
    quotes = {r.quote for r in reactions}
    objections = {r.first_objection for r in reactions}
    assert len(quotes) >= 60, f"quotes too repetitive: {len(quotes)} unique / 150"
    assert len(objections) >= 15, f"objections too repetitive: {len(objections)} unique"
    assert {r.status for r in reactions} >= {"yellow", "red"} or \
           {r.status for r in reactions} >= {"green", "yellow"}


def _mk_persona(pid: str, price_sensitivity: float) -> Persona:
    return Persona(
        persona_id=pid, preset="us_smb", segment="test", sub_segment="test",
        age=35, region="US", income_band="test", occupation="owner",
        price_sensitivity=price_sensitivity, skepticism=0.5, novelty_seeking=0.5,
        brand_trust=0.5, social_influence=0.5, risk_tolerance=0.5,
        privacy_sensitivity=0.5, category_familiarity="medium",
        research_style="reads reviews", buying_trigger="clear ROI",
        dealbreakers=["unclear pricing"], monthly_budget_usd=200.0,
    )


def test_price_sensitivity_lowers_max_price():
    sensitive = [_mk_persona(f"S_{i}", 0.9) for i in range(40)]
    relaxed = [_mk_persona(f"R_{i}", 0.1) for i in range(40)]
    rs = _react_all(sensitive, STIM_PRICED)
    rr = _react_all(relaxed, STIM_PRICED)
    avg_s = sum(r.max_price for r in rs) / len(rs)
    avg_r = sum(r.max_price for r in rr) / len(rr)
    assert avg_s < avg_r, f"sensitive avg {avg_s} should be < relaxed avg {avg_r}"


def test_reasoning_summary_is_short_public_rationale():
    personas, _ = PersonaGenerator(seed=5).generate("parents", 40)
    for r in _react_all(personas, STIM_PRICED):
        assert len(r.reasoning_summary) <= 400
        # single sentence-ish, not multi-step deliberation
        assert r.reasoning_summary.count("\n") == 0


# --------------------------------------------------------------- nested schema
def test_all_17_core_criteria_present_and_in_range():
    personas, _ = PersonaGenerator(seed=5).generate("us_smb", 30)
    for r in _react_all(personas, STIM_PRICED):
        scores = r.criteria_scores.as_dict()
        assert set(scores.keys()) == set(CORE_IDS), "must expose all 17 core criteria"
        for cid, v in scores.items():
            assert 0.0 <= v <= 1.0, f"{cid}={v} out of [0,1]"


def test_age_specific_scores_match_overlay_ids():
    # sea_genz spans teen/young-adult/early-career -> exercises multiple overlays
    personas, _ = PersonaGenerator(seed=5).generate("sea_genz", 40)
    for p, r in zip(personas, _react_all(personas, STIM_PRICED)):
        expected = set(overlay_ids_for(p.life_stage))
        assert set(r.age_specific_scores.keys()) == expected, (
            f"{p.life_stage}: overlay keys must equal overlay_ids_for()"
        )
        for cid, v in r.age_specific_scores.items():
            assert 0.0 <= v <= 1.0, f"{cid}={v} out of [0,1]"


def test_skepticism_lowers_trust_and_raises_proof_requirement():
    skeptical = [_mk_persona_sk(f"K_{i}", 0.9) for i in range(40)]
    trusting = [_mk_persona_sk(f"T_{i}", 0.1) for i in range(40)]
    rk = _react_all(skeptical, STIM_VAGUE)
    rt = _react_all(trusting, STIM_VAGUE)

    def mean(rs, cid):
        return sum(r.criteria_scores.as_dict()[cid] for r in rs) / len(rs)

    assert mean(rk, "trust") < mean(rt, "trust"), "skeptics trust less"
    assert mean(rk, "proof_requirement") > mean(rt, "proof_requirement"), (
        "skeptics demand more proof"
    )


def test_market_fit_in_range():
    personas, _ = PersonaGenerator(seed=5).generate("us_smb", 30)
    for r in _react_all(personas, STIM_PRICED):
        assert 0.0 <= r.decision.market_fit_score <= 1.0


def test_market_fit_is_recomputed_not_invented():
    """Prove market_fit is the authoritative scorer's output, not fabricated:
    recompute compute_market_fit() from the reaction's own core+overlay scores
    and assert it equals the stored decision.market_fit_score exactly."""
    personas, _ = PersonaGenerator(seed=5).generate("us_smb", 30)
    features = parse_stimulus(STIM_PRICED, "Test", "product_concept")
    category, _ = classify_category(features)
    high_risk = is_high_risk(features)
    reactions = _react_all(personas, STIM_PRICED)
    for p, r in zip(personas, reactions):
        core = r.criteria_scores.as_dict()
        overlay = dict(r.age_specific_scores)
        expected = compute_market_fit(
            core, overlay, category, p.life_stage,
            is_high_risk=high_risk,
            is_teen_paid_edu=(p.life_stage == "teen_student"
                              and category == "education_product"),
        )
        assert r.decision.market_fit_score == expected.market_fit_score, (
            f"market_fit must be system-computed for {p.persona_id}"
        )


def test_new_nested_reactions_are_deterministic():
    personas, _ = PersonaGenerator(seed=5).generate("sea_genz", 40)
    a = _react_all(personas, STIM_PRICED)
    b = _react_all(personas, STIM_PRICED)
    assert [r.model_dump() for r in a] == [r.model_dump() for r in b]


def _mk_persona_sk(pid: str, skepticism: float) -> Persona:
    return Persona(
        persona_id=pid, preset="us_smb", segment="test", sub_segment="test",
        age=35, region="US", income_band="test", occupation="owner",
        price_sensitivity=0.5, skepticism=skepticism, novelty_seeking=0.5,
        brand_trust=0.5, social_influence=0.5, risk_tolerance=0.5,
        privacy_sensitivity=0.5, category_familiarity="medium",
        research_style="reads reviews", buying_trigger="clear ROI",
        dealbreakers=["no proof"], monthly_budget_usd=200.0,
    )

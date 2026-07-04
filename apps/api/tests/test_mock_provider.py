"""MockPersonaProvider behavior tests — determinism, variety, trait-adherence."""

import asyncio

from app.schemas.persona import Persona
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

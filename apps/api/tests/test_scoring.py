from app.services.criteria.scoring import compute_market_fit
from app.services.criteria.registry import CORE_IDS

def _flat(v): return {c: v for c in CORE_IDS}

def test_market_fit_in_range_and_barrier_inverted():
    # proof_requirement high should LOWER fit vs low, all else equal
    hi = compute_market_fit({**_flat(0.6), "proof_requirement":0.9}, {}, "ai_tool", "early_career")
    lo = compute_market_fit({**_flat(0.6), "proof_requirement":0.1}, {}, "ai_tool", "early_career")
    assert 0.0 <= hi.market_fit_score <= 1.0
    assert hi.market_fit_score < lo.market_fit_score

def test_blend_uses_lambda():
    b = compute_market_fit(_flat(0.8), {"career_value":0.2,"productivity_gain":0.2}, "consumer_app", "early_career")
    assert b.age_overlay_lambda > 0
    assert b.age_overlay_score < b.category_weighted_core_score

def test_modifier_bounds():
    b = compute_market_fit({**_flat(0.5),"trust":0.1,"proof_requirement":0.9}, {}, "generic", "early_career")
    assert -0.10 <= b.modifier_adjustment <= 0.10
    assert any("trust" in r.lower() for r in b.modifier_reasons)

def test_hard_gate_teen_parent_approval():
    b = compute_market_fit(_flat(0.7), {"parent_approval":0.1}, "education_product", "teen_student", is_teen_paid_edu=True)
    assert b.gates and b.gates[0]["score_multiplier"] == 0.75

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


def test_hard_gate_high_risk_trust_floor():
    # is_high_risk=True + trust < 0.20 -> hard gate with score_multiplier 0.60
    b = compute_market_fit(
        {**_flat(0.6), "trust": 0.1}, {}, "generic", "early_career", is_high_risk=True,
    )
    assert any(g["score_multiplier"] == 0.60 for g in b.gates), (
        f"expected a 0.60 high-risk trust-floor gate, got {b.gates}"
    )
    gate = next(g for g in b.gates if g["score_multiplier"] == 0.60)
    assert gate["gate_applied"] is True
    assert "trust" in gate["gate_name"].lower() or "trust" in gate["reason"].lower()

    # sanity: same core scores but is_high_risk=False -> gate must NOT apply
    no_gate = compute_market_fit(
        {**_flat(0.6), "trust": 0.1}, {}, "generic", "early_career", is_high_risk=False,
    )
    assert not any(g["score_multiplier"] == 0.60 for g in no_gate.gates)


def test_modifier_strong_urgent_need_matched_bonus():
    # need_intensity>0.75 & solution_fit>0.75 & urgency>0.60 -> +0.04 modifier
    core = {**_flat(0.5), "need_intensity": 0.9, "solution_fit": 0.9, "urgency": 0.8,
            "trust": 0.8, "proof_requirement": 0.2,  # avoid tripping the trust-gap modifier
            "pricing_acceptance": 0.8, "perceived_roi": 0.8}  # avoid the price-rejected modifier
    b = compute_market_fit(core, {}, "generic", "early_career")
    assert any("urgent need" in r.lower() for r in b.modifier_reasons), b.modifier_reasons
    assert b.modifier_adjustment > 0, (
        f"expected a positive modifier adjustment, got {b.modifier_adjustment}"
    )


def test_modifier_price_rejected_low_roi_penalty():
    # pricing_acceptance<0.25 & perceived_roi<0.35 -> -0.05 modifier
    core = {**_flat(0.5), "pricing_acceptance": 0.1, "perceived_roi": 0.2,
            "trust": 0.8, "proof_requirement": 0.2,  # avoid trust-gap modifier
            "need_intensity": 0.5, "solution_fit": 0.5, "urgency": 0.3}  # avoid need-match bonus
    b = compute_market_fit(core, {}, "generic", "early_career")
    assert any("roi" in r.lower() or "price" in r.lower() for r in b.modifier_reasons), (
        b.modifier_reasons
    )
    assert b.modifier_adjustment < 0, (
        f"expected a negative modifier adjustment, got {b.modifier_adjustment}"
    )

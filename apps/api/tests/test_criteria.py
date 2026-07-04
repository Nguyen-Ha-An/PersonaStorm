from app.services.criteria import registry as reg
from app.services.criteria import presets as pre
from app.services.criteria.classifier import classify_category, is_high_risk
from app.services.stimulus_parser import parse_stimulus


def test_core_has_17_criteria():
    assert len(reg.CORE_CRITERIA) == 17
    assert len(reg.CORE_IDS) == 17
    assert len(set(reg.CORE_IDS)) == 17


def test_proof_requirement_is_barrier():
    assert reg.is_barrier("proof_requirement") is True
    assert reg.CRITERION_BY_ID["proof_requirement"].higher_is_better is False


def test_trust_is_positive():
    assert reg.is_barrier("trust") is False


def test_effective_inverts_barriers():
    assert reg.effective("trust", 0.8) == 0.8
    assert abs(reg.effective("proof_requirement", 0.8) - 0.2) < 1e-9


def test_ten_categories():
    assert set(pre.CATEGORY_IDS) == {
        "ai_tool","b2b_saas","consumer_app","ecommerce_product","education_product",
        "marketplace","social_product","hardware_product","luxury_product","generic"}


def test_weights_normalize_to_one():
    for cat in pre.CATEGORY_IDS:
        p = pre.resolve_preset(cat)
        assert abs(sum(p.weights.values()) - 1.0) < 1e-6


def test_unknown_falls_back_to_generic():
    assert pre.resolve_preset("nonsense").category == "generic"


def test_lambda_in_range():
    for cat in pre.CATEGORY_IDS:
        assert 0.0 <= pre.resolve_preset(cat).age_overlay_lambda <= 0.35


def test_ai_saas_classifies_reasonably():
    f = parse_stimulus("AI copilot for sales teams. CRM integration, SSO, $40/seat/mo.", "X", "product_concept")
    cat, conf = classify_category(f)
    assert cat in {"ai_tool", "b2b_saas"} and conf > 0


def test_high_risk_flag():
    f = parse_stimulus("A telehealth app that stores your medical records and payment data.", "X", "product_concept")
    assert is_high_risk(f) is True


def test_luxury_blurb_classifies_as_luxury():
    f = parse_stimulus(
        "A bespoke, handcrafted leather handbag collection. Limited-edition, artisan-made, exclusive to VIP members.",
        "Atelier",
        "product_concept",
    )
    cat, conf = classify_category(f)
    assert cat == "luxury_product" and conf > 0


def test_unknown_blurb_falls_back_to_generic():
    f = parse_stimulus("A thing that does stuff for people who want things.", "X", "product_concept")
    cat, conf = classify_category(f)
    assert cat == "generic"


def test_consumer_app_is_not_high_risk():
    f = parse_stimulus(
        "A photo sharing app for friends with fun filters and daily streaks.", "SnapStreak", "product_concept"
    )
    assert is_high_risk(f) is False


def test_marketplace_classifies_as_marketplace():
    f = parse_stimulus(
        "A two-sided marketplace connecting buyers and sellers. Vendors list products, we take a small commission on each sale.",
        "TradeHub",
        "product_concept",
    )
    cat, conf = classify_category(f)
    assert cat == "marketplace" and conf > 0

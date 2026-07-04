from app.services.criteria import registry as reg
from app.services.criteria import presets as pre


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

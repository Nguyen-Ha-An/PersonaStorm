from app.schemas.persona import Persona
from app.services.criteria import age_overlays as ao
from app.services.criteria import registry as reg


def _mk_persona(age: int) -> Persona:
    return Persona(
        persona_id="P_0001", preset="us_smb", segment="test", sub_segment="test",
        age=age, region="US", income_band="test", occupation="owner",
        price_sensitivity=0.5, skepticism=0.5, novelty_seeking=0.5,
        brand_trust=0.5, social_influence=0.5, risk_tolerance=0.5,
        privacy_sensitivity=0.5, category_familiarity="medium",
        research_style="reads reviews", buying_trigger="clear ROI",
        dealbreakers=["unclear pricing"], monthly_budget_usd=200.0,
    )


def test_persona_life_stage_auto_derived_from_age():
    teen = _mk_persona(age=15)
    assert teen.life_stage == "teen_student"

    parent = _mk_persona(age=40)
    assert parent.life_stage == "parent_family"


def test_persona_decision_context_defaults_empty():
    p = _mk_persona(age=30)
    assert p.decision_context.needs_parent_approval is None
    assert p.decision_context.main_influence_sources == []


def test_life_stage_bands():
    assert ao.life_stage_for(15) == "teen_student"
    assert ao.life_stage_for(21) == "student_young_adult"
    assert ao.life_stage_for(30) == "early_career"
    assert ao.life_stage_for(40) == "parent_family"
    assert ao.life_stage_for(52) == "established_adult"
    assert ao.life_stage_for(70) == "older_adult"


def test_teen_overlay_criteria():
    ids = ao.overlay_ids_for("teen_student")
    assert "parent_approval" in ids and "safety_concern" in ids


def test_barrier_overlays_registered():
    assert reg.is_barrier("safety_concern") is True
    assert reg.is_barrier("subscription_fatigue") is True
    assert reg.is_barrier("parent_approval") is False


def test_life_stage_band_boundaries():
    assert ao.life_stage_for(13) == "teen_student"
    assert ao.life_stage_for(17) == "teen_student"
    assert ao.life_stage_for(18) == "student_young_adult"
    assert ao.life_stage_for(24) == "student_young_adult"
    assert ao.life_stage_for(25) == "early_career"
    assert ao.life_stage_for(34) == "early_career"
    assert ao.life_stage_for(35) == "parent_family"
    assert ao.life_stage_for(44) == "parent_family"
    assert ao.life_stage_for(45) == "established_adult"
    assert ao.life_stage_for(60) == "established_adult"
    assert ao.life_stage_for(61) == "older_adult"


def test_every_life_stage_has_overlay_ids():
    for stage in ao.LIFE_STAGES:
        ids = ao.overlay_ids_for(stage)
        assert len(ids) >= 1
        assert len(ids) == len(set(ids))


def test_unknown_life_stage_returns_empty_tuple():
    assert ao.overlay_ids_for("nonsense_stage") == ()


def test_lambda_bump_values():
    assert ao.lambda_bump("teen_student") == 0.08
    assert ao.lambda_bump("older_adult") == 0.06
    assert ao.lambda_bump("parent_family") == 0.03
    assert ao.lambda_bump("early_career") == 0.0
    assert ao.lambda_bump("student_young_adult") == 0.0
    assert ao.lambda_bump("established_adult") == 0.0


def test_life_stages_tuple_order():
    assert ao.LIFE_STAGES == (
        "teen_student",
        "student_young_adult",
        "early_career",
        "parent_family",
        "established_adult",
        "older_adult",
    )


def test_workflow_fit_not_overwritten_by_overlay():
    # workflow_fit is a core criterion registered by Task 1; overlay
    # re-registration must not change its group/description.
    assert reg.CRITERION_BY_ID["workflow_fit"].group == "adoption"

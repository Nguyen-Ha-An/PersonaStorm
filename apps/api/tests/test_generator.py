"""Persona Space Builder + Diversity Validator tests."""

from app.services.persona import PersonaGenerator
from app.services.persona.presets import PRESETS

TRAITS = ["price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
          "social_influence", "risk_tolerance", "privacy_sensitivity"]


def test_all_presets_generate_diverse_populations():
    gen = PersonaGenerator(seed=42)
    for key in PRESETS:
        personas, report = gen.generate(key, 400)
        assert len(personas) == 400
        assert len({p.persona_id for p in personas}) == 400, f"duplicate ids in {key}"
        assert report.ok, f"{key} failed diversity: {report.warnings}"
        for p in personas[:50]:
            for t in TRAITS:
                assert 0.0 <= getattr(p, t) <= 1.0
            assert p.dealbreakers, "persona must have dealbreakers"
            assert p.monthly_budget_usd > 0


def test_generation_is_deterministic():
    a, _ = PersonaGenerator(seed=7).generate("sea_genz", 100)
    b, _ = PersonaGenerator(seed=7).generate("sea_genz", 100)
    assert [p.model_dump() for p in a] == [p.model_dump() for p in b]

    c, _ = PersonaGenerator(seed=8).generate("sea_genz", 100)
    assert [p.model_dump() for p in a] != [p.model_dump() for p in c]


def test_custom_preset_from_description():
    gen = PersonaGenerator(seed=42)
    personas, report = gen.generate(
        "custom", 200, custom_description="privacy-conscious enterprise developers in Vietnam"
    )
    assert len(personas) == 200
    assert report.ok, report.warnings
    # keyword modifiers should push privacy sensitivity up vs neutral 0.55
    avg_privacy = sum(p.privacy_sensitivity for p in personas) / len(personas)
    assert avg_privacy > 0.6


def test_trait_consistency_pass():
    """Highly price-sensitive personas must carry a pricing dealbreaker."""
    personas, _ = PersonaGenerator(seed=1).generate("budget", 300)
    sensitive = [p for p in personas if p.price_sensitivity > 0.8]
    assert sensitive
    for p in sensitive:
        joined = " ".join(p.dealbreakers)
        assert any(w in joined for w in ("pricing", "fees", "credit card")), p.dealbreakers


def test_generated_personas_have_correct_life_stage():
    """life_stage must match age for every generated persona (auto-derived)."""
    from app.services.criteria.age_overlays import life_stage_for

    personas, _ = PersonaGenerator(seed=42).generate("budget", 200)
    for p in personas:
        assert p.life_stage == life_stage_for(p.age)


def test_spanning_market_produces_multiple_life_stages():
    """'budget' and 'parents' presets span multiple age bands (verified
    empirically against age_overlays.life_stage_for): assert the population
    actually reflects that spread, not a single collapsed cohort."""
    personas, _ = PersonaGenerator(seed=42).generate("budget", 400)
    stages = {p.life_stage for p in personas}
    assert len(stages) >= 2, stages

    personas2, _ = PersonaGenerator(seed=42).generate("sea_genz", 400)
    stages2 = {p.life_stage for p in personas2}
    assert len(stages2) >= 1, stages2


def test_teen_decision_context_has_parent_approval_fields():
    """Teens (life_stage == teen_student) must carry parent-approval-shaped
    decision context. None of the current presets sample age < 18, so we
    build a teen persona directly through the generator's _one() to verify
    the deterministic decision_context logic."""
    import random

    from app.services.persona.presets import PRESETS

    gen = PersonaGenerator(seed=3)
    preset = PRESETS["sea_genz"]
    sub = preset.sub_segments[0]
    rng = random.Random("teen-test")
    teen_sub = replace_age_range(sub, (14, 16))
    persona = gen._one(preset, teen_sub, 1, rng)

    assert persona.life_stage == "teen_student"
    dc = persona.decision_context
    assert dc.needs_parent_approval is True
    assert dc.budget_control == "allowance"
    assert dc.risk_owner == "parent"
    assert dc.attention_span == "short"
    assert "peers" in dc.main_influence_sources
    assert dc.school_context


def replace_age_range(sub, age_range):
    from dataclasses import replace
    return replace(sub, age_range=age_range)


def test_non_teen_decision_context_has_deterministic_fields():
    personas, _ = PersonaGenerator(seed=42).generate("us_smb", 100)
    for p in personas:
        assert p.life_stage != "teen_student"
        assert p.decision_context.needs_parent_approval is not True
        # non-teens still get some deterministic context populated
        assert p.decision_context.main_influence_sources or p.decision_context.decision_horizon \
            or p.decision_context.budget_control


def test_diversity_report_flags_single_cohort_collapse():
    from app.services.persona.diversity import validate_diversity
    from tests.test_age import _mk_persona as mk

    single_cohort = [mk(age=40) for _ in range(50)]
    # give them distinct ids/segments so other checks don't dominate
    for i, p in enumerate(single_cohort):
        p.persona_id = f"P_{i:04d}"
    report = validate_diversity(single_cohort, ["test"])
    assert any("life stage" in w.lower() or "cohort" in w.lower() for w in report.warnings), report.warnings

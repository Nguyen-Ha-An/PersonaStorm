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

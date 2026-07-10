import json
import math
from pathlib import Path

import pytest

from app.services.persona.correlation import (
    DEFAULT_CORRELATIONS, TRAIT_ORDER, apply_cholesky, build_cholesky,
)
from app.services.persona.generator import PersonaGenerator
from app.services.persona.priors_loader import load_preset_with_meta


def test_trait_order_is_canonical():
    assert TRAIT_ORDER == [
        "price_sensitivity", "skepticism", "novelty_seeking", "brand_trust",
        "social_influence", "risk_tolerance", "privacy_sensitivity",
    ]


def test_default_correlations_cholesky_unit_diagonal():
    L = build_cholesky(DEFAULT_CORRELATIONS, "test")
    for i in range(7):
        assert math.isclose(sum(L[i][k] ** 2 for k in range(i + 1)), 1.0, abs_tol=1e-6)


def test_unverified_correlation_is_shrunk():
    L = build_cholesky([("price_sensitivity", "skepticism", 0.8, "unverified")], "test")
    assert math.isclose(L[1][0], 0.4, abs_tol=1e-6)


def test_derived_correlation_is_not_shrunk():
    L = build_cholesky([("price_sensitivity", "skepticism", 0.8, "derived")], "test")
    assert math.isclose(L[1][0], 0.8, abs_tol=1e-6)


def test_sourced_correlation_is_not_shrunk():
    L = build_cholesky([("price_sensitivity", "skepticism", 0.8, "sourced")], "test")
    assert math.isclose(L[1][0], 0.8, abs_tol=1e-6)


def test_non_psd_matrix_raises_with_preset_name():
    bad = [
        ("price_sensitivity", "skepticism", 0.95, "sourced"),
        ("skepticism", "novelty_seeking", 0.95, "sourced"),
        ("price_sensitivity", "novelty_seeking", -0.95, "sourced"),
    ]
    with pytest.raises(ValueError, match="sea_genz"):
        build_cholesky(bad, "sea_genz")


def test_loader_widens_unverified_std(tmp_path: Path):
    doc = {
        "preset": "sea_genz", "version": 1,
        "trait_definitions": {"price_sensitivity": "def"},
        "sub_segments": [{
            "name": "s1", "weight": 1, "age_range": [18, 25], "regions": ["r"],
            "income_bands": [["b", [5, 25]]], "occupations": ["o"], "familiarity": ["low"],
            "research_styles": ["rs"], "buying_triggers": ["bt"], "dealbreaker_pool": ["unclear pricing"],
            "traits": {
                name: {"mean": 0.5, "std": 0.1, "evidence": {"status": "unverified"}}
                for name in TRAIT_ORDER
            },
        }],
    }
    doc["sub_segments"][0]["traits"]["price_sensitivity"] = {
        "mean": 0.8, "std": 0.1,
        "evidence": {"status": "sourced", "sources": [{"title": "t", "url": "u"}], "mapping_rule": "m"},
    }
    (tmp_path / "sea_genz.json").write_text(json.dumps(doc))
    loaded = load_preset_with_meta("sea_genz", dir=str(tmp_path))
    assert loaded.meta.source == "data_files"
    assert loaded.preset.sub_segments[0].traits["price_sensitivity"] == (0.8, 0.1)
    assert math.isclose(loaded.preset.sub_segments[0].traits["skepticism"][1], 0.15)
    assert math.isclose(loaded.meta.coverage, 1 / 7)


def test_loader_missing_dir_falls_back_labeled(tmp_path: Path):
    loaded = load_preset_with_meta("sea_genz", dir=str(tmp_path / "nope"))
    assert loaded.meta.source == "embedded_unverified"
    assert loaded.meta.coverage == 0


def test_loader_embedded_fallback_widens_stds():
    # No dir override that exists -> falls back to embedded PRESETS, widened
    # x1.5 (cap 0.20) without mutating the shared PRESETS module state.
    from app.services.persona.presets import PRESETS

    original_std = PRESETS["sea_genz"].sub_segments[0].traits["price_sensitivity"][1]
    loaded = load_preset_with_meta("sea_genz", dir="/definitely/does/not/exist/anywhere")
    widened_std = loaded.preset.sub_segments[0].traits["price_sensitivity"][1]
    assert math.isclose(widened_std, min(original_std * 1.5, 0.2))
    # Shared PRESETS table must be untouched.
    assert PRESETS["sea_genz"].sub_segments[0].traits["price_sensitivity"][1] == original_std


def test_generator_returns_meta_and_realizes_correlation():
    personas, report, meta = PersonaGenerator(seed=7).generate("us_smb", 1000)
    assert meta.source in ("data_files", "embedded_unverified")
    xs = [p.novelty_seeking for p in personas]
    ys = [p.risk_tolerance for p in personas]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    assert 0.08 < num / den < 0.4
    assert report.coherence is None or report.coherence > 0.9

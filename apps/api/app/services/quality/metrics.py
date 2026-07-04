"""Response Quality Checker — computes every Trust Panel metric.

P0 honesty statement: these are heuristic estimators, not learned evaluators —
but they run on real outputs and genuinely move when output quality degrades
(tests/test_quality.py proves collapse detection on cloned reactions).
The evaluation roadmap (docs/evaluation-framework.md) upgrades each estimator.

Metric map (spec section 9):
1. persona_adherence      — trait->behavior rank correlations across the swarm
2. product_grounding      — do reactions reference actual stimulus content?
3. generic_response_rate  — vague filler detection
4. duplicate_objection_rate — near-identical objection share
5. objection_entropy      — diversity of the objection distribution
6. segment_variance       — do segments actually respond differently?
7. collapse_risk          — combined mode-collapse indicator
8. benchmark_confidence   — do we have reference data for this category?
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from ...schemas.persona import Persona
from ...schemas.quality import QualityMetrics
from ...schemas.reaction import PersonaReaction
from ...utils.text import (
    clamp,
    normalize_objection,
    rank_correlation,
    shannon_entropy_norm,
    stddev,
)
from ..stimulus_parser import StimulusFeatures
from .consistency_checker import criteria_consistency_score

GENERIC_PHRASES = [
    "seems useful", "sounds useful", "interesting product", "sounds good",
    "i would consider it", "this product is innovative", "nice product",
    "cool idea", "looks good", "pretty good product", "might be useful",
]


def compute_quality(
    personas: list[Persona],
    reactions: list[PersonaReaction],
    features: StimulusFeatures,
    benchmark_dir: Path | None = None,
) -> QualityMetrics:
    notes: list[str] = []
    n = max(1, len(reactions))
    by_id = {p.persona_id: p for p in personas}
    paired = [(by_id[r.persona_id], r) for r in reactions if r.persona_id in by_id]

    adherence = _persona_adherence(paired, features, notes)
    grounding = _product_grounding(reactions, features)
    generic_rate = _generic_rate(reactions, features)
    entropy_norm = _objection_entropy(reactions)
    dup_rate = _duplicate_rate(reactions)
    seg_var = _segment_variance(reactions)
    age_var = _age_cohort_variance(reactions)
    consistency = criteria_consistency_score(personas, reactions)

    # ---- collapse risk: verbatim duplication + low theme entropy + likelihood
    # concentration. NOTE the deliberate distinction: many personas raising the
    # SAME THEME ("no pricing") is *signal*, not collapse — themes live in
    # entropy. Collapse is when full outputs are near-verbatim copies, so the
    # duplicate metric runs on whole quotes, not objection themes.
    concentration = _likelihood_concentration(reactions)
    collapse_score = clamp(0.35 * dup_rate + 0.35 * (1.0 - entropy_norm) + 0.30 * concentration)
    collapse_level = "low" if collapse_score < 0.33 else "medium" if collapse_score < 0.60 else "high"
    if collapse_level != "low":
        notes.append(
            f"Collapse signal: {dup_rate:.0%} duplicate objections, "
            f"entropy {entropy_norm:.2f}, likelihood concentration {concentration:.2f}."
        )

    entropy_level = "low" if entropy_norm < 0.45 else "medium" if entropy_norm < 0.70 else "high"
    var_level = _variance_strength(seg_var)
    age_var_level = _variance_strength(age_var)

    bench_level, bench_cat = _benchmark_confidence(features, benchmark_dir, notes)

    if consistency < 0.6:
        notes.append(
            f"Internal consistency low: only {consistency:.0%} of personas pass all "
            "consistency rules (trust/buy, price/WTP, proof/trust, uniform criteria) — "
            "many reactions contradict themselves."
        )

    notes.append(
        f"Metrics computed over {n} reactions across "
        f"{len({r.segment for r in reactions})} segments; heuristic P0 estimators."
    )

    return QualityMetrics(
        persona_adherence=round(adherence, 3),
        product_grounding=round(grounding, 3),
        generic_response_rate=round(generic_rate, 3),
        duplicate_objection_rate=round(dup_rate, 3),
        objection_entropy=entropy_level,
        objection_entropy_score=round(entropy_norm, 3),
        segment_variance=var_level,
        segment_variance_score=round(seg_var, 4),
        age_cohort_variance=age_var_level,
        criteria_consistency=round(consistency, 3),
        collapse_risk=collapse_level,
        collapse_risk_score=round(collapse_score, 3),
        benchmark_confidence=bench_level,
        benchmark_category=bench_cat,
        notes=notes,
    )


# ------------------------------------------------------------------- components

def _map_corr(corr: float, expected_sign: int) -> float:
    """Map a rank correlation to [0,1]: 0.5 = no signal, 1.0 = strong signal in
    the expected direction, 0.0 = strong signal in the WRONG direction."""
    return clamp(0.5 + expected_sign * corr * 1.4)


def _persona_adherence(paired: list[tuple[Persona, PersonaReaction]],
                       features: StimulusFeatures, notes: list[str]) -> float:
    if len(paired) < 10:
        return 0.5
    ps = [p.price_sensitivity for p, _ in paired]
    # normalize max_price by budget to remove the income confound
    price_ratio = [r.max_price / max(1.0, p.monthly_budget_usd) for p, r in paired]
    skept = [p.skepticism for p, _ in paired]
    trust = [p.brand_trust for p, _ in paired]
    likelihood = [r.buy_likelihood for _, r in paired]

    components = [
        _map_corr(rank_correlation(ps, price_ratio), expected_sign=-1),   # sensitive -> lower WTP
        _map_corr(rank_correlation(skept, likelihood), expected_sign=-1),  # skeptics -> lower intent
        _map_corr(rank_correlation(trust, likelihood), expected_sign=+1),  # trusting -> higher intent
    ]
    if features.mentions_ai:
        novelty = [p.novelty_seeking for p, _ in paired]
        components.append(_map_corr(rank_correlation(novelty, likelihood), expected_sign=+1))

    score = sum(components) / len(components)
    if score < 0.55:
        notes.append("Persona adherence weak: trait-behavior correlations below target.")
    return score


def _mentions_stimulus(text: str, features: StimulusFeatures) -> bool:
    low = text.lower()
    if any(a in low for a in features.anchor_set()):
        return True
    # price references count as grounding when the stimulus actually has prices
    if features.has_pricing and "$" in text:
        return True
    return False


def _product_grounding(reactions: list[PersonaReaction],
                       features: StimulusFeatures) -> float:
    """Approximate: share of reactions whose text references stimulus anchors or
    detected prices. Feature-level objections ('no pricing shown') ground in
    *absence*, which token matching can't see — so treat this as a lower bound."""
    if not reactions:
        return 0.0
    hits = sum(
        1 for r in reactions
        if _mentions_stimulus(f"{r.first_objection} {r.quote} {r.positive_trigger}", features)
    )
    return hits / len(reactions)


def _generic_rate(reactions: list[PersonaReaction],
                  features: StimulusFeatures) -> float:
    if not reactions:
        return 1.0

    def is_generic(r: PersonaReaction) -> bool:
        text = f"{r.first_objection} {r.quote}".lower()
        if not r.first_objection.strip():
            return True
        has_phrase = any(ph in text for ph in GENERIC_PHRASES)
        return has_phrase and not _mentions_stimulus(text, features)

    return sum(1 for r in reactions if is_generic(r)) / len(reactions)


def _objection_entropy(reactions: list[PersonaReaction]) -> float:
    """Diversity of objection THEMES (normalized text). High = varied concerns;
    low = the swarm converged on one concern (fine) or collapsed (check dup)."""
    keys = [normalize_objection(r.first_objection) for r in reactions if r.first_objection]
    if not keys:
        return 0.0
    return shannon_entropy_norm(list(Counter(keys).values()))


def _duplicate_rate(reactions: list[PersonaReaction], sample_size: int = 300) -> float:
    """Near-verbatim duplication of FULL outputs (normalized quote text).
    A healthy swarm repeats themes but not sentences; a collapsed model repeats
    sentences. Computed on a fixed-size seeded subsample so the metric is
    comparable across swarm sizes (raw distinct/n inevitably falls as n grows).
    0 = all quotes distinct, ->1 = clones."""
    import random as _random

    keys = [normalize_objection(r.quote) for r in reactions if r.quote.strip()]
    if not keys:
        return 1.0
    if len(keys) > sample_size:
        keys = _random.Random(0).sample(keys, sample_size)
    return 1.0 - len(set(keys)) / len(keys)


def _variance_strength(var: float) -> str:
    """Shared weak/moderate/strong mapping for any stddev-of-group-means
    variance score (segment_variance and age_cohort_variance both use it)."""
    return "weak" if var < 0.03 else "moderate" if var < 0.07 else "strong"


def _grouped_mean_variance(reactions: list[PersonaReaction], key) -> float:
    """stddev of per-group mean buy_likelihood, grouped by `key(reaction)`."""
    by_group: dict[str, list[float]] = {}
    for r in reactions:
        by_group.setdefault(key(r) or "unknown", []).append(r.buy_likelihood)
    means = [sum(v) / len(v) for v in by_group.values() if v]
    return stddev(means) if len(means) >= 2 else 0.0


def _segment_variance(reactions: list[PersonaReaction]) -> float:
    return _grouped_mean_variance(reactions, key=lambda r: r.segment)


def _age_cohort_variance(reactions: list[PersonaReaction]) -> float:
    """Do life-stage cohorts (teen_student, early_career, parent_family, ...)
    actually respond differently? Same stddev-of-means shape as
    _segment_variance, grouped by life_stage instead of segment."""
    return _grouped_mean_variance(reactions, key=lambda r: r.life_stage)


def _likelihood_concentration(reactions: list[PersonaReaction]) -> float:
    """Max histogram-bin share of buy_likelihood, rescaled so a uniform spread
    scores ~0 and 'everyone in one band' scores ~1 (mode-collapse smell)."""
    if not reactions:
        return 1.0
    bins = [0] * 10
    for r in reactions:
        bins[min(9, int(r.buy_likelihood * 10))] += 1
    max_share = max(bins) / len(reactions)
    return clamp((max_share - 0.15) / 0.85)


def _benchmark_confidence(features: StimulusFeatures, benchmark_dir: Path | None,
                          notes: list[str]) -> tuple[str, str | None]:
    """P0: do we have sample benchmark data for the detected category?
    Deliberately capped at 'medium' until real calibration studies land
    (never overstate trust — that's the whole point of the panel)."""
    if benchmark_dir is None or not benchmark_dir.exists():
        return "low", features.category
    index_file = benchmark_dir / "index.json"
    if not index_file.exists():
        return "low", features.category
    try:
        index = json.loads(index_file.read_text())
    except (OSError, json.JSONDecodeError):
        return "low", features.category
    entry = index.get(features.category)
    if not entry:
        notes.append(
            f"No benchmark samples for category '{features.category}' — "
            "treat absolute numbers as directional only."
        )
        return "low", features.category
    notes.append(
        f"Benchmark samples found for '{features.category}' "
        f"({entry.get('samples', 0)} reference sets) — confidence capped at medium for P0."
    )
    return "medium", features.category

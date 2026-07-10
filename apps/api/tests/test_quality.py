"""Quality system tests — most importantly: collapse detection actually fires."""

import asyncio

from app.schemas.reaction import PersonaReaction
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.quality import RunningCollapseMonitor, compute_quality
from app.services.stimulus_parser import parse_stimulus

STIM = (
    "LedgerLift is bookkeeping automation for ecommerce sellers. Connects to "
    "Shopify and Amazon, auto-categorizes transactions, files sales tax. "
    "$49/month, free 30-day trial, cancel anytime. 1,200 stores onboard."
)


def _healthy_run(n=200):
    personas, _, _ = PersonaGenerator(seed=11).generate("us_smb", n)
    features = parse_stimulus(STIM, "LedgerLift", "product_concept")
    provider = MockPersonaProvider(seed=11)
    reactions = asyncio.run(provider.react_batch(personas, STIM, "product_concept", features))
    return personas, reactions, features


def test_healthy_run_scores_sanely():
    personas, reactions, features = _healthy_run()
    q = compute_quality(personas, reactions, features)
    assert q.persona_adherence >= 0.55, "trait-behavior correlations should be visible"
    assert q.collapse_risk == "low", f"healthy run flagged collapsed: {q.collapse_risk_score}"
    assert q.generic_response_rate <= 0.10
    assert q.duplicate_objection_rate < 0.9
    assert q.objection_entropy in ("medium", "high")


def test_collapsed_run_is_detected():
    personas, reactions, features = _healthy_run()
    clone = reactions[0]
    collapsed = [
        PersonaReaction(**{**clone.model_dump(),
                           "persona_id": p.persona_id,
                           "buy_likelihood": 0.51,
                           "status": "yellow",
                           "first_objection": "it seems useful but I am not sure",
                           "quote": "It seems useful. I would consider it."})
        for p in personas
    ]
    q = compute_quality(personas, collapsed, features)
    assert q.collapse_risk == "high", f"clone swarm not flagged: score={q.collapse_risk_score}"
    assert q.duplicate_objection_rate > 0.9
    assert q.generic_response_rate > 0.9
    assert q.objection_entropy == "low"


def test_running_collapse_monitor():
    personas, reactions, _ = _healthy_run()
    healthy = RunningCollapseMonitor()
    for r in reactions:
        healthy.update(r)
    assert healthy.level == "low"

    collapsed = RunningCollapseMonitor()
    clone = reactions[0]
    for _ in range(100):
        collapsed.update(clone)
    assert collapsed.level == "high"


def test_segment_variance_measured():
    personas, reactions, features = _healthy_run(300)
    q = compute_quality(personas, reactions, features)
    # us_smb has 4 sub-segments with different trait profiles -> variance visible
    assert q.segment_variance_score > 0.0
    assert q.segment_variance in ("weak", "moderate", "strong")


def test_new_quality_fields_present_and_valid():
    personas, reactions, features = _healthy_run()
    q = compute_quality(personas, reactions, features)
    assert q.age_cohort_variance in ("weak", "moderate", "strong")
    assert 0.0 <= q.criteria_consistency <= 1.0

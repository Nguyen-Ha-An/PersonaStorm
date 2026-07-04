"""Focused unit tests for `diagnose_weakness` in criteria_aggregation.py.

Covers the Important review finding: weakest_criteria and strongest_criteria
must be disjoint (no criterion appears in both), while staying barrier-aware
(a high raw proof_requirement is a weakness, never a strength).
"""

from app.services.aggregation.criteria_aggregation import diagnose_weakness
from app.services.criteria import registry as reg
from app.schemas.report import CriterionBreakdown


def _breakdown(cid: str, avg: float, weight: float = 0.1) -> CriterionBreakdown:
    crit = reg.CRITERION_BY_ID[cid]
    return CriterionBreakdown(
        criterion_id=cid,
        label=crit.label,
        average_score=avg,
        higher_is_better=crit.higher_is_better,
        weight=weight,
        segment_scores=[],
        interpretation="",
    )


def _all_breakdowns(overrides: dict[str, float], default: float = 0.5) -> list[CriterionBreakdown]:
    """One breakdown per core criterion; `overrides` set specific averages."""
    return [
        _breakdown(cid, overrides.get(cid, default), weight=0.1 if cid not in overrides else 0.2)
        for cid in reg.CORE_IDS
    ]


def test_high_proof_requirement_barrier_is_weakness_not_strength():
    # proof_requirement is a barrier (higher_is_better=False); a HIGH raw
    # score means personas demand a lot of proof -> that's a weakness.
    breakdowns = _all_breakdowns({"proof_requirement": 0.9, "trust": 0.5})
    weakest, strongest, top_blockers, top_strengths = diagnose_weakness(breakdowns, "generic")

    weakest_ids = {c.criterion_id for c in weakest}
    strongest_ids = {c.criterion_id for c in strongest}

    assert "proof_requirement" in weakest_ids
    assert "proof_requirement" not in strongest_ids


def test_weakest_and_strongest_are_disjoint():
    # A realistic-ish mixed spread of scores across all 17 criteria.
    overrides = {
        "trust": 0.55,             # borderline, high weight -> historically appeared in both lists
        "proof_requirement": 0.85,  # barrier, high raw -> weakness
        "perceived_roi": 0.92,      # genuinely strong
        "value_clarity": 0.1,       # genuinely weak
    }
    breakdowns = _all_breakdowns(overrides)
    weakest, strongest, top_blockers, top_strengths = diagnose_weakness(breakdowns, "generic")

    weakest_ids = {c.criterion_id for c in weakest}
    strongest_ids = {c.criterion_id for c in strongest}

    assert weakest_ids.isdisjoint(strongest_ids)
    # sanity: labels used for top_blockers/top_strengths also don't overlap
    assert set(top_blockers).isdisjoint(set(top_strengths))


def test_high_benefit_criterion_lands_in_strongest_not_weakest():
    # trust is a normal (non-barrier) criterion; a high average is a real asset.
    breakdowns = _all_breakdowns({"trust": 0.9})
    weakest, strongest, top_blockers, top_strengths = diagnose_weakness(breakdowns, "generic")

    weakest_ids = {c.criterion_id for c in weakest}
    strongest_ids = {c.criterion_id for c in strongest}

    assert "trust" in strongest_ids
    assert "trust" not in weakest_ids

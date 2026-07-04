"""Criteria aggregation + weakness diagnosis.

Turns the swarm's 17-criterion report cards into (a) a per-criterion breakdown
(average across all personas, plus a per-segment split), and (b) a ranked
weakness/strength diagnosis. Ranking uses the registry's `effective` score so
BARRIER criteria (e.g. `proof_requirement`) rank correctly — a HIGH raw
proof_requirement is a WEAKNESS, not a strength.

Numbers are real aggregates over actual reactions; the templated
`interpretation` strings are narration the analyst agent may later rewrite.
"""

from __future__ import annotations

from ...schemas.reaction import PersonaReaction
from ...schemas.report import CriterionBreakdown, CriterionCard
from ..criteria import registry
from ..criteria.presets import resolve_preset

# Rough score bands used to phrase interpretations.
_HIGH = 0.66
_LOW = 0.4


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _interpret(cid: str, label: str, avg: float) -> str:
    """A short, barrier-aware sentence describing where the swarm landed on
    this criterion. `effective` folds barrier polarity in so 'strong'/'weak'
    always means good-for-adoption / bad-for-adoption."""
    eff = registry.effective(cid, avg)
    barrier = registry.is_barrier(cid)
    low_label = label.lower()
    if barrier:
        # High raw score on a barrier = a lot of friction.
        if avg >= _HIGH:
            return f"Personas demand heavy {low_label} — a real adoption barrier here."
        if avg <= _LOW:
            return f"{label} is low — this is not blocking adoption."
        return f"Moderate {low_label}; watch it but not the top blocker."
    if eff >= _HIGH:
        return f"Strong {low_label} — a clear asset to lead with."
    if eff <= _LOW:
        return f"Weak {low_label} — personas are unconvinced here."
    return f"Middling {low_label}; there is upside if sharpened."


def build_criteria_breakdown(
    reactions: list[PersonaReaction], category: str
) -> list[CriterionBreakdown]:
    """One `CriterionBreakdown` per core criterion, in registry order.

    average_score = mean of the raw criterion across all reactions; weight comes
    from the resolved category preset; segment_scores is the per-segment mean.
    """
    weights = resolve_preset(category).weights
    dicts = [r.criteria_scores.as_dict() for r in reactions]

    # Group reactions by segment once for the per-segment split.
    by_seg: dict[str, list[dict[str, float]]] = {}
    for r, d in zip(reactions, dicts):
        by_seg.setdefault(r.segment or "unknown", []).append(d)

    out: list[CriterionBreakdown] = []
    for cid in registry.CORE_IDS:
        crit = registry.CRITERION_BY_ID[cid]
        avg = _mean([d[cid] for d in dicts])
        segment_scores = [
            {"segment": seg, "score": round(_mean([d[cid] for d in ds]), 4)}
            for seg, ds in sorted(by_seg.items(), key=lambda kv: -len(kv[1]))
        ]
        out.append(
            CriterionBreakdown(
                criterion_id=cid,
                label=crit.label,
                average_score=round(avg, 4),
                higher_is_better=crit.higher_is_better,
                weight=round(weights.get(cid, 0.0), 4),
                segment_scores=segment_scores,
                interpretation=_interpret(cid, crit.label, avg),
            )
        )
    return out


def diagnose_weakness(
    breakdowns: list[CriterionBreakdown], category: str
) -> tuple[list[CriterionCard], list[CriterionCard], list[str], list[str]]:
    """Rank criteria by importance * deficit and by importance * effective.

    Returns (weakest_criteria, strongest_criteria, top_blockers, top_strengths).
    - weakest: highest `weight * (1 - effective(cid, avg))` (biggest weighted gap)
    - strongest: highest `weight * effective(cid, avg)` (biggest weighted asset)
    - top_blockers / top_strengths: the top-3 LABELS of each list.
    Uses `registry.effective` so barriers rank correctly.
    """

    def card(b: CriterionBreakdown) -> CriterionCard:
        return CriterionCard(
            criterion_id=b.criterion_id,
            label=b.label,
            average_score=b.average_score,
            weight=b.weight,
            interpretation=b.interpretation,
        )

    scored = []
    for b in breakdowns:
        eff = registry.effective(b.criterion_id, b.average_score)
        weight = b.weight
        deficit = 1.0 - eff
        scored.append((b, eff, weight * deficit, weight * eff))

    weakest = sorted(scored, key=lambda s: -s[2])[:5]
    strongest = sorted(scored, key=lambda s: -s[3])[:5]

    weakest_cards = [card(b) for b, *_ in weakest]
    strongest_cards = [card(b) for b, *_ in strongest]
    top_blockers = [b.label for b, *_ in weakest[:3]]
    top_strengths = [b.label for b, *_ in strongest[:3]]
    return weakest_cards, strongest_cards, top_blockers, top_strengths

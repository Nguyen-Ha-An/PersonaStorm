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
    """Partition criteria into disjoint weakness/strength pools, then rank each.

    Returns (weakest_criteria, strongest_criteria, top_blockers, top_strengths).

    The split is relative, not an absolute 0.5 cutoff: criteria are ordered by
    their barrier-aware `effective` score (low -> high) and divided at the
    median rank, so the bottom half of THIS run's spread is the weakness pool
    and the top half is the strength pool. This keeps both lists non-empty
    whenever there are >= 2 criteria (guaranteed here, there are always 17),
    even for a run where every criterion happens to score above/below a fixed
    absolute midpoint — unlike a fixed effective<=0.5 threshold, which can
    empty out one pool entirely for a lopsidedly strong or weak product.
    Within each pool:
    - weakest: ranked by `weight * deficit` (deficit = 1 - effective) descending.
    - strongest: ranked by `weight * effective` descending.
    Because the split is a partition of the same 17 criteria into two
    non-overlapping halves, a criterion can never appear in both pools (e.g. a
    high-proof_requirement barrier has a low `effective` score, so it always
    sorts into the bottom/weakness half — `effective` already inverts barrier
    polarity). Each resulting list is capped at 5; top_blockers / top_strengths
    take the top-3 LABELS of each. If a pool has fewer members than the cap
    (small `breakdowns` input), the resulting list is simply shorter.
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
        scored.append((b, eff))

    # Order by effective score ascending; the bottom half is the weakness
    # pool, the top half is the strength pool. Split at the median rank so
    # both pools exist regardless of the absolute score distribution.
    ranked = sorted(scored, key=lambda s: s[1])
    split = len(ranked) // 2
    weakness_pool = ranked[:split]
    strength_pool = ranked[split:]

    weakest_scored = [(b, b.weight * (1.0 - eff)) for b, eff in weakness_pool]
    strongest_scored = [(b, b.weight * eff) for b, eff in strength_pool]

    weakest = sorted(weakest_scored, key=lambda s: -s[1])[:5]
    strongest = sorted(strongest_scored, key=lambda s: -s[1])[:5]

    weakest_cards = [card(b) for b, _ in weakest]
    strongest_cards = [card(b) for b, _ in strongest]
    top_blockers = [b.label for b, _ in weakest[:3]]
    top_strengths = [b.label for b, _ in strongest[:3]]
    return weakest_cards, strongest_cards, top_blockers, top_strengths

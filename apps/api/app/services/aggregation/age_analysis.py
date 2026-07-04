"""Age-cohort aggregation.

Groups reactions by life stage and, per cohort, reports adoption, average buy
likelihood / market fit, and the cohort's top barrier — the life-stage OVERLAY
criterion with the lowest EFFECTIVE score averaged across the cohort. Only
cohorts that actually appear in the run are returned.
"""

from __future__ import annotations

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ...schemas.report import AgeCohortReport
from ..criteria import registry
from ..criteria.age_overlays import overlay_ids_for


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _top_barrier(life_stage: str, cohort: list[PersonaReaction]) -> str:
    """Lowest-EFFECTIVE overlay criterion averaged across the cohort, as a label.

    A high-scoring barrier overlay (e.g. `safety_concern`) folds to a low
    effective score, so it surfaces as the top barrier just like a genuinely
    low benefit criterion would."""
    overlay_ids = overlay_ids_for(life_stage)
    if not overlay_ids:
        return "none identified"

    best_id, best_eff = None, 2.0
    for cid in overlay_ids:
        scores = [r.age_specific_scores[cid] for r in cohort if cid in r.age_specific_scores]
        if not scores:
            continue
        eff = registry.effective(cid, _mean(scores))
        if eff < best_eff:
            best_id, best_eff = cid, eff

    if best_id is None:
        return "none identified"
    crit = registry.CRITERION_BY_ID.get(best_id)
    return crit.label if crit else best_id.replace("_", " ")


def build_age_cohorts(
    personas: list[Persona], reactions: list[PersonaReaction]
) -> list[AgeCohortReport]:
    by_stage: dict[str, list[PersonaReaction]] = {}
    for r in reactions:
        stage = r.life_stage or "unknown"
        by_stage.setdefault(stage, []).append(r)

    out: list[AgeCohortReport] = []
    for stage, cohort in sorted(by_stage.items(), key=lambda kv: -len(kv[1])):
        n = len(cohort)
        green = sum(1 for r in cohort if r.status == "green")
        adoption_rate = green / n
        avg_like = _mean([r.buy_likelihood for r in cohort])
        avg_fit = _mean([r.market_fit_score for r in cohort])
        barrier = _top_barrier(stage, cohort)
        stage_label = stage.replace("_", " ")

        if adoption_rate >= 0.5:
            insight = (f"{stage_label.title()} is a strong cohort "
                       f"({adoption_rate:.0%} adoption); residual barrier: {barrier}.")
        elif adoption_rate <= 0.2:
            insight = (f"{stage_label.title()} barely adopts "
                       f"({adoption_rate:.0%}); dominant barrier: {barrier}.")
        else:
            insight = (f"{stage_label.title()} is on the fence "
                       f"({adoption_rate:.0%} adoption); converting them hinges on {barrier}.")

        out.append(AgeCohortReport(
            life_stage=stage,
            personas=n,
            adoption_rate=round(adoption_rate, 3),
            avg_buy_likelihood=round(avg_like, 3),
            avg_market_fit_score=round(avg_fit, 3),
            top_barrier=barrier,
            insight=insight,
        ))
    return out

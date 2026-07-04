"""Core criteria registry — single source of truth for criterion polarity."""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class Criterion:
    id: str
    label: str
    description: str
    higher_is_better: bool
    group: str
    score_type: str = "0_to_1"


_CORE = [
    Criterion("problem_awareness", "Problem Awareness", "Does the persona recognize the problem?", True, "problem"),
    Criterion("need_intensity", "Need Intensity", "How painful/important is the problem for this persona?", True, "problem"),
    Criterion("urgency", "Urgency", "How soon would this persona want a solution?", True, "problem"),
    Criterion("solution_fit", "Solution Fit", "How well does the product match the persona's actual need?", True, "value"),
    Criterion("value_clarity", "Value Clarity", "How clearly does the persona understand the value?", True, "value"),
    Criterion("differentiation", "Differentiation", "How different does it feel from existing alternatives?", True, "value"),
    Criterion("trust", "Trust", "How much does the persona trust the product's claims?", True, "trust_risk"),
    Criterion("proof_requirement", "Proof Requirement", "How much proof this persona needs before believing/buying (barrier).", False, "trust_risk"),
    Criterion("pricing_acceptance", "Pricing Acceptance", "How acceptable is the current/implied price?", True, "pricing"),
    Criterion("perceived_roi", "Perceived ROI", "Does the persona believe it's worth the cost?", True, "pricing"),
    Criterion("ease_of_understanding", "Ease of Understanding", "How easy is it to understand what the product does?", True, "adoption"),
    Criterion("workflow_fit", "Workflow Fit", "How naturally does it fit current habits/workflow?", True, "adoption"),
    Criterion("switching_willingness", "Switching Willingness", "How willing to change from current alternatives?", True, "adoption"),
    Criterion("activation_likelihood", "Activation Likelihood", "How likely to try it soon?", True, "adoption"),
    Criterion("repeat_usage_potential", "Repeat Usage", "How likely to use it repeatedly?", True, "retention"),
    Criterion("shareability", "Shareability", "How likely to tell others about it?", True, "virality"),
    Criterion("retention_potential", "Retention Potential", "How likely to keep using/paying?", True, "retention"),
]

CORE_CRITERIA: tuple[Criterion, ...] = tuple(_CORE)
CORE_IDS: tuple[str, ...] = tuple(c.id for c in _CORE)
CRITERION_BY_ID: dict[str, Criterion] = {c.id: c for c in _CORE}


def register(criteria: list[Criterion]) -> None:
    for c in criteria:
        CRITERION_BY_ID.setdefault(c.id, c)


def is_barrier(cid: str) -> bool:
    c = CRITERION_BY_ID.get(cid)
    return c is not None and not c.higher_is_better


def effective(cid: str, score: float) -> float:
    return (1.0 - score) if is_barrier(cid) else score

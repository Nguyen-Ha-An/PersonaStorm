"""Age / life-stage overlay criteria.

Defines the six life stages used to bucket a persona's age, the extra
("overlay") criteria that become relevant for each stage, and a small
lambda "bump" that later stages of the pipeline (the scorer) use to
adjust how much weight overlay criteria carry relative to core criteria.

On import, all overlay criteria are registered into the shared
`registry.CRITERION_BY_ID` map so the scorer can look up polarity
(`registry.is_barrier`) for any overlay id.
"""
from __future__ import annotations

from .registry import Criterion, register

LIFE_STAGES: tuple[str, ...] = (
    "teen_student",
    "student_young_adult",
    "early_career",
    "parent_family",
    "established_adult",
    "older_adult",
)

# Inclusive (low, high) age bands. `older_adult` has no upper bound.
_AGE_BANDS: dict[str, tuple[int, float]] = {
    "teen_student": (13, 17),
    "student_young_adult": (18, 24),
    "early_career": (25, 34),
    "parent_family": (35, 44),
    "established_adult": (45, 60),
    "older_adult": (61, float("inf")),
}

_LAMBDA_BUMP: dict[str, float] = {
    "teen_student": 0.08,
    "older_adult": 0.06,
    "parent_family": 0.03,
}

# Barrier criteria (higher_is_better=False) among the overlays.
_BARRIER_IDS = {"safety_concern", "subscription_fatigue"}

_OVERLAY_DEFS: dict[str, list[tuple[str, str, str]]] = {
    "teen_student": [
        ("parent_approval", "Parent Approval", "How likely parents/guardians are to approve of this."),
        ("peer_influence", "Peer Influence", "How much friends/peers shape this teen's adoption decision."),
        ("trend_alignment", "Trend Alignment", "How aligned the product feels with current trends among teens."),
        ("school_relevance", "School Relevance", "How relevant the product is to school life/schoolwork."),
        ("allowance_affordability", "Allowance Affordability", "How affordable the product is on a teen's allowance/pocket money."),
        ("identity_fit", "Identity Fit", "How well the product fits the teen's sense of identity/self-image."),
        ("attention_fit", "Attention Fit", "How well the product fits a teen's attention span and usage habits."),
        ("safety_concern", "Safety Concern", "How much safety worry the product raises for a teen or their parents (barrier)."),
    ],
    "student_young_adult": [
        ("budget_fit", "Budget Fit", "How well the price fits a student/young adult's limited budget."),
        ("trialability", "Trialability", "How easy it is to try before committing."),
        ("creator_influence", "Creator Influence", "How much creators/influencers shape this persona's decision."),
        ("identity_signal", "Identity Signal", "How much using the product signals who this persona is/wants to be."),
        ("self_improvement_value", "Self-Improvement Value", "How much the product supports personal growth/self-improvement."),
        ("future_benefit", "Future Benefit", "How much the product is seen as an investment in future outcomes."),
        ("social_validation", "Social Validation", "How much social approval/validation using the product brings."),
    ],
    "early_career": [
        ("career_value", "Career Value", "How much the product helps advance this persona's career."),
        ("productivity_gain", "Productivity Gain", "How much measurable productivity the product provides."),
        ("time_saving", "Time Saving", "How much time the product saves in day-to-day work."),
        ("professional_credibility", "Professional Credibility", "How much the product enhances professional credibility."),
        ("subscription_fatigue", "Subscription Fatigue", "How much fatigue/resistance exists toward yet another subscription (barrier)."),
        ("workflow_fit", "Workflow Fit", "How naturally does it fit current habits/workflow?"),
    ],
    "parent_family": [
        ("family_value", "Family Value", "How much value the product brings to the whole family."),
        ("child_safety", "Child Safety", "How safe the product is for the persona's children."),
        ("household_budget_fit", "Household Budget Fit", "How well the product fits a household budget with family expenses."),
        ("convenience", "Convenience", "How much time/effort the product saves for a busy parent."),
        ("reliability", "Reliability", "How dependable/consistent the product is for family use."),
        ("outcome_proof", "Outcome Proof", "How much proven, concrete outcomes the product can demonstrate."),
    ],
    "established_adult": [
        ("simplicity", "Simplicity", "How simple and uncomplicated the product is to use."),
        ("brand_credibility", "Brand Credibility", "How credible/established the brand feels."),
        ("support_availability", "Support Availability", "How available and responsive support is when needed."),
        ("risk_reduction", "Risk Reduction", "How much the product reduces perceived risk of a bad decision."),
        ("familiarity", "Familiarity", "How familiar/recognizable the product or its patterns are."),
        ("low_learning_curve", "Low Learning Curve", "How little effort is required to learn to use the product."),
    ],
    "older_adult": [
        ("ease_of_use", "Ease of Use", "How easy the product is to operate without assistance."),
        ("safety", "Safety", "How safe the product feels to use."),
        ("human_support", "Human Support", "How available real human help/support is."),
        ("familiarity", "Familiarity", "How familiar/recognizable the product or its patterns are."),
        ("low_setup_friction", "Low Setup Friction", "How little friction there is to get started/set up."),
        ("trust_in_provider", "Trust in Provider", "How much this persona trusts the company/provider behind the product."),
    ],
}

_OVERLAY_IDS_BY_STAGE: dict[str, tuple[str, ...]] = {
    stage: tuple(cid for cid, _label, _desc in defs)
    for stage, defs in _OVERLAY_DEFS.items()
}


def life_stage_for(age: int) -> str:
    """Map an age (in years) to its life stage bucket."""
    for stage, (low, high) in _AGE_BANDS.items():
        if low <= age <= high:
            return stage
    # Below the youngest band (e.g. age < 13): fall back to the
    # youngest defined stage rather than raising.
    return LIFE_STAGES[0]


def overlay_ids_for(life_stage: str) -> tuple[str, ...]:
    """Return the ordered overlay criterion ids for a life stage.

    Unknown life stages return an empty tuple.
    """
    return _OVERLAY_IDS_BY_STAGE.get(life_stage, ())


def lambda_bump(life_stage: str) -> float:
    """Extra weight-lambda bump applied for a given life stage."""
    return _LAMBDA_BUMP.get(life_stage, 0.0)


def _build_criteria() -> list[Criterion]:
    criteria: list[Criterion] = []
    for defs in _OVERLAY_DEFS.values():
        for cid, label, desc in defs:
            criteria.append(
                Criterion(
                    id=cid,
                    label=label,
                    description=desc,
                    higher_is_better=cid not in _BARRIER_IDS,
                    group="age_overlay",
                )
            )
    return criteria


register(_build_criteria())

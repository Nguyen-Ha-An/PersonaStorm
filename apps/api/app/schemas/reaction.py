"""Persona reaction schema.

IMPORTANT: `reasoning_summary` is a short, user-facing explanation of the
reaction ("high price sensitivity + no visible pricing -> hesitant"). It is
NEVER a hidden chain-of-thought, and providers must not put raw model
deliberation into it. This is an explicit product rule (engineering rule #4).

The reaction is a nested, multi-criteria report card:

- `decision`     — the headline verdict (buy likelihood, market fit, status,
                   willingness to pay, recommended pricing model).
- `criteria_scores` — the 17 core purchase-decision criteria, 0..1 each.
- `age_specific_scores` — life-stage overlay criteria (teen peer influence,
                   parent approval, ...), keyed by overlay id.
- `qualitative`  — the human texture (objections, quote, emotional reaction).
- `research_recommendation` — where a human study would de-risk this most.
- `market_fit_breakdown` — the authoritative scorer's audit trail; market fit
                   is ALWAYS system-computed by `compute_market_fit`, never
                   invented by a provider.

Read-only `@property` compat shims (`buy_likelihood`, `status`, `max_price`,
`market_fit_score`, `first_objection`, `quote`, `positive_trigger`) preserve
the flat surface that aggregation, quality metrics, and the SSE stream rely on,
so downstream code keeps working unchanged.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from ..services.criteria.registry import CORE_IDS
from ..services.criteria.scoring import MarketFitBreakdown

ReactionStatus = Literal["green", "yellow", "red"]

# Status thresholds are defined once, here, so the mock provider, real
# providers, and the frontend legend can never drift apart.
GREEN_THRESHOLD = 0.62
RED_THRESHOLD = 0.38


def status_for(buy_likelihood: float) -> ReactionStatus:
    if buy_likelihood >= GREEN_THRESHOLD:
        return "green"
    if buy_likelihood < RED_THRESHOLD:
        return "red"
    return "yellow"


PricingModel = Literal[
    "one_time", "subscription", "usage_based", "seat_based",
    "enterprise", "freemium", "unknown",
]

BestNextTest = Literal[
    "survey", "interview", "landing_page_ab_test", "pricing_test",
    "ad_test", "usability_test",
]


class Decision(BaseModel):
    """The headline verdict. `market_fit_score` is always the output of the
    authoritative scorer (`compute_market_fit`); `overall_buy_likelihood` is a
    correlated-but-distinct adoption blend that drives the traffic-light."""

    overall_buy_likelihood: float = Field(..., ge=0.0, le=1.0)
    market_fit_score: float = Field(..., ge=0.0, le=1.0)
    status: ReactionStatus
    max_price: float = Field(..., ge=0.0, description="Max acceptable price, USD/month or one-off")
    currency: str = "USD"
    recommended_pricing_model: PricingModel = "unknown"


class CoreCriteriaScores(BaseModel):
    """One persona's report card across the 17 core purchase-decision criteria.
    Each score is 0..1; polarity (barrier vs. benefit) lives in the registry —
    a HIGH `proof_requirement` is a BARRIER, not a good thing."""

    problem_awareness: float = Field(..., ge=0.0, le=1.0)
    need_intensity: float = Field(..., ge=0.0, le=1.0)
    urgency: float = Field(..., ge=0.0, le=1.0)
    solution_fit: float = Field(..., ge=0.0, le=1.0)
    value_clarity: float = Field(..., ge=0.0, le=1.0)
    differentiation: float = Field(..., ge=0.0, le=1.0)
    trust: float = Field(..., ge=0.0, le=1.0)
    proof_requirement: float = Field(..., ge=0.0, le=1.0)
    pricing_acceptance: float = Field(..., ge=0.0, le=1.0)
    perceived_roi: float = Field(..., ge=0.0, le=1.0)
    ease_of_understanding: float = Field(..., ge=0.0, le=1.0)
    workflow_fit: float = Field(..., ge=0.0, le=1.0)
    switching_willingness: float = Field(..., ge=0.0, le=1.0)
    activation_likelihood: float = Field(..., ge=0.0, le=1.0)
    repeat_usage_potential: float = Field(..., ge=0.0, le=1.0)
    shareability: float = Field(..., ge=0.0, le=1.0)
    retention_potential: float = Field(..., ge=0.0, le=1.0)

    def as_dict(self) -> dict[str, float]:
        return {cid: getattr(self, cid) for cid in CORE_IDS}


class Qualitative(BaseModel):
    """The human texture behind the numbers — grounded objections, quotes, and
    emotional read. Never chain-of-thought; always user-facing."""

    first_objection: str = Field("", max_length=280)
    top_positive_trigger: str = Field("", max_length=280)
    top_negative_trigger: str = Field("", max_length=280)
    dealbreaker: str = Field("", max_length=200)
    proof_needed: str = Field("", max_length=200)
    emotional_reaction: str = Field("", max_length=160)
    would_tell: str = Field("", max_length=280, description="What they'd say to a friend/colleague")
    quote: str = Field("", max_length=400, description="First-person verbatim-style quote")


class ResearchRecommendation(BaseModel):
    """Where a real human study would de-risk this reaction most — this is the
    product's honest 'don't trust the synthetic swarm blindly' hook."""

    should_validate_with_humans: bool = True
    validation_question: str = Field("", max_length=300)
    best_next_test: BestNextTest = "survey"


# Flat compat keys some callers still pass into the constructor (see
# test_quality.py's clone-swarm builder, real providers before they upgrade).
# `model_validator(mode="before")` routes them into the nested models so the
# read-only property shims stay perfectly consistent with construction.
_DECISION_COMPAT = {"buy_likelihood": "overall_buy_likelihood"}
_QUALITATIVE_COMPAT = {"positive_trigger": "top_positive_trigger"}


class PersonaReaction(BaseModel):
    """Structured reaction of one persona to one stimulus."""

    persona_id: str
    segment: str = ""
    sub_segment: str = ""
    life_stage: str = ""

    decision: Decision
    criteria_scores: CoreCriteriaScores
    age_specific_scores: dict[str, float] = Field(default_factory=dict)
    qualitative: Qualitative
    research_recommendation: ResearchRecommendation
    reasoning_summary: str = Field(
        ...,
        description="Short public explanation only — never hidden chain-of-thought",
        max_length=400,
    )
    market_fit_breakdown: MarketFitBreakdown | None = None

    @model_validator(mode="before")
    @classmethod
    def _accept_flat_compat_keys(cls, data):
        """Route legacy flat kwargs into the nested models so callers that
        still pass `buy_likelihood`/`status`/`max_price`/`first_objection`/etc.
        (or override them on a `model_dump()`) construct a valid, consistent
        reaction. Nested payloads pass through untouched."""
        if not isinstance(data, dict):
            return data
        data = dict(data)

        decision = dict(data.get("decision") or {})
        qualitative = dict(data.get("qualitative") or {})

        # decision-level flat keys
        for flat, nested in _DECISION_COMPAT.items():
            if flat in data:
                decision[nested] = data.pop(flat)
        for key in ("status", "max_price", "market_fit_score", "currency",
                    "recommended_pricing_model"):
            if key in data:
                decision[key] = data.pop(key)

        # qualitative-level flat keys
        for flat, nested in _QUALITATIVE_COMPAT.items():
            if flat in data:
                qualitative[nested] = data.pop(flat)
        for key in ("first_objection", "top_negative_trigger", "dealbreaker",
                    "proof_needed", "emotional_reaction", "would_tell", "quote"):
            if key in data:
                qualitative[key] = data.pop(key)

        if decision:
            data["decision"] = decision
        if qualitative:
            data["qualitative"] = qualitative
        return data

    # --- read-only compat shims (downstream + SSE rely on these) --------------
    @property
    def buy_likelihood(self) -> float:
        return self.decision.overall_buy_likelihood

    @property
    def status(self) -> ReactionStatus:
        return self.decision.status

    @property
    def max_price(self) -> float:
        return self.decision.max_price

    @property
    def market_fit_score(self) -> float:
        return self.decision.market_fit_score

    @property
    def first_objection(self) -> str:
        return self.qualitative.first_objection

    @property
    def quote(self) -> str:
        return self.qualitative.quote

    @property
    def positive_trigger(self) -> str:
        return self.qualitative.top_positive_trigger

"""Final report schema — the contract for GET /api/storm/{id}/report."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from .quality import QualityMetrics

# Product rule #3: synthetic outputs are hypotheses, not human research.
# The disclaimer ships inside the report payload so every consumer renders it.
DISCLAIMER = (
    "PersonaStorm output is a synthetic signal produced by a calibrated persona "
    "model. It is a hypothesis generator for pre-research — objections and price "
    "bands to validate with real humans — not a replacement for real user research."
)


class AdoptionSummary(BaseModel):
    green: int = 0
    yellow: int = 0
    red: int = 0
    average_buy_likelihood: float = Field(0.0, ge=0.0, le=1.0)
    average_market_fit_score: float = Field(0.0, ge=0.0, le=1.0)


class SegmentReport(BaseModel):
    segment: str
    personas: int
    green: int
    yellow: int
    red: int
    adoption_rate: float = Field(..., ge=0.0, le=1.0, description="green / personas")
    avg_buy_likelihood: float = Field(..., ge=0.0, le=1.0)
    avg_max_price: float = Field(..., ge=0.0)
    top_objection: str
    insight: str


class ObjectionCluster(BaseModel):
    label: str = Field(..., description="Representative phrasing of the objection")
    count: int
    share: float = Field(..., ge=0.0, le=1.0)
    example_quote: str
    top_segments: list[str] = Field(default_factory=list)


class PricePoint(BaseModel):
    price: float
    share_willing: float = Field(..., ge=0.0, le=1.0)


class Recommendation(BaseModel):
    title: str
    detail: str
    priority: Literal["now", "next", "later"] = "next"


class KillQuoteContext(BaseModel):
    """Who said the kill quote — so the report can show it's not cherry-picked."""

    persona_id: str
    segment: str
    buy_likelihood: float
    skepticism: float


class Overall(BaseModel):
    """Headline verdict for the whole run — the number leadership reads first."""

    market_fit_score: float = Field(..., ge=0.0, le=1.0)
    confidence: Literal["low", "medium", "high"]
    top_blockers: list[str] = Field(default_factory=list)
    top_strengths: list[str] = Field(default_factory=list)


class CriterionBreakdown(BaseModel):
    """One of the 17 core criteria, averaged across the whole swarm."""

    criterion_id: str
    label: str
    average_score: float = Field(..., ge=0.0, le=1.0)
    higher_is_better: bool
    weight: float = Field(..., ge=0.0)
    segment_scores: list[dict] = Field(default_factory=list)
    interpretation: str = ""


class CriterionCard(BaseModel):
    """A ranked criterion in the weakness/strength diagnosis."""

    criterion_id: str
    label: str
    average_score: float = Field(..., ge=0.0, le=1.0)
    weight: float = Field(..., ge=0.0)
    interpretation: str = ""


class AgeCohortReport(BaseModel):
    """Adoption + top barrier for one life-stage cohort that appears in the run."""

    life_stage: str
    personas: int
    adoption_rate: float = Field(..., ge=0.0, le=1.0)
    avg_buy_likelihood: float = Field(..., ge=0.0, le=1.0)
    avg_market_fit_score: float = Field(..., ge=0.0, le=1.0)
    top_barrier: str
    insight: str


class NextValidation(BaseModel):
    """A concrete human-research test the swarm says would de-risk this most."""

    question: str
    test_type: str
    rationale: str


class StormReport(BaseModel):
    storm_id: str
    title: str
    summary: str
    product_category: str = "generic"

    adoption: AdoptionSummary
    overall: Overall | None = None
    segments: list[SegmentReport]
    criteria_breakdown: list[CriterionBreakdown] = Field(default_factory=list)
    weakest_criteria: list[CriterionCard] = Field(default_factory=list)
    strongest_criteria: list[CriterionCard] = Field(default_factory=list)
    age_cohorts: list[AgeCohortReport] = Field(default_factory=list)
    top_objections: list[ObjectionCluster]
    price_sensitivity: list[PricePoint]

    kill_quote: str
    kill_quote_context: KillQuoteContext | None = None

    quality: QualityMetrics
    recommendations: list[Recommendation]
    next_human_validation: list[NextValidation] = Field(default_factory=list)

    persona_count: int
    stimulus_type: str
    target_market: str
    avg_max_price: float = 0.0
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    disclaimer: str = DISCLAIMER

    # Calibration provenance — mirrors apps/web buildCalibrationEvidence(), minus
    # counterfactual_audit (that check does not exist in this reference engine;
    # see docs for the documented parity exception). Additive + optional so
    # legacy persisted reports without this field still validate. Keys:
    # priors_coverage, priors_source, assumptions_fired, confidence_downgrades,
    # and (Phase B) semantic_source — one of "nvidia" | "fireworks" |
    # "fallback_formulas", the provenance of the semantic grounding matrix
    # blended into the 5 grounded criteria (see services/semantic/types.py).
    calibration_evidence: dict | None = None

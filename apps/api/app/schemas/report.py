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


class StormReport(BaseModel):
    storm_id: str
    title: str
    summary: str

    adoption: AdoptionSummary
    segments: list[SegmentReport]
    top_objections: list[ObjectionCluster]
    price_sensitivity: list[PricePoint]

    kill_quote: str
    kill_quote_context: KillQuoteContext | None = None

    quality: QualityMetrics
    recommendations: list[Recommendation]

    persona_count: int
    stimulus_type: str
    target_market: str
    avg_max_price: float = 0.0
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    disclaimer: str = DISCLAIMER

"""Storm run request/response and lifecycle schemas."""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class StimulusType(str, Enum):
    product_concept = "product_concept"
    landing_page = "landing_page"
    ad = "ad"
    pricing_table = "pricing_table"


class TargetMarket(str, Enum):
    sea_genz = "sea_genz"
    us_smb = "us_smb"
    parents = "parents"
    enterprise = "enterprise"
    budget = "budget"
    early_adopters = "early_adopters"
    custom = "custom"


class StormStatus(str, Enum):
    created = "created"
    generating_personas = "generating_personas"
    running = "running"
    aggregating = "aggregating"
    complete = "complete"
    failed = "failed"


class StormCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    stimulus_type: StimulusType
    stimulus: str = Field(
        ..., min_length=20, max_length=20000,
        description="Product concept, landing copy, ad, or pricing table text",
    )
    target_market: TargetMarket
    custom_segment_description: str | None = Field(default=None, max_length=2000)
    persona_count: int = Field(default=1000, ge=50, le=1200)
    seed: int | None = Field(
        default=None,
        description="Override run seed for reproducible demos; falls back to PERSONA_SEED",
    )

    @model_validator(mode="after")
    def _custom_needs_description(self) -> "StormCreateRequest":
        if self.target_market == TargetMarket.custom:
            desc = (self.custom_segment_description or "").strip()
            if len(desc) < 12:
                raise ValueError(
                    "custom target market requires custom_segment_description (>= 12 chars)"
                )
        return self


class StormCreateResponse(BaseModel):
    storm_id: str
    status: str = "created"


class StormMeta(BaseModel):
    """Lightweight run status — what GET /api/storm/{id} returns for polling."""

    storm_id: str
    title: str
    status: StormStatus
    stimulus_type: StimulusType
    target_market: TargetMarket
    persona_count: int
    completed: int = 0
    report_ready: bool = False
    error: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

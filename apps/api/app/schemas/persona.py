"""Persona schema.

Design decision: personas are deliberately richer than demographics. The
behavioral/psychographic traits (0..1 floats) are what condition the reaction
model — two 24-year-olds in the same city can react in opposite ways because
of skepticism, brand trust, and price sensitivity. This is also what makes
persona-adherence *measurable* (see services/quality/metrics.py).
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from ..services.criteria import age_overlays

Familiarity = Literal["low", "medium", "high"]


class DecisionContext(BaseModel):
    """How this persona actually makes the buy/adopt decision.

    All fields are optional — most personas only have a subset populated
    (e.g. only teens carry `needs_parent_approval`/`school_context`). The
    generator fills these in deterministically based on life stage; this
    model just needs safe defaults so an empty `DecisionContext()` is valid.
    """

    needs_parent_approval: bool | None = None
    budget_control: str | None = None
    main_influence_sources: list[str] = Field(default_factory=list)
    risk_owner: str | None = None
    attention_span: str | None = None
    school_context: str | None = None
    decision_horizon: str | None = None


class Persona(BaseModel):
    """One structured synthetic persona (1,000 of these per storm)."""

    persona_id: str = Field(..., examples=["SEA_GENZ_0421"])
    preset: str = Field(..., description="Machine key of the target-market preset")
    segment: str = Field(..., description="Human-readable segment label")
    sub_segment: str = Field(..., description="Sub-population within the preset")

    # --- demographics ---------------------------------------------------------
    age: int = Field(..., ge=13, le=90)
    region: str
    income_band: str
    occupation: str

    # Authoritatively derived from `age` by the validator below — never trust
    # a caller-supplied value. Default "" only exists so construction without
    # it is legal; the validator always overwrites it with the correct stage.
    life_stage: str = ""

    # How this persona actually makes the buy/adopt decision (parent approval,
    # budget control, influence sources, ...). Populated by the generator;
    # defaults to an empty DecisionContext so existing callers are unaffected.
    decision_context: DecisionContext = Field(default_factory=DecisionContext)

    # --- psychographic / behavioral traits (0 = none, 1 = extreme) ------------
    price_sensitivity: float = Field(..., ge=0.0, le=1.0)
    skepticism: float = Field(..., ge=0.0, le=1.0)
    novelty_seeking: float = Field(..., ge=0.0, le=1.0)
    brand_trust: float = Field(..., ge=0.0, le=1.0)
    social_influence: float = Field(..., ge=0.0, le=1.0)
    risk_tolerance: float = Field(..., ge=0.0, le=1.0)
    privacy_sensitivity: float = Field(..., ge=0.0, le=1.0)

    # --- buying-decision variables --------------------------------------------
    category_familiarity: Familiarity
    research_style: str = Field(
        ..., description="How this persona actually researches before buying"
    )
    buying_trigger: str = Field(..., description="What tips them into purchasing")
    dealbreakers: list[str] = Field(..., min_length=1, max_length=8)

    # Rough monthly discretionary budget (USD) derived from income band; the
    # anchor the reaction engine uses to reason about willingness to pay.
    monthly_budget_usd: float = Field(..., ge=0)

    @model_validator(mode="after")
    def _derive_life_stage(self) -> "Persona":
        """life_stage is authoritative and always derived from age — any
        caller-supplied value (or the "" default) is overwritten here."""
        self.life_stage = age_overlays.life_stage_for(self.age)
        return self

    def trait_dict(self) -> dict[str, float]:
        """Traits as a dict — used by quality metrics and prompt builders."""
        return {
            "price_sensitivity": self.price_sensitivity,
            "skepticism": self.skepticism,
            "novelty_seeking": self.novelty_seeking,
            "brand_trust": self.brand_trust,
            "social_influence": self.social_influence,
            "risk_tolerance": self.risk_tolerance,
            "privacy_sensitivity": self.privacy_sensitivity,
        }

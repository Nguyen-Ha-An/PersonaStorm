"""Persona reaction schema.

IMPORTANT: `reasoning_summary` is a short, user-facing explanation of the
reaction ("high price sensitivity + no visible pricing -> hesitant"). It is
NEVER a hidden chain-of-thought, and providers must not put raw model
deliberation into it. This is an explicit product rule (engineering rule #4).
"""

from typing import Literal

from pydantic import BaseModel, Field

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


# The five purchase-decision criteria every persona grades the stimulus on
# (0 = fails this dimension for me, 1 = fully satisfies it). buy_likelihood is a
# per-segment weighted blend of these — so a single number becomes an auditable
# report card, and the report can name the product's weakest dimension.
CRITERIA: tuple[str, ...] = ("value", "price", "trust", "effort", "fit")

# Human-readable labels for narration / reasoning_summary.
CRITERIA_LABELS: dict[str, str] = {
    "value": "value",
    "price": "price fit",
    "trust": "trust",
    "effort": "ease of adoption",
    "fit": "personal fit",
}


class CriteriaScores(BaseModel):
    """One persona's report card for a stimulus. Each score is 0..1, higher is
    better *for this persona*. buy_likelihood is derived from these."""

    value: float = Field(..., ge=0.0, le=1.0, description="Does it solve a real, worthwhile problem for me")
    price: float = Field(..., ge=0.0, le=1.0, description="Is it affordable / worth the money for me")
    trust: float = Field(..., ge=0.0, le=1.0, description="Do I believe it works and trust the vendor & data handling")
    effort: float = Field(..., ge=0.0, le=1.0, description="How easy to adopt (high = low friction to try/switch)")
    fit: float = Field(..., ge=0.0, le=1.0, description="Is it meant for someone in my situation")

    def as_dict(self) -> dict[str, float]:
        return {c: getattr(self, c) for c in CRITERIA}


class PersonaReaction(BaseModel):
    """Structured reaction of one persona to one stimulus."""

    persona_id: str
    segment: str = ""
    sub_segment: str = ""

    buy_likelihood: float = Field(..., ge=0.0, le=1.0)
    status: ReactionStatus
    # Per-criterion report card behind buy_likelihood. Optional so historical
    # runs and not-yet-upgraded providers still load; the mock always fills it.
    criteria: CriteriaScores | None = None
    max_price: float = Field(..., ge=0.0, description="Max acceptable price, USD/month or one-off")
    currency: str = "USD"

    first_objection: str
    positive_trigger: str
    emotional_reaction: str
    would_tell: str = Field(..., description="What they'd say about it to a friend/colleague")
    quote: str = Field(..., description="First-person verbatim-style quote")
    reasoning_summary: str = Field(
        ...,
        description="Short public explanation only — never hidden chain-of-thought",
        max_length=400,
    )

"""Quality / trust metrics schema.

Every number surfaced in the Trust Panel is computed in
services/quality/metrics.py. For P0 the estimators are heuristic but real —
they run on actual outputs and genuinely move when outputs degrade (e.g. the
collapse test in tests/test_quality.py feeds cloned reactions and watches
collapse_risk go high).
"""

from typing import Literal

from pydantic import BaseModel, Field

Level = Literal["low", "medium", "high"]
Strength = Literal["weak", "moderate", "strong"]


class QualityMetrics(BaseModel):
    # 0..1, higher is better
    persona_adherence: float = Field(..., ge=0.0, le=1.0)
    product_grounding: float = Field(..., ge=0.0, le=1.0)

    # 0..1, lower is better
    generic_response_rate: float = Field(..., ge=0.0, le=1.0)
    duplicate_objection_rate: float = Field(..., ge=0.0, le=1.0)

    objection_entropy: Level
    objection_entropy_score: float = Field(..., ge=0.0, le=1.0)

    segment_variance: Strength
    segment_variance_score: float = Field(..., ge=0.0)

    # Variance of mean buy_likelihood across life-stage cohorts (teen_student,
    # early_career, parent_family, ...) — same weak/moderate/strong mapping as
    # segment_variance, computed over life_stage groups instead of segments.
    age_cohort_variance: Strength

    # Share of personas whose reaction passes all internal-consistency rules
    # (see services/quality/consistency_checker.py). 0..1, higher is better.
    criteria_consistency: float = Field(..., ge=0.0, le=1.0)

    collapse_risk: Level
    collapse_risk_score: float = Field(..., ge=0.0, le=1.0)

    benchmark_confidence: Level
    benchmark_category: str | None = None

    notes: list[str] = Field(default_factory=list)

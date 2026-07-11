"""Semantic grounding assessor (spec §7) — Python mirror of
apps/web/lib/server/engine/semantic/*.

The assessor LLM proposes per-segment scores for 5 grounded criteria;
sanitize_semantic is the trust boundary that clamps-or-drops every score
before it ever reaches the scorer. ONE LLM call per storm.
"""

from __future__ import annotations

from .assessor import (
    LlmSemanticAssessor,
    MockSemanticAssessor,
    SemanticAssessor,
    get_semantic_assessor,
)
from .types import GROUNDED_CRITERIA, SegmentAssessment, SemanticMatrix, SemanticSource, sanitize_semantic

__all__ = [
    "GROUNDED_CRITERIA",
    "SegmentAssessment",
    "SemanticMatrix",
    "SemanticSource",
    "sanitize_semantic",
    "SemanticAssessor",
    "MockSemanticAssessor",
    "LlmSemanticAssessor",
    "get_semantic_assessor",
]

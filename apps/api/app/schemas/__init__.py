"""Strict Pydantic schemas shared across services.

These mirror the JSON Schemas in packages/schemas/ and the TypeScript types in
apps/web/lib/types.ts. If you change a schema here, update both mirrors.
"""

from .persona import Persona
from .quality import QualityMetrics
from .reaction import PersonaReaction, ReactionStatus
from .report import (
    AdoptionSummary,
    KillQuoteContext,
    ObjectionCluster,
    PricePoint,
    Recommendation,
    SegmentReport,
    StormReport,
)
from .storm import (
    StimulusType,
    StormCreateRequest,
    StormCreateResponse,
    StormMeta,
    StormStatus,
    TargetMarket,
)

__all__ = [
    "Persona",
    "PersonaReaction",
    "ReactionStatus",
    "QualityMetrics",
    "AdoptionSummary",
    "SegmentReport",
    "ObjectionCluster",
    "PricePoint",
    "Recommendation",
    "KillQuoteContext",
    "StormReport",
    "StimulusType",
    "TargetMarket",
    "StormStatus",
    "StormCreateRequest",
    "StormCreateResponse",
    "StormMeta",
]

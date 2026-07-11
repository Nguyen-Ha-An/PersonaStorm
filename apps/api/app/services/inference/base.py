"""Inference provider abstraction.

THE swap point of the whole system (engineering rule #5). Route handlers and
the storm runner only ever see this interface; whether reactions come from the
local mock, NVIDIA-hosted Gemma, or vLLM on an AMD MI300X is decided by
INFERENCE_PROVIDER in the environment. Nothing above this layer changes.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ..stimulus_parser import StimulusFeatures

if TYPE_CHECKING:
    from ..semantic.types import SemanticMatrix

logger = logging.getLogger(__name__)


class ProviderNotConfiguredError(RuntimeError):
    """Raised when a real provider is selected but its env config is missing."""


class PersonaInferenceProvider(ABC):
    """One persona in, one structured reaction out."""

    name: str = "base"

    @abstractmethod
    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        category: str | None = None,
        semantic: "SemanticMatrix | None" = None,
    ) -> PersonaReaction:
        """Produce a structured reaction for a single persona.

        `features` is the pre-parsed stimulus (parse once per storm, not once
        per persona). Providers may ignore it and re-derive from `stimulus`.

        `category` is the run's AUTHORITATIVE product category (explicit
        override or auto-detected once for the whole run — see
        storm_runner.py). When provided, it MUST be used for scoring instead
        of re-classifying internally, so every persona's market_fit_score is
        computed under the same category as the report's weights.

        `semantic` (spec §7) is the run's cached semantic grounding matrix —
        one assessment per storm, threaded to every reaction. Optional:
        providers that don't ground scores in it (LLM-driven providers, whose
        own prompt already reasons about fit) may simply ignore the param.
        """

    async def react_batch(
        self,
        personas: list[Persona],
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        concurrency: int = 8,
        category: str | None = None,
        semantic: "SemanticMatrix | None" = None,
    ) -> list[PersonaReaction]:
        """Default batching: bounded-concurrency fan-out over react().

        Real GPU serving should override this — vLLM's continuous batching on
        MI300X makes a single large batched request far more efficient than
        N sequential HTTP calls (see docs/inference-roadmap.md).
        """
        sem = asyncio.Semaphore(concurrency)

        async def _one(p: Persona) -> PersonaReaction:
            async with sem:
                return await self.react(p, stimulus, stimulus_type, features, category, semantic)

        results = await asyncio.gather(*(_one(p) for p in personas), return_exceptions=True)
        reactions: list[PersonaReaction] = []
        for persona, res in zip(personas, results):
            if isinstance(res, Exception):
                logger.warning(
                    "dropping persona %s after inference failure: %s", persona.persona_id, res
                )
                continue
            reactions.append(res)
        return reactions

    async def health_check(self) -> bool:
        return True

"""Analyst factory — the single place that maps ANALYST_PROVIDER to code.

Mirrors inference/factory.py's shape, but with an extra graceful-fallback
rule: if a live analyst can't be configured (e.g. missing FIREWORKS_API_KEY /
NVIDIA_API_KEY), we log a clear warning and fall back to MockAnalyst rather
than raising, so the app always runs — the analyst is an enhancement, never a
hard dependency.
"""

from __future__ import annotations

import logging

from ...config import Settings
from ..inference.base import ProviderNotConfiguredError
from .base import AnalystProvider
from .fireworks_analyst import FireworksAnalyst
from .mock_analyst import MockAnalyst
from .nvidia_analyst import NvidiaAnalyst

logger = logging.getLogger(__name__)


def get_analyst(settings: Settings) -> AnalystProvider:
    if settings.analyst_provider == "fireworks":
        try:
            return FireworksAnalyst(
                settings.fireworks_api_key,
                settings.fireworks_base_url,
                settings.analyst_model or settings.fireworks_model,
                max_tokens=settings.analyst_max_tokens,
                max_retries=settings.fireworks_max_retries,
            )
        except ProviderNotConfiguredError as exc:
            logger.warning(
                "ANALYST_PROVIDER=fireworks is not configured (%s); falling back "
                "to the mock analyst so the app still runs.",
                exc,
            )
            return MockAnalyst()
    if settings.analyst_provider == "nvidia":
        try:
            return NvidiaAnalyst(
                settings.nvidia_api_key,
                settings.nvidia_base_url,
                settings.analyst_model or settings.nvidia_model,
                max_tokens=settings.analyst_max_tokens,
                enable_thinking=settings.nvidia_enable_thinking,
                reasoning_budget=settings.nvidia_reasoning_budget,
                max_retries=settings.nvidia_max_retries,
            )
        except ProviderNotConfiguredError as exc:
            logger.warning(
                "ANALYST_PROVIDER=nvidia is not configured (%s); falling back to "
                "the mock analyst so the app still runs.",
                exc,
            )
            return MockAnalyst()
    return MockAnalyst()

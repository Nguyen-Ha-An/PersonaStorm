"""FireworksAnalyst — Fireworks-hosted re-narration of the deterministic report.

Same contract as NvidiaAnalyst (which it subclasses): TEXT-only re-narration,
never a number, and ``enhance_report`` never raises — any failure returns the
original deterministic report plus a note. Only the configuration guards and
provider labels differ; the OpenAI-compatible request/parse/validate pipeline
is inherited unchanged. Reasoning-model knobs (enable_thinking et al.) are
NVIDIA NIM extensions and are not exposed here.
"""

from __future__ import annotations

from ..inference.base import ProviderNotConfiguredError
from .nvidia_analyst import NvidiaAnalyst


class FireworksAnalyst(NvidiaAnalyst):
    name = "fireworks"
    provider_label = "Fireworks"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int = 4096,
        max_retries: int = 3,
        timeout_s: float = 60.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=fireworks but FIREWORKS_BASE_URL is not set. "
                "Point it at https://api.fireworks.ai/inference/v1, or use "
                "ANALYST_PROVIDER=mock."
            )
        if "api.fireworks.ai" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=fireworks targets the hosted Fireworks endpoint "
                "but FIREWORKS_API_KEY is not set. Create a key at fireworks.ai, "
                "set FIREWORKS_API_KEY in .env, or switch to mock."
            )
        super().__init__(
            api_key,
            base_url,
            model,
            max_tokens=max_tokens,
            max_retries=max_retries,
            timeout_s=timeout_s,
        )

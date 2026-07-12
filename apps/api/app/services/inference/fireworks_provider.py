"""FireworksProvider — Fireworks AI (OpenAI-compatible) persona reactions.

The real prototype's inference API (AMD hackathon: Fireworks serves open
models on AMD hardware). Configuration:

    INFERENCE_PROVIDER=fireworks
    FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
    FIREWORKS_API_KEY=fw-...                 # from fireworks.ai
    FIREWORKS_MODEL=accounts/fireworks/models/deepseek-v4-flash

Structured output uses Fireworks' JSON-mode schema dialect —
``response_format={"type": "json_object", "schema": REACTION_JSON_SCHEMA}`` —
which constrains generation to the reaction schema the same way
``nvext.guided_json`` does on NVIDIA NIM. Response parsing reuses the shared,
defensive ``parse_llm_reaction()``: market_fit_score and status are NEVER
trusted from the model, always recomputed server-side.

Requests retry on 429/5xx/transport errors via ``post_with_retry()``. Mirror
of apps/web/lib/server/engine/providers/fireworksProvider.ts.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ..stimulus_parser import StimulusFeatures
from .base import PersonaInferenceProvider, ProviderNotConfiguredError
from .llm_common import parse_llm_reaction, post_with_retry
from .prompts import REACTION_JSON_SCHEMA, build_system_prompt, build_user_prompt

if TYPE_CHECKING:
    from ..semantic.types import SemanticMatrix

logger = logging.getLogger(__name__)


class FireworksProvider(PersonaInferenceProvider):
    name = "fireworks"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int = 2048,
        max_retries: int = 3,
        timeout_s: float = 120.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=fireworks but FIREWORKS_BASE_URL is not set. "
                "Point it at https://api.fireworks.ai/inference/v1, or use "
                "INFERENCE_PROVIDER=mock."
            )
        if "api.fireworks.ai" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=fireworks targets the hosted Fireworks "
                "endpoint but FIREWORKS_API_KEY is not set. Create a key at "
                "fireworks.ai, set FIREWORKS_API_KEY in .env, or switch to mock."
            )
        if not model:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=fireworks but no model is configured "
                "(set FIREWORKS_MODEL)."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(timeout=timeout_s)

    def _headers(self) -> dict[str, str]:
        if self.api_key and self.api_key != "not-needed":
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        category: str | None = None,
        semantic: "SemanticMatrix | None" = None,
    ) -> PersonaReaction:
        # semantic grounding (spec §7) is not consumed here — the live LLM
        # prompt already reasons about fit against the raw stimulus text.
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_prompt(persona)},
                {"role": "user", "content": build_user_prompt(stimulus, stimulus_type, features)},
            ],
            "max_tokens": self.max_tokens,
            "temperature": 0.8,  # persona texture needs some heat
            "response_format": {"type": "json_object", "schema": REACTION_JSON_SCHEMA},
        }
        resp = await post_with_retry(
            self._client,
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json_body=payload,
            max_retries=self.max_retries,
        )
        content = resp.json()["choices"][0]["message"].get("content") or ""
        return parse_llm_reaction(content, persona, features, category)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(f"{self.base_url}/models", headers=self._headers())
            return r.status_code == 200
        except httpx.HTTPError:
            return False

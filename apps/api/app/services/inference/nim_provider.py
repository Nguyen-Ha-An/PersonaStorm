"""NIMProvider — NVIDIA NIM (hosted or self-hosted) for persona reactions.

NVIDIA NIM exposes an OpenAI-compatible chat/completions API, so this provider
is structurally a sibling of FireworksProvider. Two deployment shapes:

  1. Hosted API catalog (build.nvidia.com) — zero GPU needed:
        INFERENCE_PROVIDER=nim
        NIM_BASE_URL=https://integrate.api.nvidia.com/v1
        NIM_API_KEY=nvapi-...            # from build.nvidia.com
        NIM_MODEL=z-ai/glm-5.2

  2. Self-hosted NIM container (OpenAI-compatible server on your own GPU):
        INFERENCE_PROVIDER=nim
        NIM_BASE_URL=http://<nim-host>:8000/v1
        NIM_API_KEY=not-needed           # unless the container enforces a key
        NIM_MODEL=z-ai/glm-5.2

Structured output (why nvext, not response_format):
    NVIDIA recommends constraining output with the `nvext.guided_json`
    extension instead of `response_format={"type":"json_object"}`, because
    json_object mode permits ANY valid JSON (including empty objects), whereas
    guided_json hard-constrains generation to REACTION_JSON_SCHEMA. This mirrors
    the vLLM provider's guided decoding and drives schema-validity toward 100%.
    Toggle with NIM_USE_GUIDED_JSON=false to fall back to json_object mode if a
    given model/endpoint doesn't support nvext.

Model note: z-ai/glm-5.2 is a reasoning/agentic model. Reasoning tokens count
against max_tokens, so NIM_MAX_TOKENS defaults higher than the other providers
to avoid truncating the final JSON. Response parsing reuses the shared,
defensive parse_llm_reaction().
"""

from __future__ import annotations

import logging

import httpx

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ..stimulus_parser import StimulusFeatures
from .base import PersonaInferenceProvider, ProviderNotConfiguredError
from .fireworks_provider import parse_llm_reaction
from .prompts import REACTION_JSON_SCHEMA, build_system_prompt, build_user_prompt

logger = logging.getLogger(__name__)


class NIMProvider(PersonaInferenceProvider):
    name = "nim"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        use_guided_json: bool = True,
        max_tokens: int = 2048,
        timeout_s: float = 120.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=nim but NIM_BASE_URL is not set. Point it at "
                "https://integrate.api.nvidia.com/v1 (hosted) or your NIM "
                "container's /v1 endpoint, or use INFERENCE_PROVIDER=mock."
            )
        # Hosted build.nvidia.com requires an nvapi- key; self-hosted containers
        # usually don't. Only enforce a key for the hosted endpoint.
        if "integrate.api.nvidia.com" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=nim targets the hosted NVIDIA endpoint but "
                "NIM_API_KEY is not set. Generate an 'nvapi-' key at "
                "build.nvidia.com, set NIM_API_KEY in .env, or switch to mock."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.use_guided_json = use_guided_json
        self.max_tokens = max_tokens
        self._client = httpx.AsyncClient(timeout=timeout_s)

    def _headers(self) -> dict[str, str]:
        # Self-hosted NIM often needs no auth; only send the header if we have a key.
        if self.api_key and self.api_key != "not-needed":
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
    ) -> PersonaReaction:
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_prompt(persona)},
                {"role": "user", "content": build_user_prompt(stimulus, stimulus_type, features)},
            ],
            "max_tokens": self.max_tokens,
            "temperature": 0.8,  # persona texture needs some heat
        }
        if self.use_guided_json:
            # NIM's OpenAI-schema extension: hard-constrain output to the schema.
            payload["nvext"] = {"guided_json": REACTION_JSON_SCHEMA}
        else:
            payload["response_format"] = {"type": "json_object"}

        # TODO(live-key): retry w/ exponential backoff on 429/5xx — the hosted
        #   free endpoint is rate-limited, so large storms will hit 429s.
        # TODO(live-key): track token usage per storm for cost reporting.
        resp = await self._client.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=payload,
        )
        resp.raise_for_status()
        message = resp.json()["choices"][0]["message"]
        # Reasoning models split chain-of-thought into reasoning_content and the
        # answer into content; we only ever parse content (the constrained JSON).
        content = message.get("content") or ""
        return parse_llm_reaction(content, persona)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(
                f"{self.base_url}/models", headers=self._headers()
            )
            return r.status_code == 200
        except httpx.HTTPError:
            return False

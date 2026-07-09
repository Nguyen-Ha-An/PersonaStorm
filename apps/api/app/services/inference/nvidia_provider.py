"""NvidiaProvider — NVIDIA NIM (hosted or self-hosted) for persona reactions.

NVIDIA NIM exposes an OpenAI-compatible chat/completions API. Two deployment
shapes:

  1. Hosted API catalog (build.nvidia.com) — zero GPU needed:
        INFERENCE_PROVIDER=nvidia
        NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
        NVIDIA_API_KEY=nvapi-...            # from build.nvidia.com
        NVIDIA_MODEL=z-ai/glm-5.2

  2. Self-hosted NIM container (OpenAI-compatible server on your own GPU):
        INFERENCE_PROVIDER=nvidia
        NVIDIA_BASE_URL=http://<nim-host>:8000/v1
        NVIDIA_API_KEY=not-needed           # unless the container enforces a key
        NVIDIA_MODEL=z-ai/glm-5.2

Structured output (why nvext, not response_format):
    NVIDIA recommends constraining output with the `nvext.guided_json`
    extension instead of `response_format={"type":"json_object"}`, because
    json_object mode permits ANY valid JSON (including empty objects), whereas
    guided_json hard-constrains generation to REACTION_JSON_SCHEMA. This mirrors
    the vLLM provider's guided decoding and drives schema-validity toward 100%.
    Toggle with NVIDIA_USE_GUIDED_JSON=false to fall back to json_object mode if
    a given model/endpoint doesn't support nvext.

Model note: z-ai/glm-5.2 is a reasoning/agentic model. Reasoning tokens count
against max_tokens, so NVIDIA_MAX_TOKENS defaults higher than the other
providers to avoid truncating the final JSON. Response parsing reuses the
shared, defensive parse_llm_reaction().
"""

from __future__ import annotations

import logging

import httpx

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction
from ..stimulus_parser import StimulusFeatures
from .base import PersonaInferenceProvider, ProviderNotConfiguredError
from .llm_common import apply_reasoning_params, parse_llm_reaction, post_with_retry
from .prompts import REACTION_JSON_SCHEMA, build_system_prompt, build_user_prompt

logger = logging.getLogger(__name__)


class NvidiaProvider(PersonaInferenceProvider):
    name = "nvidia"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        structured_output: str = "guided_json",
        max_tokens: int = 2048,
        enable_thinking: bool = False,
        reasoning_budget: int | None = None,
        max_retries: int = 3,
        timeout_s: float = 120.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=nvidia but NVIDIA_BASE_URL is not set. Point it "
                "at https://integrate.api.nvidia.com/v1 (hosted) or your NIM "
                "container's /v1 endpoint, or use INFERENCE_PROVIDER=mock."
            )
        # Hosted build.nvidia.com requires an nvapi- key; self-hosted containers
        # usually don't. Only enforce a key for the hosted endpoint.
        if "integrate.api.nvidia.com" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=nvidia targets the hosted NVIDIA endpoint but "
                "NVIDIA_API_KEY is not set. Generate an 'nvapi-' key at "
                "build.nvidia.com, set NVIDIA_API_KEY in .env, or switch to mock."
            )
        if enable_thinking and reasoning_budget is not None and max_tokens <= reasoning_budget:
            raise ProviderNotConfiguredError(
                f"NVIDIA_MAX_TOKENS ({max_tokens}) must exceed NVIDIA_REASONING_BUDGET "
                f"({reasoning_budget}) when NVIDIA_ENABLE_THINKING=true, or the JSON "
                "answer gets starved by reasoning tokens."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.structured_output = structured_output
        self.max_tokens = max_tokens
        self.enable_thinking = enable_thinking
        self.reasoning_budget = reasoning_budget
        self.max_retries = max_retries
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
        category: str | None = None,
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
        apply_reasoning_params(
            payload, enable_thinking=self.enable_thinking, reasoning_budget=self.reasoning_budget
        )
        if self.structured_output == "guided_json":
            # NIM's OpenAI-schema extension: hard-constrain output to the schema.
            payload["nvext"] = {"guided_json": REACTION_JSON_SCHEMA}
        elif self.structured_output == "json_object":
            payload["response_format"] = {"type": "json_object"}
        # "none": no structured-output field; rely on parse_llm_reaction.

        resp = await post_with_retry(
            self._client,
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json_body=payload,
            max_retries=self.max_retries,
        )
        message = resp.json()["choices"][0]["message"]
        # Reasoning models split chain-of-thought into reasoning_content and the
        # answer into content; parse only content. Empty content (budget spent on
        # thinking) raises in parse_llm_reaction -> counts as a failed persona.
        content = message.get("content") or ""
        return parse_llm_reaction(content, persona, features, category)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(
                f"{self.base_url}/models", headers=self._headers()
            )
            return r.status_code == 200
        except httpx.HTTPError:
            return False

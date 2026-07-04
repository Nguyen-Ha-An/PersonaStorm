"""VLLMProvider — persona swarm on a self-hosted OpenAI-compatible vLLM server.

STATUS: structured placeholder targeting AMD MI300X + ROCm.

Target deployment (see docs/inference-roadmap.md for the full plan):

    # On the MI300X box (ROCm >= 6.x):
    docker run -it --device=/dev/kfd --device=/dev/dri --group-add video \
        --ipc=host --shm-size 16G rocm/vllm:latest \
        vllm serve google/gemma-3-27b-it \
        --port 8001 --max-model-len 4096 --gpu-memory-utilization 0.92

    # PersonaStorm .env:
    INFERENCE_PROVIDER=vllm
    VLLM_BASE_URL=http://<mi300x-host>:8001/v1
    VLLM_MODEL=google/gemma-3-27b-it

Why this design wins on MI300X: 192 GB HBM3 per GPU means the whole model +
huge KV cache fits on ONE device, and vLLM's continuous batching turns 1,000
short persona prompts into a throughput problem, not a latency problem.
react_batch() below fires bounded-concurrency requests and lets vLLM's
scheduler pack them — no client-side batching gymnastics needed.

LoRA path: vLLM serves LoRA adapters natively (--enable-lora --lora-modules
persona-v1=/adapters/persona-v1). Swapping the calibrated persona adapter is
then just VLLM_MODEL=persona-v1. See docs/training-roadmap.md.
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


class VLLMProvider(PersonaInferenceProvider):
    name = "vllm"

    def __init__(self, base_url: str, model: str, api_key: str = "not-needed",
                 timeout_s: float = 60.0):
        if not base_url:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=vllm but VLLM_BASE_URL is not set. "
                "Point it at an OpenAI-compatible vLLM server or use INFERENCE_PROVIDER=mock."
            )
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        category: str | None = None,
    ) -> PersonaReaction:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_prompt(persona)},
                {"role": "user", "content": build_user_prompt(stimulus, stimulus_type, features)},
            ],
            "max_tokens": 500,
            "temperature": 0.8,
            # vLLM guided decoding: hard-guarantees schema-valid JSON, which
            # drives the schema-validity metric to ~100% (evaluation-framework.md).
            "extra_body": {"guided_json": REACTION_JSON_SCHEMA},
        }
        # TODO(mi300x): benchmark guided_json throughput vs plain json_object mode.
        # TODO(mi300x): pass priority hints so interactive storms preempt batch evals.
        resp = await self._client.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return parse_llm_reaction(content, persona, features, category)

    async def react_batch(
        self,
        personas: list[Persona],
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
        concurrency: int = 64,
        category: str | None = None,
    ) -> list[PersonaReaction]:
        # Higher default concurrency than base: vLLM's continuous batching is
        # most efficient when its queue is kept full.
        return await super().react_batch(personas, stimulus, stimulus_type,
                                         features, concurrency=concurrency,
                                         category=category)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(f"{self.base_url}/models")
            return r.status_code == 200
        except httpx.HTTPError:
            return False

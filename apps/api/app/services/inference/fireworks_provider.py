"""FireworksProvider — Fireworks-hosted Gemma for persona reactions.

STATUS: structured placeholder (P0 ships on MockPersonaProvider). The request/
response plumbing is real; what remains is live-key testing and calibration.

Request shape (OpenAI-compatible chat completions):
    POST {FIREWORKS_BASE_URL}/chat/completions
    Authorization: Bearer {FIREWORKS_API_KEY}
    {
      "model": "accounts/fireworks/models/gemma-3-27b-it",
      "messages": [{"role": "system", ...}, {"role": "user", ...}],
      "max_tokens": 500,
      "temperature": 0.8,            # persona texture needs some heat
      "response_format": {"type": "json_object"}
    }

Response shape: choices[0].message.content -> one JSON object matching
prompts.REACTION_JSON_SCHEMA.

Roadmap (docs/inference-roadmap.md): Fireworks Gemma 27B is primarily the
ANALYST/AGGREGATOR agent (executive summary, objection cluster labeling,
recommendations), while the persona swarm runs on the smaller calibrated
Gemma via vLLM/MI300X. This provider also lets the swarm itself run on
Fireworks for environments with zero GPU access.
"""

from __future__ import annotations

import json
import logging

import httpx

from ...schemas.persona import Persona
from ...schemas.reaction import PersonaReaction, status_for
from ..stimulus_parser import StimulusFeatures
from .base import PersonaInferenceProvider, ProviderNotConfiguredError
from .prompts import build_system_prompt, build_user_prompt

logger = logging.getLogger(__name__)


class FireworksProvider(PersonaInferenceProvider):
    name = "fireworks"

    def __init__(self, api_key: str | None, base_url: str, model: str,
                 timeout_s: float = 45.0):
        if not api_key:
            raise ProviderNotConfiguredError(
                "INFERENCE_PROVIDER=fireworks but FIREWORKS_API_KEY is not set. "
                "Set it in .env or switch back to INFERENCE_PROVIDER=mock."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._client = httpx.AsyncClient(timeout=timeout_s)

    async def react(
        self,
        persona: Persona,
        stimulus: str,
        stimulus_type: str,
        features: StimulusFeatures | None = None,
    ) -> PersonaReaction:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_prompt(persona)},
                {"role": "user", "content": build_user_prompt(stimulus, stimulus_type, features)},
            ],
            "max_tokens": 500,
            "temperature": 0.8,
            "response_format": {"type": "json_object"},
        }
        # TODO(live-key): add retry w/ exponential backoff on 429/5xx.
        # TODO(live-key): track token usage per storm for cost reporting.
        resp = await self._client.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return parse_llm_reaction(content, persona)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            return r.status_code == 200
        except httpx.HTTPError:
            return False


def parse_llm_reaction(content: str, persona: Persona) -> PersonaReaction:
    """Parse + validate an LLM JSON reply into a PersonaReaction.

    Shared by Fireworks and vLLM providers. Defensive on purpose: the Response
    Quality Checker treats schema-invalid outputs as provider errors, so we
    surface them loudly instead of silently fabricating data.
    """
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"provider returned non-JSON content for {persona.persona_id}")
    data = json.loads(text[start:end + 1])

    likelihood = max(0.0, min(1.0, float(data.get("buy_likelihood", 0.5))))
    return PersonaReaction(
        persona_id=persona.persona_id,
        segment=persona.segment,
        sub_segment=persona.sub_segment,
        buy_likelihood=likelihood,
        status=status_for(likelihood),  # recompute server-side; never trust model status
        max_price=max(0.0, float(data.get("max_price", 0.0))),
        first_objection=str(data.get("first_objection", ""))[:240],
        positive_trigger=str(data.get("positive_trigger", ""))[:240],
        emotional_reaction=str(data.get("emotional_reaction", ""))[:120],
        would_tell=str(data.get("would_tell", ""))[:240],
        quote=str(data.get("quote", ""))[:400],
        reasoning_summary=str(data.get("reasoning_summary", ""))[:300],
    )

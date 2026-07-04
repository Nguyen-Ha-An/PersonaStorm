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
from ...schemas.reaction import (
    CoreCriteriaScores,
    Decision,
    PersonaReaction,
    Qualitative,
    ResearchRecommendation,
    status_for,
)
from ..criteria.classifier import classify_category, is_high_risk
from ..criteria.registry import CORE_IDS
from ..criteria.scoring import compute_market_fit
from ..stimulus_parser import StimulusFeatures
from .base import PersonaInferenceProvider, ProviderNotConfiguredError
from .prompts import build_system_prompt, build_user_prompt

logger = logging.getLogger(__name__)

_PRICING_MODELS = {
    "one_time", "subscription", "usage_based", "seat_based",
    "enterprise", "freemium", "unknown",
}
_BEST_NEXT_TESTS = {
    "survey", "interview", "landing_page_ab_test", "pricing_test",
    "ad_test", "usability_test",
}


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


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
        return parse_llm_reaction(content, persona, features, category)

    async def health_check(self) -> bool:
        try:
            r = await self._client.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            return r.status_code == 200
        except httpx.HTTPError:
            return False


def parse_llm_reaction(
    content: str,
    persona: Persona,
    features: StimulusFeatures | None = None,
    category: str | None = None,
) -> PersonaReaction:
    """Parse + validate an LLM JSON reply into a PersonaReaction.

    Shared by Fireworks, vLLM, and NIM providers. Defensive on purpose: the
    Response Quality Checker treats schema-invalid outputs as provider errors,
    so we surface them loudly instead of silently fabricating data.

    market_fit_score and status are NEVER trusted from the model — they are
    always recomputed server-side via `compute_market_fit`/`status_for`.

    `category` is the run's authoritative product category (override or the
    single auto-detected value for the whole run); when provided it wins over
    re-classifying `features` here, keeping scoring consistent with the
    report's own category weights.
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

    if "criteria_scores" not in data or not isinstance(data["criteria_scores"], dict):
        raise ValueError(
            f"provider response missing criteria_scores for {persona.persona_id}"
        )
    raw_core = data["criteria_scores"]
    core: dict[str, float] = {
        cid: _clamp(float(raw_core.get(cid, 0.5))) for cid in CORE_IDS
    }

    raw_age = data.get("age_specific_scores", {}) or {}
    age_specific_scores: dict[str, float] = {
        str(k): _clamp(float(v)) for k, v in raw_age.items()
    }

    buy_likelihood = _clamp(float(data.get("buy_likelihood", 0.5)))
    max_price = max(0.0, float(data.get("max_price", 0.0)))

    cat = category or (classify_category(features)[0] if features else "generic")
    high_risk = is_high_risk(features) if features else False
    is_teen_paid_edu = persona.life_stage == "teen_student" and cat == "education_product"

    breakdown = compute_market_fit(
        core,
        age_specific_scores,
        cat,
        persona.life_stage,
        is_high_risk=high_risk,
        is_teen_paid_edu=is_teen_paid_edu,
    )

    status = status_for(buy_likelihood)  # recompute server-side; never trust model status

    pricing_model = data.get("recommended_pricing_model", "unknown")
    if pricing_model not in _PRICING_MODELS:
        pricing_model = "unknown"

    qual = data.get("qualitative", {}) or {}
    qualitative = Qualitative(
        first_objection=str(qual.get("first_objection", ""))[:280],
        top_positive_trigger=str(qual.get("top_positive_trigger", ""))[:280],
        top_negative_trigger=str(qual.get("top_negative_trigger", ""))[:280],
        dealbreaker=str(qual.get("dealbreaker", ""))[:200],
        proof_needed=str(qual.get("proof_needed", ""))[:200],
        emotional_reaction=str(qual.get("emotional_reaction", ""))[:160],
        would_tell=str(qual.get("would_tell", ""))[:280],
        quote=str(qual.get("quote", ""))[:400],
    )

    rr = data.get("research_recommendation", {}) or {}
    best_next_test = rr.get("best_next_test", "survey")
    if best_next_test not in _BEST_NEXT_TESTS:
        best_next_test = "survey"
    research_recommendation = ResearchRecommendation(
        should_validate_with_humans=bool(rr.get("should_validate_with_humans", True)),
        validation_question=str(rr.get("validation_question", ""))[:300],
        best_next_test=best_next_test,
    )

    decision = Decision(
        overall_buy_likelihood=buy_likelihood,
        market_fit_score=breakdown.market_fit_score,  # NEVER from the model
        status=status,
        max_price=max_price,
        recommended_pricing_model=pricing_model,
    )

    return PersonaReaction(
        persona_id=persona.persona_id,
        segment=persona.segment,
        sub_segment=persona.sub_segment,
        life_stage=persona.life_stage,
        decision=decision,
        criteria_scores=CoreCriteriaScores(**core),
        age_specific_scores=age_specific_scores,
        qualitative=qualitative,
        research_recommendation=research_recommendation,
        reasoning_summary=str(data.get("reasoning_summary", ""))[:400],
        market_fit_breakdown=breakdown,
    )

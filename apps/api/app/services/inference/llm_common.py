"""Shared LLM-JSON parsing for real inference providers.

`parse_llm_reaction` is the single defensive parser used by every real
provider (vLLM, NVIDIA) to turn a raw LLM chat-completion `content` string
into a validated `PersonaReaction`. Kept provider-agnostic so it has no
dependency on any specific provider's HTTP plumbing.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random

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


def parse_llm_reaction(
    content: str,
    persona: Persona,
    features: StimulusFeatures | None = None,
    category: str | None = None,
) -> PersonaReaction:
    """Parse + validate an LLM JSON reply into a PersonaReaction.

    Shared by vLLM and NVIDIA providers. Defensive on purpose: the
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


def apply_reasoning_params(
    payload: dict, *, enable_thinking: bool, reasoning_budget: int | None
) -> None:
    """Inject reasoning-model request params in place (nemotron-style).

    Maps the OpenAI-SDK `extra_body={"chat_template_kwargs":..., "reasoning_budget":...}`
    from the verified snippet to top-level JSON keys for a raw httpx POST.
    No-op when reasoning is disabled, so non-reasoning models are unaffected.
    """
    if not enable_thinking:
        return
    payload["chat_template_kwargs"] = {"enable_thinking": True}
    if reasoning_budget is not None:
        payload["reasoning_budget"] = reasoning_budget


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None  # HTTP-date form not supported; fall back to backoff


async def _sleep_before_retry(attempt: int, retry_after: float | None, base: float) -> None:
    delay = retry_after if retry_after is not None else base * (2 ** attempt) + random.uniform(0, base)
    if delay > 0:
        await asyncio.sleep(delay)


async def post_with_retry(
    client,
    url: str,
    *,
    headers: dict,
    json_body: dict,
    max_retries: int = 3,
    backoff_base: float = 0.5,
) -> httpx.Response:
    """POST with bounded exponential backoff on 429/5xx/transport errors.

    Honors a numeric Retry-After header. Calls raise_for_status() and returns
    the response on success; re-raises the final error once retries are spent.
    Shared by NvidiaProvider (swarm) and NvidiaAnalyst.
    """
    attempt = 0
    while True:
        try:
            resp = await client.post(url, headers=headers, json=json_body)
        except httpx.TransportError:
            if attempt >= max_retries:
                raise
            logger.warning("transport error POSTing (attempt %d), retrying", attempt + 1)
            await _sleep_before_retry(attempt, None, backoff_base)
            attempt += 1
            continue
        if resp.status_code == 429 or resp.status_code >= 500:
            if attempt >= max_retries:
                resp.raise_for_status()  # spent — raise the final error
            logger.warning("HTTP %d (attempt %d), retrying", resp.status_code, attempt + 1)
            await _sleep_before_retry(attempt, _parse_retry_after(resp.headers.get("retry-after")), backoff_base)
            attempt += 1
            continue
        resp.raise_for_status()
        return resp

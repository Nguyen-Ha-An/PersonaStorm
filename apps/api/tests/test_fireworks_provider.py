"""Fireworks provider tests — the real prototype's inference API.

Covers:
  - factory routing: INFERENCE_PROVIDER=fireworks -> FireworksProvider, with
    the same configuration guards as the NVIDIA path (hosted endpoint needs a
    key; misconfiguration raises ProviderNotConfiguredError).
  - request shape: Fireworks' JSON-mode schema dialect
    (response_format={"type": "json_object", "schema": REACTION_JSON_SCHEMA}).
  - parsing: reuses the shared defensive parse_llm_reaction — market_fit_score
    and status are recomputed server-side, never trusted from the model.
  - analyst + semantic factories: ANALYST_PROVIDER / SEMANTIC_PROVIDER =
    fireworks route to Fireworks-backed implementations with graceful
    mock fallbacks when the key is missing.
  - config: the semantic model fallback ends at fireworks_model when the
    assessor runs on Fireworks (never sends an NVIDIA model id to Fireworks).
"""

import asyncio
import json as _json

import httpx
import pytest

from app.config import Settings
from app.services.analyst import FireworksAnalyst, MockAnalyst, get_analyst
from app.services.inference import FireworksProvider, ProviderNotConfiguredError
from app.services.inference.factory import get_provider
from app.services.inference.prompts import REACTION_JSON_SCHEMA
from app.services.persona import PersonaGenerator
from app.services.semantic import get_semantic_assessor
from app.services.stimulus_parser import parse_stimulus

_STIM = "AI copilot for sales teams. $40/seat/mo. 14-day trial, cancel anytime."
_HOSTED = "https://api.fireworks.ai/inference/v1"
_MODEL = "accounts/fireworks/models/deepseek-v4-flash"


def _reaction_content():
    from app.services.criteria.registry import CORE_IDS

    return _json.dumps({
        "criteria_scores": {c: 0.6 for c in CORE_IDS},
        "age_specific_scores": {},
        "qualitative": {
            "first_objection": "no proof", "top_positive_trigger": "clear value",
            "top_negative_trigger": "price", "dealbreaker": "none", "proof_needed": "case study",
            "emotional_reaction": "curious", "would_tell": "maybe", "quote": "Interesting.",
        },
        "buy_likelihood": 0.7, "max_price": 45, "recommended_pricing_model": "seat_based",
        "research_recommendation": {
            "should_validate_with_humans": True,
            "validation_question": "Would you pay $40/seat?", "best_next_test": "pricing_test",
        },
        "reasoning_summary": "Decent fit; price is the question.",
    })


def _persona_and_features():
    personas, _, _ = PersonaGenerator(seed=7).generate("us_smb", 50)
    features = parse_stimulus(_STIM, "Copilot", "product_concept")
    return personas[0], features


def _capturing_provider(message_content=None):
    provider = FireworksProvider(api_key="fw-test", base_url=_HOSTED, model=_MODEL)
    captured = {}

    async def fake_post(url, headers=None, json=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        content = message_content if message_content is not None else _reaction_content()
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": content}}]},
            request=httpx.Request("POST", url),
        )

    provider._client.post = fake_post
    return provider, captured


# --------------------------------------------------------------------------- factory


def test_get_provider_fireworks_returns_fireworks_provider_with_key():
    settings = Settings(inference_provider="fireworks", fireworks_api_key="fw-test")
    provider = get_provider(settings)
    assert isinstance(provider, FireworksProvider)
    assert provider.name == "fireworks"


def test_get_provider_fireworks_without_key_on_hosted_url_raises():
    settings = Settings(
        inference_provider="fireworks",
        fireworks_api_key=None,
        fireworks_base_url=_HOSTED,
    )
    with pytest.raises(ProviderNotConfiguredError):
        get_provider(settings)


def test_fireworks_provider_missing_model_raises():
    with pytest.raises(ProviderNotConfiguredError):
        FireworksProvider(api_key="fw-test", base_url=_HOSTED, model="")


def test_fireworks_provider_self_hosted_needs_no_key():
    provider = FireworksProvider(api_key=None, base_url="http://localhost:8001/v1", model=_MODEL)
    assert provider.name == "fireworks"


# --------------------------------------------------------------------------- request/parse


def test_fireworks_provider_sends_json_schema_response_format():
    provider, captured = _capturing_provider()
    persona, features = _persona_and_features()
    asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert captured["json"]["response_format"] == {
        "type": "json_object",
        "schema": REACTION_JSON_SCHEMA,
    }
    assert captured["json"]["temperature"] == 0.8
    assert captured["json"]["model"] == _MODEL
    assert captured["headers"]["Authorization"] == "Bearer fw-test"


def test_fireworks_provider_parses_reaction_and_recomputes_numbers():
    provider, _ = _capturing_provider()
    persona, features = _persona_and_features()
    reaction = asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert reaction.persona_id == persona.persona_id
    assert 0.0 <= reaction.market_fit_score <= 1.0  # recomputed server-side
    assert reaction.buy_likelihood == 0.7


def test_fireworks_provider_empty_content_raises():
    provider, _ = _capturing_provider(message_content="")
    persona, features = _persona_and_features()
    with pytest.raises(Exception):
        asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))


# --------------------------------------------------------------------------- analyst factory


def test_get_analyst_fireworks_with_key_returns_fireworks_analyst():
    settings = Settings(analyst_provider="fireworks", fireworks_api_key="fw-test")
    analyst = get_analyst(settings)
    assert isinstance(analyst, FireworksAnalyst)
    assert analyst.name == "fireworks"
    assert analyst.model == settings.fireworks_model  # falls back to FIREWORKS_MODEL


def test_get_analyst_fireworks_without_key_falls_back_to_mock():
    settings = Settings(
        analyst_provider="fireworks",
        fireworks_api_key=None,
        fireworks_base_url=_HOSTED,
    )
    assert isinstance(get_analyst(settings), MockAnalyst)


# --------------------------------------------------------------------------- semantic factory


def test_get_semantic_assessor_fireworks_with_key_returns_llm():
    settings = Settings(semantic_provider="fireworks", fireworks_api_key="fw-test")
    assessor = get_semantic_assessor(settings)
    assert assessor.name == "llm"
    assert assessor.source == "fireworks"


def test_get_semantic_assessor_fireworks_without_key_falls_back_to_mock():
    settings = Settings(
        semantic_provider="fireworks",
        fireworks_api_key=None,
        fireworks_base_url=_HOSTED,
    )
    assert get_semantic_assessor(settings).name == "mock"


def test_semantic_defaults_to_fireworks_when_analyst_is_fireworks():
    settings = Settings(semantic_provider=None, analyst_provider="fireworks", fireworks_api_key="fw-test")
    assert settings.effective_semantic_provider == "fireworks"
    assert get_semantic_assessor(settings).name == "llm"


def test_effective_semantic_model_ends_at_fireworks_model():
    settings = Settings(
        semantic_provider="fireworks",
        semantic_model=None,
        analyst_model=None,
        fireworks_model=_MODEL,
        nvidia_model="z-ai/glm-5.2",
    )
    assert settings.effective_semantic_model == _MODEL

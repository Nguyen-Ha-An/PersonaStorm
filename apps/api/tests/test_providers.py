"""Provider factory tests — INFERENCE_PROVIDER routing (mock/nvidia/vllm).

Fireworks and NIM providers were removed in favor of a single NvidiaProvider
(name="nvidia"). These tests exercise `factory.get_provider(settings)` exactly
as `storm_runner.py` calls it: with a `Settings`-like object, not kwargs.
"""

import pytest

from app.config import Settings
from app.services.inference import MockPersonaProvider, ProviderNotConfiguredError
from app.services.inference.factory import get_provider


def _settings(**overrides) -> Settings:
    return Settings(**overrides)


def test_get_provider_mock_default():
    settings = _settings()
    provider = get_provider(settings)
    assert isinstance(provider, MockPersonaProvider)
    assert provider.name == "mock"


def test_get_provider_nvidia_returns_nvidia_provider_with_key():
    settings = _settings(
        inference_provider="nvidia",
        nvidia_api_key="nvapi-test",
    )
    provider = get_provider(settings)
    assert provider.name == "nvidia"


def test_get_provider_nvidia_without_key_on_hosted_url_raises():
    settings = _settings(
        inference_provider="nvidia",
        nvidia_api_key=None,
        nvidia_base_url="https://integrate.api.nvidia.com/v1",
    )
    with pytest.raises(ProviderNotConfiguredError):
        get_provider(settings)


import asyncio
import json as _json

import httpx

from app.services.inference.nvidia_provider import NvidiaProvider
from app.services.persona import PersonaGenerator
from app.services.stimulus_parser import parse_stimulus

_STIM = "AI copilot for sales teams. $40/seat/mo. 14-day trial, cancel anytime. Used by 300 teams."

_REACTION_BODY = {
    "criteria_scores": {},  # filled below with all CORE_IDS
    "age_specific_scores": {},
    "qualitative": {
        "first_objection": "no proof", "top_positive_trigger": "clear value",
        "top_negative_trigger": "price", "dealbreaker": "none", "proof_needed": "case study",
        "emotional_reaction": "curious", "would_tell": "maybe", "quote": "Interesting for $40/seat.",
    },
    "buy_likelihood": 0.7, "max_price": 45, "recommended_pricing_model": "seat_based",
    "research_recommendation": {
        "should_validate_with_humans": True,
        "validation_question": "Would you pay $40/seat?", "best_next_test": "pricing_test",
    },
    "reasoning_summary": "Decent fit; price is the question.",
}


def _reaction_content():
    from app.services.criteria.registry import CORE_IDS
    body = dict(_REACTION_BODY)
    body["criteria_scores"] = {c: 0.6 for c in CORE_IDS}
    return _json.dumps(body)


def _persona_and_features():
    personas, _ = PersonaGenerator(seed=7).generate("us_smb", 50)
    features = parse_stimulus(_STIM, "Copilot", "product_concept")
    return personas[0], features


def _capturing_provider(structured_output, *, enable_thinking=False, reasoning_budget=None,
                        message_content=None):
    provider = NvidiaProvider(
        api_key="nvapi-test", base_url="https://integrate.api.nvidia.com/v1", model="nvidia/nemotron-3-ultra-550b-a55b",
        structured_output=structured_output, max_tokens=8192,
        enable_thinking=enable_thinking, reasoning_budget=reasoning_budget,
    )
    captured = {}

    async def fake_post(url, headers=None, json=None):
        captured["json"] = json
        content = message_content if message_content is not None else _reaction_content()
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": content, "reasoning_content": "…thoughts…"}}]},
            request=httpx.Request("POST", url),
        )

    provider._client.post = fake_post
    return provider, captured


def test_nvidia_provider_json_object_mode_sets_response_format():
    provider, captured = _capturing_provider("json_object")
    persona, features = _persona_and_features()
    asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert "nvext" not in captured["json"]


def test_nvidia_provider_guided_json_mode_sets_nvext():
    provider, captured = _capturing_provider("guided_json")
    persona, features = _persona_and_features()
    asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert "guided_json" in captured["json"]["nvext"]
    assert "response_format" not in captured["json"]


def test_nvidia_provider_none_mode_sends_neither():
    provider, captured = _capturing_provider("none")
    persona, features = _persona_and_features()
    asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert "nvext" not in captured["json"]
    assert "response_format" not in captured["json"]


def test_nvidia_provider_sends_reasoning_params_when_enabled():
    provider, captured = _capturing_provider("json_object", enable_thinking=True, reasoning_budget=4096)
    persona, features = _persona_and_features()
    asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert captured["json"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert captured["json"]["reasoning_budget"] == 4096


def test_nvidia_provider_ignores_reasoning_content_and_parses_content():
    provider, _ = _capturing_provider("json_object", enable_thinking=True, reasoning_budget=4096)
    persona, features = _persona_and_features()
    reaction = asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))
    assert reaction.persona_id == persona.persona_id
    assert set(reaction.criteria_scores.as_dict().keys())  # parsed successfully


def test_nvidia_provider_empty_content_raises():
    import pytest
    provider, _ = _capturing_provider("json_object", message_content="")
    persona, features = _persona_and_features()
    with pytest.raises(Exception):
        asyncio.run(provider.react(persona, _STIM, "product_concept", features, "generic"))


def test_nvidia_provider_reasoning_budget_exceeds_max_tokens_raises():
    import pytest
    from app.services.inference.base import ProviderNotConfiguredError

    with pytest.raises(ProviderNotConfiguredError):
        NvidiaProvider(
            api_key="nvapi-test", base_url="https://integrate.api.nvidia.com/v1", model="m",
            enable_thinking=True, reasoning_budget=4096, max_tokens=2048,
        )

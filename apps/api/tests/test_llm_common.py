"""Shared LLM plumbing: reasoning-param injection and retrying POST."""

from app.services.inference.llm_common import apply_reasoning_params


def test_apply_reasoning_params_off_is_noop():
    payload = {"model": "m"}
    apply_reasoning_params(payload, enable_thinking=False, reasoning_budget=4096)
    assert payload == {"model": "m"}


def test_apply_reasoning_params_on_sets_thinking_and_budget():
    payload = {"model": "m"}
    apply_reasoning_params(payload, enable_thinking=True, reasoning_budget=4096)
    assert payload["chat_template_kwargs"] == {"enable_thinking": True}
    assert payload["reasoning_budget"] == 4096


def test_apply_reasoning_params_on_without_budget_omits_budget():
    payload = {"model": "m"}
    apply_reasoning_params(payload, enable_thinking=True, reasoning_budget=None)
    assert payload["chat_template_kwargs"] == {"enable_thinking": True}
    assert "reasoning_budget" not in payload

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


import types

import httpx
import pytest

from app.services.inference.llm_common import post_with_retry

URL = "https://integrate.api.nvidia.com/v1/chat/completions"


def _resp(status, body=None, headers=None):
    return httpx.Response(
        status,
        headers=headers or {},
        json=body if body is not None else {"ok": True},
        request=httpx.Request("POST", URL),
    )


def test_post_with_retry_retries_on_429_then_succeeds():
    calls = {"n": 0}

    async def fake_post(url, headers=None, json=None):
        calls["n"] += 1
        return _resp(429, headers={"retry-after": "0"}) if calls["n"] == 1 else _resp(200)

    client = types.SimpleNamespace(post=fake_post)
    resp = __import__("asyncio").run(
        post_with_retry(client, URL, headers={}, json_body={}, max_retries=3, backoff_base=0)
    )
    assert calls["n"] == 2
    assert resp.status_code == 200


def test_post_with_retry_exhausts_and_raises():
    async def always_500(url, headers=None, json=None):
        return _resp(500)

    client = types.SimpleNamespace(post=always_500)
    with pytest.raises(httpx.HTTPStatusError):
        __import__("asyncio").run(
            post_with_retry(client, URL, headers={}, json_body={}, max_retries=2, backoff_base=0)
        )


def test_post_with_retry_retries_transport_error_then_succeeds():
    calls = {"n": 0}

    async def flaky(url, headers=None, json=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("boom", request=httpx.Request("POST", URL))
        return _resp(200)

    client = types.SimpleNamespace(post=flaky)
    resp = __import__("asyncio").run(
        post_with_retry(client, URL, headers={}, json_body={}, max_retries=3, backoff_base=0)
    )
    assert calls["n"] == 2
    assert resp.status_code == 200

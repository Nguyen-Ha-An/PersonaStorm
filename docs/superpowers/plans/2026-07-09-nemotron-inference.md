# Nemotron Reasoning-Model Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nvidia/nemotron-3-ultra-550b-a55b` a live provider for both LLM roles in the Python backend (`apps/api`) — the persona reaction swarm and the report analyst — with opt-in reasoning, a fallback structured-output mode, retry/backoff, and bounded per-persona failure tolerance.

**Architecture:** Extend the two existing NVIDIA provider classes (`NvidiaProvider` for the swarm, `NvidiaAnalyst` for the analyst) rather than adding new classes. New behavior is driven by additive `.env` knobs and injected through two small shared helpers in `llm_common.py`. Per-persona failures are tolerated at the batch layer and capped in the storm runner. Every numeric aggregate stays server-computed — the model supplies reaction text and raw criteria scores only.

**Tech Stack:** Python 3.10+, FastAPI, `pydantic-settings`, `httpx` (async), `pytest`. Tests use a mocked httpx transport — no live key, no GPU.

## Global Constraints

Every task's requirements implicitly include these (verbatim from the spec):

- **Target `apps/api` only. Do NOT touch `apps/web`.**
- **Numeric honesty is absolute.** `market_fit_score`, `status`, and all counts/curves are recomputed server-side in `parse_llm_reaction` / `compute_market_fit` / `status_for`. The model supplies reaction *text* + raw criteria scores; the analyst rewrites *text* only, never a number.
- **The analyst must never raise.** `enhance_report` returns the deterministic report + a note on any failure.
- **Off by default.** New behavior ships off: `NVIDIA_ENABLE_THINKING=false`, `NVIDIA_STRUCTURED_OUTPUT` defaults to today's `guided_json`, retries/tolerance only act when a call actually fails. A fully successful GLM-5.2 / mock storm is byte-for-byte unchanged.
- **Model / endpoint:** `nvidia/nemotron-3-ultra-550b-a55b` on `https://integrate.api.nvidia.com/v1`.
- **Reasoning:** `enable_thinking=true` + `reasoning_budget=4096`; `NVIDIA_MAX_TOKENS` and `ANALYST_MAX_TOKENS` = `8192`. **Invariant:** when thinking is on with a budget set, `max_tokens > reasoning_budget` (else raise `ProviderNotConfiguredError` at construction).
- **Drop cap:** `SWARM_MAX_DROP_FRACTION` default `0.10`.
- **Commit after every task.** Commit type prefixes: `feat` / `test` / `refactor` / `docs`. No attribution trailer.

All test/pytest commands below run from the `apps/api/` directory (where the `app` package lives).

---

### Task 1: Configuration knobs

**Files:**
- Modify: `apps/api/app/config.py` (add fields after `analyst_max_tokens`, line ~44; add a property)
- Test: `apps/api/tests/test_config_nemotron.py` (create)

**Interfaces:**
- Produces new `Settings` fields: `nvidia_enable_thinking: bool` (default `False`), `nvidia_reasoning_budget: int | None` (default `None`), `nvidia_structured_output: Literal["guided_json","json_object","none"] | None` (default `None`), `nvidia_max_retries: int` (default `3`), `swarm_max_drop_fraction: float` (default `0.10`), `analyst_model: str | None` (default `None`).
- Produces property `Settings.effective_structured_output -> str` returning one of `"guided_json" | "json_object" | "none"`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_config_nemotron.py`:

```python
"""Config knobs for live nemotron inference (reasoning, retries, tolerance)."""

from app.config import Settings


def test_new_inference_defaults_are_off():
    s = Settings()
    assert s.nvidia_enable_thinking is False
    assert s.nvidia_reasoning_budget is None
    assert s.nvidia_structured_output is None
    assert s.nvidia_max_retries == 3
    assert s.swarm_max_drop_fraction == 0.10
    assert s.analyst_model is None


def test_effective_structured_output_defaults_to_guided_json():
    # Preserves today's behavior: nvidia_use_guided_json defaults True.
    assert Settings().effective_structured_output == "guided_json"


def test_effective_structured_output_legacy_bool_false_maps_to_json_object():
    assert Settings(nvidia_use_guided_json=False).effective_structured_output == "json_object"


def test_effective_structured_output_explicit_wins_over_legacy_bool():
    s = Settings(nvidia_use_guided_json=True, nvidia_structured_output="none")
    assert s.effective_structured_output == "none"


def test_reasoning_fields_parse_from_values():
    s = Settings(nvidia_enable_thinking=True, nvidia_reasoning_budget=4096)
    assert s.nvidia_enable_thinking is True
    assert s.nvidia_reasoning_budget == 4096
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_config_nemotron.py -v`
Expected: FAIL — `AttributeError`/`ValidationError` (fields and property don't exist yet).

- [ ] **Step 3: Add the fields**

In `apps/api/app/config.py`, immediately after the `analyst_max_tokens` field (line ~44), add:

```python
    # --- live reasoning-model inference (nemotron) ---------------------------
    # Opt-in reasoning: send chat_template_kwargs.enable_thinking + reasoning_budget.
    # OFF by default so GLM-5.2 / mock / vllm paths are unchanged.
    nvidia_enable_thinking: bool = False
    nvidia_reasoning_budget: int | None = None
    # Swarm structured-output mode. None -> fall back to the legacy
    # nvidia_use_guided_json bool (True->guided_json, False->json_object).
    # "none" sends no structured-output field (matches nemotron's verified call).
    nvidia_structured_output: Literal["guided_json", "json_object", "none"] | None = None
    # Retry attempts on 429/5xx/transport errors for real providers.
    nvidia_max_retries: int = 3
    # Max fraction of persona reactions allowed to fail-after-retry before the
    # storm fails honestly rather than shipping a thin report.
    swarm_max_drop_fraction: float = 0.10
    # Optional analyst-only model override; falls back to nvidia_model.
    analyst_model: str | None = None
```

- [ ] **Step 4: Add the resolution property**

In `apps/api/app/config.py`, add this property next to `supabase_configured` (after line ~101):

```python
    @property
    def effective_structured_output(self) -> str:
        """Swarm structured-output mode. Explicit nvidia_structured_output wins;
        otherwise map the legacy nvidia_use_guided_json bool."""
        if self.nvidia_structured_output is not None:
            return self.nvidia_structured_output
        return "guided_json" if self.nvidia_use_guided_json else "json_object"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_config_nemotron.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/config.py apps/api/tests/test_config_nemotron.py
git commit -m "feat: add nemotron reasoning/retry/tolerance config knobs"
```

---

### Task 2: `apply_reasoning_params` helper

**Files:**
- Modify: `apps/api/app/services/inference/llm_common.py` (add imports + function)
- Test: `apps/api/tests/test_llm_common.py` (create)

**Interfaces:**
- Produces `apply_reasoning_params(payload: dict, *, enable_thinking: bool, reasoning_budget: int | None) -> None` — mutates `payload` in place, adding `chat_template_kwargs={"enable_thinking": True}` when `enable_thinking`, and `reasoning_budget` when it is not None. No-op when thinking is off.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_llm_common.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_common.py -v`
Expected: FAIL — `ImportError: cannot import name 'apply_reasoning_params'`.

- [ ] **Step 3: Add imports and the function**

In `apps/api/app/services/inference/llm_common.py`, extend the top imports (after `import json`, line 11):

```python
import asyncio
import logging
import random

import httpx
```

Then add a module logger after the imports block:

```python
logger = logging.getLogger(__name__)
```

At the end of `llm_common.py`, append:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_llm_common.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/inference/llm_common.py apps/api/tests/test_llm_common.py
git commit -m "feat: apply_reasoning_params helper for reasoning-model requests"
```

---

### Task 3: `post_with_retry` helper

**Files:**
- Modify: `apps/api/app/services/inference/llm_common.py` (append function + private helpers)
- Test: `apps/api/tests/test_llm_common.py` (extend)

**Interfaces:**
- Produces `async post_with_retry(client, url, *, headers: dict, json_body: dict, max_retries: int = 3, backoff_base: float = 0.5) -> httpx.Response` — POSTs; retries on HTTP 429, HTTP 5xx, and `httpx.TransportError` with exponential backoff + jitter (honoring a numeric `Retry-After` header); calls `raise_for_status()` and returns the response on success; re-raises the final error after exhausting retries.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/test_llm_common.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_common.py -v`
Expected: FAIL — `ImportError: cannot import name 'post_with_retry'`.

- [ ] **Step 3: Add the function and private helpers**

Append to `apps/api/app/services/inference/llm_common.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_llm_common.py -v`
Expected: PASS (6 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/inference/llm_common.py apps/api/tests/test_llm_common.py
git commit -m "feat: post_with_retry helper (429/5xx/transport backoff)"
```

---

### Task 4: NvidiaProvider — reasoning, 3-way structured output, retry, invariant

**Files:**
- Modify: `apps/api/app/services/inference/nvidia_provider.py` (imports, `__init__`, `react`)
- Modify: `apps/api/app/services/inference/factory.py` (the `nvidia` case)
- Test: `apps/api/tests/test_providers.py` (extend)

**Interfaces:**
- Consumes `apply_reasoning_params`, `post_with_retry` (Task 2/3), `Settings.effective_structured_output` (Task 1).
- Produces `NvidiaProvider(api_key, base_url, model, structured_output="guided_json", max_tokens=2048, enable_thinking=False, reasoning_budget=None, max_retries=3, timeout_s=120.0)`. Attribute `self.structured_output` is one of `"guided_json" | "json_object" | "none"`. `react()` sends `chat_template_kwargs`/`reasoning_budget` when thinking is on and the structured-output field per mode.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/test_providers.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_providers.py -v`
Expected: FAIL — `TypeError` on unexpected `structured_output` kwarg (constructor still takes `use_guided_json`).

- [ ] **Step 3: Update the provider imports**

In `apps/api/app/services/inference/nvidia_provider.py`, change line 43:

```python
from .llm_common import apply_reasoning_params, parse_llm_reaction, post_with_retry
```

- [ ] **Step 4: Replace the constructor**

Replace `NvidiaProvider.__init__` (lines ~52-80) with:

```python
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
```

- [ ] **Step 5: Replace the `react` body**

Replace the payload/POST/parse portion of `react` (lines ~96-124) with:

```python
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
```

- [ ] **Step 6: Update the factory**

In `apps/api/app/services/inference/factory.py`, replace the `nvidia` case (lines ~22-29):

```python
        case "nvidia":
            return NvidiaProvider(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url,
                model=settings.nvidia_model,
                structured_output=settings.effective_structured_output,
                max_tokens=settings.nvidia_max_tokens,
                enable_thinking=settings.nvidia_enable_thinking,
                reasoning_budget=settings.nvidia_reasoning_budget,
                max_retries=settings.nvidia_max_retries,
            )
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `python -m pytest tests/test_providers.py tests/test_llm_parse.py -v`
Expected: PASS (existing factory tests + 7 new provider tests + parse tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/services/inference/nvidia_provider.py apps/api/app/services/inference/factory.py apps/api/tests/test_providers.py
git commit -m "feat: nemotron reasoning, 3-way structured output, and retry in NvidiaProvider"
```

---

### Task 5: NvidiaAnalyst — reasoning, analyst_model, retry, invariant

**Files:**
- Modify: `apps/api/app/services/analyst/nvidia_analyst.py` (imports, `__init__`, `enhance_report`)
- Modify: `apps/api/app/services/analyst/factory.py` (the `nvidia` branch)
- Test: `apps/api/tests/test_analyst.py` (extend + patch existing fakes)

**Interfaces:**
- Consumes `apply_reasoning_params`, `post_with_retry` (Task 2/3), `Settings.analyst_model`, `Settings.nvidia_enable_thinking`, `Settings.nvidia_reasoning_budget`, `Settings.nvidia_max_retries`.
- Produces `NvidiaAnalyst(api_key, base_url, model, max_tokens=4096, enable_thinking=False, reasoning_budget=None, max_retries=3, timeout_s=60.0)`. `enhance_report` sends reasoning params when enabled and posts via `post_with_retry`; still never raises.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/test_analyst.py`:

```python
def test_nvidia_analyst_sends_reasoning_params_when_enabled(sample_report):
    analyst = NvidiaAnalyst(
        "nvapi-test", "https://integrate.api.nvidia.com/v1",
        "nvidia/nemotron-3-ultra-550b-a55b", max_tokens=8192,
        enable_thinking=True, reasoning_budget=4096,
    )
    captured = {}
    payload = {
        "executive_summary": "Clear signal; pricing is the blocker.",
        "recommendations": [
            {"title": "Clarify pricing", "detail": "Add a pricing FAQ.", "priority": "now"},
        ],
        "top_objection_labels": ["Price unclear"],
        "kill_quote": "Too pricey for what it does.",
    }

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            import json as _j
            return {"choices": [{"message": {"content": _j.dumps(payload),
                                             "reasoning_content": "…"}}]}

    async def _fake_post(url, headers=None, json=None):
        captured["json"] = json
        return _Resp()

    analyst._client.post = _fake_post
    out = asyncio.run(analyst.enhance_report(sample_report))

    assert captured["json"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert captured["json"]["reasoning_budget"] == 4096
    assert out.summary == payload["executive_summary"]


def test_nvidia_analyst_empty_content_falls_back(sample_report):
    analyst = NvidiaAnalyst("nvapi-test", "https://integrate.api.nvidia.com/v1", "z-ai/glm-5.2")

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "", "reasoning_content": "all budget"}}]}

    async def _fake_post(url, headers=None, json=None):
        return _Resp()

    analyst._client.post = _fake_post
    out = asyncio.run(analyst.enhance_report(sample_report))
    assert any("unavailable" in n.lower() for n in out.quality.notes)


def test_nvidia_analyst_reasoning_budget_exceeds_max_tokens_raises():
    from app.services.inference.base import ProviderNotConfiguredError
    with pytest.raises(ProviderNotConfiguredError):
        NvidiaAnalyst(
            "nvapi-test", "https://integrate.api.nvidia.com/v1", "m",
            max_tokens=2048, enable_thinking=True, reasoning_budget=4096,
        )
```

- [ ] **Step 2: Patch the existing fakes so they carry a status_code**

`enhance_report` now posts through `post_with_retry`, which inspects `resp.status_code`. Update the two existing `_FakeResp` classes in `apps/api/tests/test_analyst.py` (in `test_nvidia_analyst_enhance_report_bad_json_falls_back` and `test_nvidia_analyst_enhance_report_happy_path`) to add a class attribute:

```python
    class _FakeResp:
        status_code = 200

        def raise_for_status(self):
            return None
        # ...existing json() unchanged...
```

(The `_boom` failure tests raise before returning, so they need no change.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_analyst.py -v`
Expected: FAIL — new tests fail on unexpected `enable_thinking` kwarg / missing reasoning params.

- [ ] **Step 4: Update the analyst imports and constructor**

In `apps/api/app/services/analyst/nvidia_analyst.py`, add after the existing imports (after line 22):

```python
from ..inference.llm_common import apply_reasoning_params, post_with_retry
```

Replace `NvidiaAnalyst.__init__` (lines ~34-58) with:

```python
    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int = 4096,
        enable_thinking: bool = False,
        reasoning_budget: int | None = None,
        max_retries: int = 3,
        timeout_s: float = 60.0,
    ):
        if not base_url:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=nvidia but NVIDIA_BASE_URL is not set. Point it "
                "at https://integrate.api.nvidia.com/v1 (hosted) or your NIM "
                "container's /v1 endpoint, or use ANALYST_PROVIDER=mock."
            )
        if "integrate.api.nvidia.com" in base_url and not api_key:
            raise ProviderNotConfiguredError(
                "ANALYST_PROVIDER=nvidia targets the hosted NVIDIA endpoint but "
                "NVIDIA_API_KEY is not set. Generate an 'nvapi-' key at "
                "build.nvidia.com, set NVIDIA_API_KEY in .env, or switch to mock."
            )
        if enable_thinking and reasoning_budget is not None and max_tokens <= reasoning_budget:
            raise ProviderNotConfiguredError(
                f"ANALYST_MAX_TOKENS ({max_tokens}) must exceed NVIDIA_REASONING_BUDGET "
                f"({reasoning_budget}) when NVIDIA_ENABLE_THINKING=true."
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.max_tokens = max_tokens
        self.enable_thinking = enable_thinking
        self.reasoning_budget = reasoning_budget
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(timeout=timeout_s)
```

- [ ] **Step 5: Update the `enhance_report` request**

In `enhance_report` (lines ~104-120), replace the payload construction and POST with:

```python
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": ANALYST_SYSTEM_PROMPT},
                    {"role": "user", "content": build_analyst_user_prompt(report)},
                ],
                "temperature": 0.2,
                "top_p": 0.9,
                "max_tokens": self.max_tokens,
            }
            apply_reasoning_params(
                payload, enable_thinking=self.enable_thinking, reasoning_budget=self.reasoning_budget
            )
            resp = await post_with_retry(
                self._client,
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json_body=payload,
                max_retries=self.max_retries,
            )
            message = resp.json()["choices"][0]["message"]
```

(Remove the old `resp = await self._client.post(...)` and `resp.raise_for_status()` lines — `post_with_retry` already raises for status. The empty-content case is handled by `_extract_json` raising, which the surrounding `try` turns into the fallback note.)

- [ ] **Step 6: Update the analyst factory**

In `apps/api/app/services/analyst/factory.py`, replace the `NvidiaAnalyst(...)` construction (lines ~25-30):

```python
            return NvidiaAnalyst(
                settings.nvidia_api_key,
                settings.nvidia_base_url,
                settings.analyst_model or settings.nvidia_model,
                max_tokens=settings.analyst_max_tokens,
                enable_thinking=settings.nvidia_enable_thinking,
                reasoning_budget=settings.nvidia_reasoning_budget,
                max_retries=settings.nvidia_max_retries,
            )
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `python -m pytest tests/test_analyst.py -v`
Expected: PASS (all existing analyst tests + 3 new ones).

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/services/analyst/nvidia_analyst.py apps/api/app/services/analyst/factory.py apps/api/tests/test_analyst.py
git commit -m "feat: nemotron reasoning, analyst_model override, and retry in NvidiaAnalyst"
```

---

### Task 6: Tolerant batch — drop personas that fail after retries

**Files:**
- Modify: `apps/api/app/services/inference/base.py` (imports + `react_batch`)
- Test: `apps/api/tests/test_batch_and_cap.py` (create)

**Interfaces:**
- Produces the updated default `react_batch(...)`: fans out `react()` under the concurrency semaphore with `return_exceptions=True`, logs and drops any persona whose `react()` raised, and returns the list of successful `PersonaReaction`s only (length ≤ len(personas)). Mock/vLLM inherit this unchanged in the success case.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_batch_and_cap.py`:

```python
"""Per-persona failure tolerance (react_batch) and the storm drop-cap policy."""

import asyncio

from app.services.inference.base import PersonaInferenceProvider
from app.services.inference import MockPersonaProvider
from app.services.persona import PersonaGenerator
from app.services.stimulus_parser import parse_stimulus

STIM = "AI copilot for sales teams. $40/seat/mo. 14-day trial. Used by 300 teams."


class _FlakyProvider(PersonaInferenceProvider):
    """Delegates to the mock but fails the first `n_fail` react() calls."""

    name = "flaky"

    def __init__(self, n_fail: int):
        self._mock = MockPersonaProvider(seed=3)
        self._n_fail = n_fail
        self._seen = 0
        self._lock = asyncio.Lock()

    async def react(self, persona, stimulus, stimulus_type, features=None, category=None):
        async with self._lock:
            self._seen += 1
            fail = self._seen <= self._n_fail
        if fail:
            raise RuntimeError("simulated inference failure")
        return await self._mock.react(persona, stimulus, stimulus_type, features, category)


def test_react_batch_drops_failed_personas():
    personas, _ = PersonaGenerator(seed=3).generate("us_smb", 20)
    features = parse_stimulus(STIM, "Copilot", "product_concept")
    provider = _FlakyProvider(n_fail=3)
    reactions = asyncio.run(
        provider.react_batch(personas, STIM, "product_concept", features, concurrency=4)
    )
    assert len(reactions) == 17  # 20 - 3 dropped
    assert all(r.persona_id for r in reactions)


def test_react_batch_all_success_returns_all():
    personas, _ = PersonaGenerator(seed=3).generate("us_smb", 20)
    features = parse_stimulus(STIM, "Copilot", "product_concept")
    provider = _FlakyProvider(n_fail=0)
    reactions = asyncio.run(
        provider.react_batch(personas, STIM, "product_concept", features, concurrency=4)
    )
    assert len(reactions) == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_batch_and_cap.py -v`
Expected: FAIL — `test_react_batch_drops_failed_personas` raises `RuntimeError` (current `gather` re-raises).

- [ ] **Step 3: Add logging import**

In `apps/api/app/services/inference/base.py`, extend the imports (after `import asyncio`, line 11):

```python
import logging
```

And after the imports block add:

```python
logger = logging.getLogger(__name__)
```

- [ ] **Step 4: Make `react_batch` tolerant**

In `apps/api/app/services/inference/base.py`, replace the final line of `react_batch` (line ~70):

```python
        return list(await asyncio.gather(*(_one(p) for p in personas)))
```

with:

```python
        results = await asyncio.gather(*(_one(p) for p in personas), return_exceptions=True)
        reactions: list[PersonaReaction] = []
        for persona, res in zip(personas, results):
            if isinstance(res, Exception):
                logger.warning(
                    "dropping persona %s after inference failure: %s", persona.persona_id, res
                )
                continue
            reactions.append(res)
        return reactions
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_batch_and_cap.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/services/inference/base.py apps/api/tests/test_batch_and_cap.py
git commit -m "feat: tolerate per-persona inference failures in react_batch"
```

---

### Task 7: Drop-cap policy + storm-runner wiring

**Files:**
- Modify: `apps/api/app/services/storm_runner.py` (add exception + `evaluate_drop_cap`, wire into `_execute`)
- Test: `apps/api/tests/test_batch_and_cap.py` (extend)

**Interfaces:**
- Consumes the tolerant `react_batch` (Task 6) and `Settings.swarm_max_drop_fraction` (Task 1).
- Produces `SwarmDropCapExceeded(RuntimeError)` and `evaluate_drop_cap(generated: int, completed: int, max_fraction: float) -> str | None` — returns `None` when nothing dropped, a human note string when drops are within the cap, and raises `SwarmDropCapExceeded` when the dropped fraction exceeds `max_fraction`.

- [ ] **Step 1: Write the failing tests (pure function)**

Append to `apps/api/tests/test_batch_and_cap.py`:

```python
import pytest

from app.services.storm_runner import (
    SwarmDropCapExceeded,
    StormManager,
    StormRun,
    evaluate_drop_cap,
)
from app.config import Settings
from app.schemas.storm import StormCreateRequest


def test_evaluate_drop_cap_no_drops_returns_none():
    assert evaluate_drop_cap(50, 50, 0.10) is None


def test_evaluate_drop_cap_within_cap_returns_note():
    note = evaluate_drop_cap(50, 47, 0.10)
    assert note is not None
    assert "3 of 50" in note


def test_evaluate_drop_cap_at_cap_boundary_allows():
    # exactly 10% dropped is allowed (not > cap)
    assert evaluate_drop_cap(50, 45, 0.10) is not None


def test_evaluate_drop_cap_over_cap_raises():
    with pytest.raises(SwarmDropCapExceeded):
        evaluate_drop_cap(50, 40, 0.10)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_batch_and_cap.py -v`
Expected: FAIL — `ImportError` (symbols not defined yet).

- [ ] **Step 3: Add the exception and policy function**

In `apps/api/app/services/storm_runner.py`, after `new_storm_id()` (line ~44), add:

```python
class SwarmDropCapExceeded(RuntimeError):
    """Raised when too many persona reactions failed after retries."""


def evaluate_drop_cap(generated: int, completed: int, max_fraction: float) -> str | None:
    """Decide what to do about persona reactions dropped after retries.

    Returns None when nothing was dropped, a note string when the dropped
    fraction is within `max_fraction`, and raises SwarmDropCapExceeded when it
    exceeds the cap (a systemic failure — bad key, endpoint down, always
    truncating — should fail the storm honestly, not ship a thin report).
    """
    dropped = generated - completed
    if dropped <= 0:
        return None
    if generated > 0 and dropped / generated > max_fraction:
        raise SwarmDropCapExceeded(
            f"{dropped} of {generated} persona reactions failed after retries "
            f"({dropped / generated:.0%} > {max_fraction:.0%} cap)"
        )
    return (
        f"{dropped} of {generated} persona reactions dropped after retries "
        "(live provider) — report reflects the smaller sample."
    )
```

- [ ] **Step 4: Wire it into `_execute`**

In `apps/api/app/services/storm_runner.py`, immediately after the swarm `for i in range(0, len(personas), batch):` loop ends (after line ~249, before `# 5) Quality Checker`), insert:

```python
            # Bounded failure tolerance: react_batch drops personas that fail
            # after retries. Enforce the cap (raises -> storm fails + refund) and
            # remember the note to attach to the report below.
            drop_note = evaluate_drop_cap(
                len(run.personas), len(run.reactions), s.swarm_max_drop_fraction
            )
```

Then, immediately after `run.report = build_report(...)` (line ~263) and before the analyst `try:` block, insert:

```python
            if drop_note:
                run.report.quality.notes.append(drop_note)
```

- [ ] **Step 5: Write the runner integration tests**

Append to `apps/api/tests/test_batch_and_cap.py`:

```python
def _manager_with_flaky(tmp_path, n_fail, drop_fraction=0.10):
    (tmp_path / "data" / "benchmark_samples").mkdir(parents=True, exist_ok=True)
    settings = Settings(
        inference_provider="mock",
        analyst_provider="mock",
        data_dir=tmp_path / "data",
        runs_dir=tmp_path / "runs",
        swarm_max_drop_fraction=drop_fraction,
        storm_batch_size=200,
        storm_batch_interval_ms=0,
    )
    manager = StormManager(settings)
    manager.provider = _FlakyProvider(n_fail=n_fail)  # bypass mock so drops happen
    return manager


def _request():
    return StormCreateRequest(
        title="Copilot", stimulus_type="product_concept", stimulus=STIM,
        target_market="us_smb", persona_count=20,
    )


def test_execute_within_cap_completes_with_drop_note(tmp_path):
    manager = _manager_with_flaky(tmp_path, n_fail=2)  # 2/20 = 10% -> allowed
    run = StormRun(_request(), seed=3)
    manager.runs[run.id] = run
    asyncio.run(manager._execute(run))
    assert run.status.value == "complete"
    assert any("dropped after retries" in n for n in run.report.quality.notes)


def test_execute_over_cap_fails_storm(tmp_path):
    manager = _manager_with_flaky(tmp_path, n_fail=5)  # 5/20 = 25% -> over cap
    run = StormRun(_request(), seed=3)
    manager.runs[run.id] = run
    asyncio.run(manager._execute(run))
    assert run.status.value == "failed"
    assert run.error is not None
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_batch_and_cap.py -v`
Expected: PASS (all tolerance + cap + runner tests). If `compute_quality` errors on the empty `benchmark_samples` dir, that's an environment issue to resolve before proceeding — the dir is created in the fixture to avoid it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/services/storm_runner.py apps/api/tests/test_batch_and_cap.py
git commit -m "feat: cap swarm drop fraction and note dropped reactions in the report"
```

---

### Task 8: Documentation

**Files:**
- Modify: `.env.example` (add an apps/api live-nemotron subsection)
- Modify: `apps/api/docs/inference-roadmap.md` — NOTE: the roadmap lives at `docs/inference-roadmap.md` under the repo root; confirm the path with `git ls-files "*inference-roadmap.md"` before editing.
- Modify: `apps/api/README.md` (one-line pointer)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the apps/api recipe to `.env.example`**

In `.env.example`, directly below the existing `ANALYST_MAX_TOKENS=4096` line in the "Inference providers" block, add:

```bash

# ── apps/api (Python reference backend) — live nemotron reasoning inference ──
# These knobs are read by the FastAPI service (apps/api) only; the Vercel web
# app ignores them. The hosted swarm is for correctness testing at small
# persona_count (create a storm with persona_count=50), NOT full 1,000-persona
# production runs — see docs/inference-roadmap.md.
#   NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
#   NVIDIA_STRUCTURED_OUTPUT=json_object   # guided_json | json_object | none;
#                                          # 'none' matches the verified call shape
#   NVIDIA_ENABLE_THINKING=true            # send chat_template_kwargs.enable_thinking
#   NVIDIA_REASONING_BUDGET=4096           # thinking-token cap
#   NVIDIA_MAX_TOKENS=8192                 # MUST exceed the reasoning budget
#   ANALYST_MAX_TOKENS=8192                # MUST exceed the reasoning budget
#   NVIDIA_MAX_RETRIES=3                   # 429/5xx backoff attempts
#   SWARM_MAX_DROP_FRACTION=0.10           # fail the storm if more drop after retries
#   STORM_MAX_CONCURRENCY=4                # gentle on the rate-limited endpoint
```

- [ ] **Step 2: Update the inference roadmap**

Confirm the path, then in the roadmap's "Stage 1 — NVIDIA NIM" section, after the existing config block, add a subsection:

```markdown
### Nemotron (reasoning model) variant

`nvidia/nemotron-3-ultra-550b-a55b` is a hybrid-reasoning model usable for
either role. Unlike GLM-5.2 it needs reasoning opted in per request and a
larger token budget:

    NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
    NVIDIA_ENABLE_THINKING=true      # -> chat_template_kwargs.enable_thinking
    NVIDIA_REASONING_BUDGET=4096     # -> reasoning_budget
    NVIDIA_MAX_TOKENS=8192           # must exceed the reasoning budget
    ANALYST_MAX_TOKENS=8192
    NVIDIA_STRUCTURED_OUTPUT=json_object  # or 'none' if the endpoint rejects it

Reasoning text returns in a separate `reasoning_content` field and is ignored;
only `content` (the JSON answer) is parsed. Swarm calls retry on 429/5xx and
tolerate a bounded fraction of per-persona failures (SWARM_MAX_DROP_FRACTION);
run live swarm tests at small persona_count (e.g. 50). Numbers stay
Python-computed, exactly as with GLM-5.2.
```

- [ ] **Step 3: Add a README pointer**

In `apps/api/README.md`, add one line under its configuration/inference section:

```markdown
- Live nemotron reasoning inference (both roles): see the "live nemotron" block in `.env.example` and `docs/inference-roadmap.md`. Test at `persona_count=50`.
```

- [ ] **Step 4: Run the full suite**

Run: `python -m pytest -q`
Expected: PASS (entire `apps/api` suite green).

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/inference-roadmap.md apps/api/README.md
git commit -m "docs: document live nemotron reasoning inference for apps/api"
```

---

## Self-Review

**1. Spec coverage:**

- §3.1 config knobs → Task 1 (all six fields + `effective_structured_output`); `max_tokens > reasoning_budget` invariant → Tasks 4 & 5 (provider constructors). ✓
- §3.2 `apply_reasoning_params` → Task 2. ✓
- §3.3 swarm reasoning + 3-way structured output + retry + empty-content → Task 4 (empty content handled by `parse_llm_reaction` raising; asserted). ✓
- §3.4 analyst reasoning + `analyst_model` + retry + empty-content → Task 5 (empty content handled by `_extract_json` raising → fallback; asserted). ✓
- §3.5 tolerant batch + cap + quality note → Tasks 6 & 7. ✓
- §3.6 numeric honesty → unchanged; no task computes a number from model output; analyst numeric-snapshot tests already guard it. ✓
- §4 request/response shapes → Task 4/5 payload construction + `reasoning_content` ignored. ✓
- §5 error handling → retry (Task 3), fallback (Task 5), cap (Task 7), no-secret logging preserved. ✓
- §6 testing → each task is TDD; retry, modes, empty-content, tolerance, cap, invariant all covered. ✓
- §7 docs → Task 8. ✓
- §9 recipe → Task 8 `.env.example`. ✓

**2. Placeholder scan:** No "TBD/TODO/handle appropriately" — every code and test step shows full content. The only path caveat (roadmap file location) includes the exact command to resolve it. ✓

**3. Type consistency:** `apply_reasoning_params(payload, *, enable_thinking, reasoning_budget)` and `post_with_retry(client, url, *, headers, json_body, max_retries, backoff_base)` are used with those exact keywords in Tasks 4 and 5. `structured_output` attribute name matches between constructor and `react`. `evaluate_drop_cap(generated, completed, max_fraction)` and `SwarmDropCapExceeded` are defined in Task 7 and imported with those names in the tests. `effective_structured_output` is defined in Task 1 and consumed in the Task 4 factory edit. ✓

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between tasks (uses superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with checkpoints (uses superpowers:executing-plans).

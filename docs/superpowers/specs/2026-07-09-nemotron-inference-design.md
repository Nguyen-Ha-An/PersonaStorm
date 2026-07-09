---
title: PersonaStorm - Nemotron Reasoning-Model Inference (apps/api)
date: 2026-07-09
status: draft
approach: "Config-gated reasoning params on the existing NVIDIA providers"
---

# PersonaStorm - Nemotron Reasoning-Model Inference (apps/api)

Wire NVIDIA's `nvidia/nemotron-3-ultra-550b-a55b` reasoning model into the Python reference backend (`apps/api`) as a live provider for **both** LLM roles — the persona reaction **swarm** and the report **analyst** — as a pure `.env` change, adding only the plumbing a reasoning model needs (opt-in thinking, a fallback structured-output mode, retry/backoff, and graceful per-persona failure tolerance). No numbers the engine computes ever change.

## 1. Summary & Goals

**Summary.** PersonaStorm is a synthetic market-research "wind tunnel": a user pastes a stimulus (product concept, landing copy, ad, or pricing table); the engine generates up to 1,200 AI personas who react across a 17-criterion schema, and returns a market-fit report. The system has **two independent LLM swap points**, each a pure `.env` knob today (`docs/inference-roadmap.md`):

1. **Reaction swarm** (`INFERENCE_PROVIDER=mock|nvidia|vllm`) — one structured reaction per persona; up to ~1,000 calls per storm.
2. **Analyst** (`ANALYST_PROVIDER=mock|nvidia`) — one call per storm that re-narrates the executive summary, recommendations, top-objection labels, and kill quote **from aggregates the deterministic engine already computed**.

The current non-mock model is `z-ai/glm-5.2`. This project makes `nvidia/nemotron-3-ultra-550b-a55b` a first-class option for both roles.

**Motivation.** The site was originally intended to compute on the Fireworks API, but the prototype has a limited inference budget. NVIDIA Build (`https://integrate.api.nvidia.com/v1`) offers an OpenAI-compatible hosted endpoint the team already has a working `nvapi-` key for, verified against `nvidia/nemotron-3-ultra-550b-a55b`. Nemotron is a **550B hybrid-reasoning model** and differs from GLM-5.2 in three ways the current code does not handle:

- Reasoning is **opt-in per request** via `chat_template_kwargs.enable_thinking` + a `reasoning_budget` (the verified snippet sets `enable_thinking=true`, `reasoning_budget=16384`). The current providers never send these.
- Reasoning text returns in a **separate `reasoning_content`** field, distinct from the answer `content`. (The current code already reads only `content`, which is correct — but a tight reasoning budget can truncate `content` to empty, a new failure mode.)
- It is token-heavy and slow; the swarm's default `NVIDIA_MAX_TOKENS=2048` is **below** a useful reasoning budget, which would starve the JSON answer.

**Why `apps/api` is the right target.** The production site is the Vercel Next.js app (`apps/web`), whose serverless Route Handlers have a 60s limit — the root `.env.example` explicitly recommends `mock` there because a live 1,000-persona swarm "may exceed a serverless function's time limit." The Python FastAPI service (`apps/api`) is the local/dev/reference backend: a long-lived async service with real concurrency control (`STORM_MAX_CONCURRENCY`) and no serverless timeout. It is therefore the correct home for live nemotron inference and swarm testing. **`apps/web` is out of scope.**

**Chosen approach — config-gated params on the existing providers.** Extend `NvidiaProvider` (swarm) and `NvidiaAnalyst` (analyst) with reasoning support driven by new `.env` knobs, injected through one shared helper. No new provider classes; no model-name magic. This preserves the codebase's core rule: *swapping providers is a pure `.env` change, never a code change* (`config.py`). Two alternatives were rejected: (B) auto-detecting `"nemotron"` in the model string (implicit and brittle), and (C) a dedicated `NemotronAnalyst`/`NemotronProvider` subclass (duplicates ~90% of the existing HTTP/parse/fallback code — violates DRY).

**Hard constraints.**

- **Numeric honesty is absolute.** `market_fit_score`, `status`, and every count/curve are recomputed **server-side** in `parse_llm_reaction` / `compute_market_fit` / `status_for`, regardless of provider. The model supplies reaction *text* and raw criteria scores only; the analyst rewrites *text* only and never touches a number. Swapping to nemotron changes reaction quality, never scoring honesty.
- **A storm must never crash because of the analyst.** `enhance_report` stays contractually non-raising; on any failure it returns the deterministic report plus a note.
- **Everything is a pure `.env` change.** New behavior ships **off by default** (`enable_thinking=false`, retries and tolerance at safe defaults) so existing GLM-5.2 / mock / vLLM paths are byte-for-byte unchanged.
- **Do not touch `apps/web`.**

**Success criteria** (checkable):

1. **Analyst on nemotron.** With `ANALYST_PROVIDER=nvidia`, `NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b`, `NVIDIA_ENABLE_THINKING=true`, `NVIDIA_REASONING_BUDGET=4096`, `ANALYST_MAX_TOKENS=8192`, a storm produces an LLM-narrated report; the request body carries `chat_template_kwargs.enable_thinking` and `reasoning_budget`; the response's `reasoning_content` is ignored and `content` is parsed.
2. **Swarm on nemotron.** With `INFERENCE_PROVIDER=nvidia` and the same model/reasoning config, a **50-persona** storm completes the full pipeline (personas → live swarm → quality → aggregation → analyst → report) end to end against the live endpoint.
3. **Resilience.** A transient 429/5xx is retried with backoff and succeeds; a persona that still fails after retries is skipped (not fatal) and recorded, provided the dropped fraction is within the cap.
4. **Cap enforced.** If more than the configured fraction (default 10%) of personas fail after retries, the storm fails honestly rather than shipping a thin report.
5. **Off-by-default safety.** With none of the new env vars set, `INFERENCE_PROVIDER`/`ANALYST_PROVIDER=nvidia` produce an identical request/response on the success path as today on GLM-5.2. The only added behavior for existing providers is resilience — retry on transient errors and bounded per-persona failure tolerance — observable **only when a call actually fails** (a fully successful storm is byte-for-byte unchanged, and the tolerant batch returns the same full result set when nothing fails). `mock` never fails or retries, so it is entirely unchanged. All existing tests stay green.
6. **New logic covered.** New units (reasoning-param injection, structured-output mode selection, retry/backoff, empty-content guard, drop-cap policy) ship with tests, including the graceful-fallback and cap paths.

## 2. Context: how inference works today

`apps/api` is a FastAPI service. The swap point is the `PersonaInferenceProvider` interface (`services/inference/base.py`): route handlers and `StormManager` only ever see the interface; `INFERENCE_PROVIDER` decides the concrete class via `inference/factory.py`. The analyst mirrors this with `AnalystProvider` + `analyst/factory.py`.

**Swarm path.** `StormManager._execute` (`services/storm_runner.py`) generates personas, then for each chunk of `storm_batch_size` calls `provider.react_batch(...)`, which by default (`base.py`) fans out `react()` calls under an `asyncio.Semaphore(storm_max_concurrency)` via `asyncio.gather` — currently `return_exceptions=False`, so **one failed reaction aborts the whole storm** (caught by the outer `try` → `status=failed` → credit refund). `NvidiaProvider.react` (`inference/nvidia_provider.py`) POSTs a single non-streaming `chat/completions`, optionally with `nvext.guided_json` (default) or `response_format=json_object`, reads `message["content"]`, and hands it to the shared, defensive `parse_llm_reaction` (`inference/llm_common.py`). That parser clamps scores, drops unknown enums, and — critically — **recomputes** `market_fit_score`/`status`. `NvidiaProvider` carries a standing TODO to add 429/5xx retry (the hosted free endpoint is rate-limited).

**Analyst path.** `NvidiaAnalyst.enhance_report` (`analyst/nvidia_analyst.py`) POSTs one non-streaming call at low temperature, extracts JSON from `content`, validates the payload, and copies **only** text fields onto a deep copy of the report. The whole body is wrapped so it never raises; on any failure it returns the original report plus `_FALLBACK_NOTE`.

**Config.** `config.py` (pydantic `BaseSettings`, reads `.env`) holds `nvidia_*`, `analyst_*`, `storm_*` knobs. `persona_count` is per-request (`schemas/storm.py`, `ge=50, le=1200`, default 1000) — so a **50-persona** run is a cheap, full-fidelity way to exercise the live swarm.

## 3. Design

### 3.1 New configuration (`config.py`, documented in `.env.example`)

Additive fields, all with safe defaults so nothing changes unless set:

| Field (env) | Type / default | Role | Purpose |
|---|---|---|---|
| `NVIDIA_ENABLE_THINKING` | `bool` = `false` | both | When true, send `chat_template_kwargs={"enable_thinking": true}`. |
| `NVIDIA_REASONING_BUDGET` | `int \| None` = `None` | both | When set, send `reasoning_budget`. Prototype value: `4096`. |
| `NVIDIA_STRUCTURED_OUTPUT` | `Literal["guided_json","json_object","none"]` = `guided_json` | swarm | Replaces the `nvidia_use_guided_json` bool (kept as a deprecated alias mapping `true→guided_json`, `false→json_object`). **Precedence:** an explicitly set `NVIDIA_STRUCTURED_OUTPUT` always wins; the legacy bool is consulted only when the new var is unset. `none` sends no structured-output field — matches nemotron's verified call shape. |
| `NVIDIA_MAX_RETRIES` | `int` = `3` | both | Max retry attempts on 429/5xx/transport errors. `0` disables. |
| `SWARM_MAX_DROP_FRACTION` | `float` = `0.10` | swarm | Max fraction of personas allowed to fail-after-retry before the storm fails. |
| `ANALYST_MODEL` | `str \| None` = `None` | analyst | Optional analyst-only model override; falls back to `nvidia_model`. Lets the analyst and swarm diverge later without a rewrite. |

Existing knobs reused: `NVIDIA_MAX_TOKENS` (swarm budget → set `8192`), `ANALYST_MAX_TOKENS` (analyst budget → set `8192`), `STORM_MAX_CONCURRENCY` (keep low, ≈`4`, to avoid self-inflicted 429s).

**Config invariant (validated).** When `NVIDIA_ENABLE_THINKING=true` and `NVIDIA_REASONING_BUDGET` is set, assert `NVIDIA_MAX_TOKENS > NVIDIA_REASONING_BUDGET` and `ANALYST_MAX_TOKENS > NVIDIA_REASONING_BUDGET`; otherwise thinking tokens starve the JSON answer. A violation raises a clear `ProviderNotConfiguredError` at startup (fail fast, consistent with how providers are built at app start in `StormManager.__init__`).

### 3.2 Shared reasoning helper (`inference/llm_common.py`)

```
apply_reasoning_params(payload, *, enable_thinking, reasoning_budget) -> None
```

Mutates a request dict in place: adds `chat_template_kwargs={"enable_thinking": True}` when `enable_thinking`, and `reasoning_budget=<n>` when the budget is not None. No-op when thinking is off. One home, used by both providers; the OpenAI-SDK `extra_body` from the verified snippet maps directly to these top-level JSON keys for a raw `httpx` POST.

### 3.3 Swarm provider (`inference/nvidia_provider.py`)

- **Reasoning:** call `apply_reasoning_params` on the payload; raise `NVIDIA_MAX_TOKENS` above the budget (config invariant).
- **Structured output — 3-way:** `guided_json` → `payload["nvext"]={"guided_json": REACTION_JSON_SCHEMA}`; `json_object` → `payload["response_format"]={"type":"json_object"}`; `none` → send neither and rely on `parse_llm_reaction`'s defensive extraction. **Recommended default for nemotron: `json_object`**, with `none` as the escape hatch if the endpoint rejects it. This is the main integration unknown to validate empirically (nemotron + `nvext.guided_json` support on the hosted catalog).
- **Retry/backoff:** wrap the POST in bounded exponential backoff with jitter, retrying on HTTP 429, 5xx, and `httpx.TransportError`, honoring a `Retry-After` header when present, up to `NVIDIA_MAX_RETRIES`. Implemented as a small shared `post_with_retry(...)` in `llm_common.py` so the analyst reuses it. On exhaustion, raise — the caller (batch tolerance, below) decides.
- **Empty-content guard:** if `message["content"]` is empty/whitespace after a successful HTTP call (reasoning consumed the whole budget), raise a parse error so it counts as a failed persona rather than a silent all-defaults reaction.
- Streaming stays **off** (single POST). The snippet's streaming is only for watching thoughts live and is not needed server-side.

### 3.4 Analyst provider (`analyst/nvidia_analyst.py`)

- Constructor takes `enable_thinking`, `reasoning_budget`, and uses `analyst_model or nvidia_model`.
- Apply `apply_reasoning_params`; use `post_with_retry`; keep temperature low (`0.2`) for faithful re-narration.
- **Empty-content guard:** treat empty `content` as a failure → existing non-raising path returns the deterministic report + `_FALLBACK_NOTE`. This is the primary new failure mode a reasoning model introduces for the analyst.
- Everything else (JSON extraction, payload validation, text-only copy, never-raise contract) unchanged.

### 3.5 Per-persona failure tolerance (`inference/base.py` + `storm_runner.py`)

- **Batch:** change the default `react_batch` fan-out to `asyncio.gather(..., return_exceptions=True)`, return only successful `PersonaReaction`s, and log each dropped persona at warning with a sanitized reason. Safe for `mock`/`vllm` (mock never raises; vLLM inherits the same tolerance).
- **Cap + note (runner):** after all batches, the runner compares `completed = len(run.reactions)` against the number of personas generated (`len(run.personas)`, normally `persona_count`). If `(generated - completed) / generated > SWARM_MAX_DROP_FRACTION`, raise → storm fails honestly (systemic problem: bad key, endpoint down, model always truncating). Otherwise, append a quality note (`"N of M persona reactions dropped after retries (live provider)."`) to `report.quality.notes` so the report is transparent about the smaller sample. Reactions stream live as before; the grid simply shows `completed/persona_count`.

### 3.6 Numeric-honesty guarantee — unchanged

No path added here computes or overwrites a number from model output. Reaction scores flow through `compute_market_fit`; statuses through `status_for`; the analyst copies text fields only. This section exists to make the invariant explicit for review.

## 4. Request / response shapes

**Nemotron request (non-streaming), swarm example:**

```json
{
  "model": "nvidia/nemotron-3-ultra-550b-a55b",
  "messages": [{"role": "system", "content": "…persona…"}, {"role": "user", "content": "…stimulus…"}],
  "temperature": 0.8,
  "max_tokens": 8192,
  "chat_template_kwargs": {"enable_thinking": true},
  "reasoning_budget": 4096,
  "response_format": {"type": "json_object"}
}
```

Structured-output field varies by mode: `nvext.guided_json` (guided_json) / `response_format` (json_object) / omitted (none). The analyst body is the same minus the structured-output field, at `temperature: 0.2`, `max_tokens: 8192`.

**Response handling (non-streaming):** read `choices[0].message.content` (the final JSON answer); `choices[0].message.reasoning_content` (the thoughts) is present and **ignored**. Empty `content` → failure.

## 5. Error handling

- **Misconfiguration** (missing key on the hosted endpoint, `max_tokens ≤ reasoning_budget`): raise `ProviderNotConfiguredError` at startup. The analyst factory keeps its graceful fallback to `MockAnalyst`.
- **Transient network/rate limit** (429/5xx/transport): retried with backoff; `Retry-After` honored.
- **Persona failure after retries:** skipped, logged, counted toward the drop cap.
- **Analyst failure of any kind:** deterministic report + `_FALLBACK_NOTE`; never raises.
- **Secrets:** only exception messages are logged, never the API key (existing rule preserved).

## 6. Testing (`apps/api/tests/`)

Extend `test_providers.py`, `test_analyst.py`, `test_llm_parse.py`, and add config coverage. All use a mocked `httpx` transport — no live key, no GPU (mock stays the permanent CI provider):

- **Reasoning injection:** payload includes `chat_template_kwargs.enable_thinking` + `reasoning_budget` when enabled; omits them when disabled.
- **Structured-output modes:** `guided_json` sets `nvext`; `json_object` sets `response_format`; `none` sets neither.
- **Nemotron-shaped response:** `{message:{content:"<json>", reasoning_content:"<thoughts>"}}` parses correctly and ignores `reasoning_content`.
- **Empty content:** swarm → raises (counts as failure); analyst → graceful fallback with note, no raise.
- **Retry/backoff:** mocked 429 then 200 → one retry, success; `Retry-After` respected; exhaustion raises.
- **Batch tolerance + cap:** a batch with some failing personas returns successes only; runner drops within cap → quality note added; drops over cap → storm fails.
- **Config invariant:** `max_tokens ≤ reasoning_budget` with thinking on → startup error; `ANALYST_MODEL` overrides `NVIDIA_MODEL`.
- **Regression:** existing GLM-5.2 / mock / vLLM tests unchanged and green.

## 7. Documentation

- `.env.example`: add the new knobs under a clearly-labeled **"apps/api (Python reference backend) — live nemotron inference"** subsection, with the prototype recipe (§9) and a note that `NVIDIA_STRUCTURED_OUTPUT=none` matches the verified call shape.
- `docs/inference-roadmap.md`: add nemotron as a reasoning-model option for both roles alongside GLM-5.2; document the reasoning params, the token-budget invariant, and the 50-persona test recipe.
- `apps/api/README.md`: one-line pointer to the recipe.

## 8. Out of scope (non-goals)

- **`apps/web`** — untouched. The TypeScript engine keeps GLM-5.2/mock.
- **Full 1,000-persona nemotron production runs** — impractical/expensive on the hosted free endpoint; the roadmap's Stage 2 (vLLM on MI300X) remains the path for at-scale swarm inference. This work targets correctness testing at small `persona_count`.
- **Streaming reasoning to the UI** — the SSE live-grid replay is unchanged; server calls stay non-streaming.
- **Per-role divergent reasoning budgets** — a single shared `NVIDIA_REASONING_BUDGET` is enough for the prototype (each role already has its own `max_tokens`). `ANALYST_MODEL` is provided for model divergence; per-role reasoning knobs are YAGNI.
- **Cost/token metering** — noted as a future TODO, not built here.

## 9. Prototype configuration & test recipe

```bash
# apps/api/.env — live nemotron on both roles
INFERENCE_PROVIDER=nvidia
ANALYST_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
NVIDIA_STRUCTURED_OUTPUT=json_object      # try 'none' if the endpoint rejects it
NVIDIA_ENABLE_THINKING=true
NVIDIA_REASONING_BUDGET=4096
NVIDIA_MAX_TOKENS=8192                     # must exceed the reasoning budget
ANALYST_MAX_TOKENS=8192
NVIDIA_MAX_RETRIES=3
SWARM_MAX_DROP_FRACTION=0.10
STORM_MAX_CONCURRENCY=4                    # gentle on the rate-limited endpoint
```

Test: create a storm with `persona_count=50` and watch it complete end to end. Analyst-only, cheaper test: set `INFERENCE_PROVIDER=mock` and keep `ANALYST_PROVIDER=nvidia` (1 live call/storm).

## 10. Risks & things to validate during implementation

1. **`nvext.guided_json` on nemotron** — may be unsupported on the hosted catalog. Mitigation: default to `json_object`, ship `none` escape hatch, defensive parser already tolerant.
2. **Sampling params for reasoning mode** — very low analyst temperature (`0.2`) with thinking on could degrade some reasoning models; if outputs regress, temperature/top_p is the first tuning knob (kept as code defaults, not new env vars, to avoid config sprawl).
3. **Latency** — 50 personas × (4096 reasoning + answer) on a 550B model is slow but acceptable for a test; low concurrency plus retries widen wall-clock. Acceptable for the stated goal (correctness testing, not throughput).
4. **Budget invariant** — if the endpoint counts reasoning against `max_tokens` differently than assumed, watch for truncated `content`; the empty-content guard converts that into a visible failure rather than silent bad data.

## 11. File-change map

- `apps/api/app/config.py` — new fields + startup invariant.
- `apps/api/app/services/inference/llm_common.py` — `apply_reasoning_params`, `post_with_retry`.
- `apps/api/app/services/inference/nvidia_provider.py` — reasoning params, 3-way structured output, retry, empty-content guard.
- `apps/api/app/services/inference/base.py` — tolerant `react_batch` (`return_exceptions=True`).
- `apps/api/app/services/inference/factory.py` — pass new settings through.
- `apps/api/app/services/analyst/nvidia_analyst.py` — reasoning params, `analyst_model`, retry, empty-content guard.
- `apps/api/app/services/analyst/factory.py` — pass new settings through.
- `apps/api/app/services/storm_runner.py` — drop-cap policy + quality note.
- `apps/api/tests/*` — coverage per §6.
- `.env.example`, `docs/inference-roadmap.md`, `apps/api/README.md` — docs.

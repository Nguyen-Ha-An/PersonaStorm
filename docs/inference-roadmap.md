# Inference roadmap: mock → Fireworks API → vLLM on AMD MI300X

PersonaStorm has **two independent LLM swap points**, each a pure `.env`
change, not a rewrite:

1. **Persona reaction swarm** — `INFERENCE_PROVIDER=mock|fireworks|nvidia|vllm`
   (`services/inference/`, `PersonaInferenceProvider`). Generates the 1,000
   individual persona reactions.
2. **Analyst/report engine** — `ANALYST_PROVIDER=mock|fireworks|nvidia`
   (`services/analyst/`, `AnalystProvider`). One call per storm; re-narrates
   the executive summary, recommendations, top-objection labels, and kill
   quote from aggregates the deterministic engine already computed. Numbers
   stay Python-computed (architecture honesty rule) — the analyst never
   invents `market_fit_score` or any count.

The storm runner, schemas, quality system, and UI are identical across every
combination of the two knobs below.

## Stage 0 — Mock (shipped, default)

Deterministic trait-driven reaction engine (`INFERENCE_PROVIDER=mock`) plus
the local deterministic report builder (`ANALYST_PROVIDER=mock`, which simply
returns the report builder's own text unchanged — see `mock_analyst.py`).
Zero GPU, zero network, reproducible demos. Also the permanent **fallback +
CI provider**: tests and the eval harness run against it forever, so
pipeline regressions never need a GPU or an API key to catch.

## Stage 1 — Fireworks API (shipped — the real prototype's inference)

The competition path (AMD Developer Hackathon: Fireworks serves open models
on AMD hardware). An OpenAI-compatible `FireworksProvider` /
`FireworksAnalyst` pair plus the semantic assessor all run against
**Fireworks AI** with a single key:

```bash
INFERENCE_PROVIDER=fireworks   # persona reaction swarm
ANALYST_PROVIDER=fireworks     # report narration (semantic follows it)
FIREWORKS_API_KEY=fw-...               # from fireworks.ai
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_MODEL=accounts/fireworks/models/deepseek-v4-flash
FIREWORKS_MAX_TOKENS=2048
```

Structured output uses Fireworks' JSON-mode schema dialect
(`response_format={"type": "json_object", "schema": REACTION_JSON_SCHEMA}`),
which hard-constrains generation to the reaction schema the same way
`nvext.guided_json` does on NIM. Parsing reuses the shared, defensive
`parse_llm_reaction()` — `market_fit_score` and `status` are always recomputed
server-side. Every Fireworks path degrades gracefully without a key (swarm
refuses to construct with a clear error; analyst and semantic assessor fall
back to their deterministic mocks with a visible note/label).

The **orchestrated worker swarm** (opt-in, `orchestration_enabled`) also runs
its "main brain" on Fireworks by default (`ORCHESTRATOR_PROVIDER=fireworks`,
model from `FIREWORKS_ORCHESTRATOR_MODEL`, falling back to `FIREWORKS_MODEL`)
with DeepSeek-V4-Flash physical workers — the whole prototype needs only
`FIREWORKS_API_KEY`. Set `ORCHESTRATOR_PROVIDER=nvidia` to route the brain to
NVIDIA-hosted Nemotron instead.

## Reference path — NVIDIA NIM GLM-5.2 (testing only)

A single, OpenAI-compatible `NvidiaProvider` / `NvidiaAnalyst` pair targets
**NVIDIA Build / NVIDIA NIM** — either the hosted `build.nvidia.com` catalog
(`https://integrate.api.nvidia.com/v1`) or a self-hosted NIM container. Kept
for testing/reference; the real prototype runs on Fireworks (above). Both
roles share the same model family, `z-ai/glm-5.2`:

1. **Analyst/report agent** (`ANALYST_PROVIDER=nvidia`,
   `services/analyst/nvidia_analyst.py`) — the first real-LLM milestone.
   Takes the Python-computed aggregates (counts, clusters, curve) and
   rewrites the executive summary, recommendations, top-objection labels,
   and kill quote. Numbers stay Python-computed. Low volume (1 call/storm),
   high value, trivial cost. On any failure (missing key, network error,
   invalid JSON) it logs server-side (no secrets) and falls back to the
   original deterministic report text, plus a note appended to
   `quality.notes` — `enhance_report` never raises, so a storm can never
   crash because of the analyst.
2. **Reaction swarm on NVIDIA NIM** (`INFERENCE_PROVIDER=nvidia`,
   `services/inference/nvidia_provider.py`) — for zero-GPU environments, run
   the whole persona swarm through the same NIM endpoint. 1,000 short
   completions/storm; watch rate limits; set `STORM_MAX_CONCURRENCY` ≈ 8–16.

Both roles share one prompt/schema contract
(`services/inference/prompts.py`, `services/analyst/prompts.py`): the
reaction system prompt tells the model to react AS the persona, evaluated
through the full 17-criterion + age-overlay schema, and to output only
`REACTION_JSON_SCHEMA` — criteria scores, qualitative fields, and a
decision-lite block (`buy_likelihood`, `max_price`,
`recommended_pricing_model`). The model **never** returns `market_fit_score`
or `status`; `parse_llm_reaction` always recomputes both server-side via
`compute_market_fit`, exactly like the mock path (see
[criteria-system.md](criteria-system.md) §5) — so swapping to a live LLM
changes reaction quality, never the scoring honesty guarantee.

Config (`apps/api/app/config.py`, see `.env.example`):

```bash
INFERENCE_PROVIDER=nvidia   # and/or ANALYST_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...            # from build.nvidia.com
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=z-ai/glm-5.2
NVIDIA_USE_GUIDED_JSON=true  # nvext.guided_json; false -> json_object mode
NVIDIA_MAX_TOKENS=2048       # per-persona reaction budget
ANALYST_MAX_TOKENS=4096      # larger budget for report narration
```

`NVIDIA_USE_GUIDED_JSON=true` requests strict JSON via `nvext.guided_json`
for the reaction swarm; set `false` to fall back to
`response_format=json_object` if an endpoint/model rejects the NIM
extension. GLM-5.2 is a reasoning model — reasoning tokens count against
`NVIDIA_MAX_TOKENS`/`ANALYST_MAX_TOKENS`, so both budgets leave headroom
ahead of the JSON payload; the analyst gets a larger budget since report
narration is longer than a single persona reaction.

Self-hosted: point `NVIDIA_BASE_URL` at a NIM container's own `/v1`
endpoint (`http://<host>:8000/v1`); `NVIDIA_API_KEY` is usually not needed
in that case.

*History note: an earlier iteration used Fireworks-hosted Gemma 27B, was then
moved to NVIDIA NIM GLM-5.2, and has now returned to Fireworks (DeepSeek-V4
family) as the primary non-mock path to fit the AMD hackathon guidelines —
see Stage 1 above. The NVIDIA path in this section remains functional for
testing.*

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

## Stage 2 — vLLM on AMD MI300X / ROCm (target architecture)

### Serving

```bash
# ROCm ≥ 6.x host with one MI300X
docker run -it --device=/dev/kfd --device=/dev/dri --group-add video \
  --ipc=host --shm-size 16G -p 8001:8001 rocm/vllm:latest \
  vllm serve google/gemma-3-27b-it \
    --port 8001 --max-model-len 4096 --gpu-memory-utilization 0.92
```

```bash
# PersonaStorm .env
INFERENCE_PROVIDER=vllm
VLLM_BASE_URL=http://<mi300x-host>:8001/v1
VLLM_MODEL=google/gemma-3-27b-it
```

### Why MI300X fits this workload

- **192 GB HBM3**: Gemma-27B (bf16 ≈ 54 GB) + tens of GB of KV cache on ONE
  device — no tensor parallelism, no interconnect tax.
- **Swarm shape = continuous batching heaven**: 1,000 independent prompts of
  ~700 tokens with ~250-token structured outputs. vLLM keeps the device
  saturated; client just maintains queue depth (`react_batch` concurrency 64).
- **Prefix caching**: every request shares the storm's stimulus block; enable
  `--enable-prefix-caching` so the shared prefix is computed once.

### Batch + streaming mechanics

- Client-side: `VLLMProvider.react_batch` fires bounded-concurrency requests;
  the server's scheduler forms the real batches (better than manual batching).
- Schema validity: `guided_json` with `REACTION_JSON_SCHEMA` hard-constrains
  decoding → the schema-validity eval goes to ~100% by construction.
- Streaming to the UI is unchanged: reactions enter the same runner queue; SSE
  cadence simply reflects true inference latency instead of demo pacing.

### Benchmarks to run on hardware (acceptance gates)

1. Throughput: reactions/sec at concurrency 16/32/64/128 (target: 1,000
   reactions < 60 s sustained).
2. `guided_json` overhead vs `json_object` mode (accept < 15% throughput cost).
3. Prefix-cache hit rate with 1,000 shared-stimulus prompts.
4. LoRA adapter hot-swap latency (`--enable-lora`, see training roadmap).

## Stage 3 — Optional future LoRA persona model on the same stack

After training (training-roadmap.md), serving changes by one flag:

```bash
vllm serve google/gemma-3-27b-it --enable-lora \
  --lora-modules gemma-persona-reaction=/adapters/persona-v1
# .env: VLLM_MODEL=gemma-persona-reaction
```

Optional per-segment adapters (`persona-sea-genz-v1`, …) are selected per
request by passing the adapter name as `model` — a 5-line change isolated to
`VLLMProvider.react`. The analyst engine (NVIDIA NIM GLM-5.2) is unaffected
by this stage — it stays on `ANALYST_PROVIDER=nvidia` regardless of which
model serves the reaction swarm.

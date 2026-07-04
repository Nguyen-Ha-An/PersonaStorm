# Inference roadmap: mock → Fireworks → vLLM on AMD MI300X

Everything below is a **provider swap**, not a rewrite. The storm runner,
schemas, quality system, and UI are identical across all stages — that is the
point of `PersonaInferenceProvider` (services/inference/base.py).

## Stage 0 — Mock (shipped, default)

Deterministic trait-driven engine. Zero GPU, zero network, reproducible demos.
Also the permanent **fallback + CI provider**: tests and the eval harness run
against it forever, so pipeline regressions never need a GPU to catch.

## Stage 1 — Fireworks-hosted Gemma (structured placeholder shipped)

Two distinct roles:

1. **Analyst/aggregator agent (Gemma 27B)** — first real-LLM milestone.
   Takes the Python-computed aggregates (counts, clusters, curve) and writes
   the executive summary, segment insights, and recommendation phrasing.
   Numbers stay Python-computed (architecture honesty rule). Low volume
   (1 call/storm), high value, trivial cost.
2. **Swarm on Fireworks** — for zero-GPU environments, run the whole persona
   swarm through `FireworksProvider`. 1,000 short completions/storm; watch
   rate limits; set `STORM_MAX_CONCURRENCY` ≈ 8–16.

Activation: `.env` → `INFERENCE_PROVIDER=fireworks`, `FIREWORKS_API_KEY=…`.
Remaining work: live-key smoke test, retry/backoff on 429, usage metering
(TODOs marked in fireworks_provider.py).

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

## Stage 3 — Calibrated persona LoRA on the same stack

After training (training-roadmap.md), serving changes by one flag:

```bash
vllm serve google/gemma-3-27b-it --enable-lora \
  --lora-modules persona-v1=/adapters/persona-v1
# .env: VLLM_MODEL=persona-v1
```

Optional per-segment adapters (`persona-sea-genz-v1`, …) are selected per
request by passing the adapter name as `model` — a 5-line change isolated to
`VLLMProvider.react`.

# ⛈ PersonaStorm — the product wind tunnel

Paste a product concept, landing page, ad, or pricing table. PersonaStorm
generates **1,000 structured synthetic personas** for your target market, runs
persona-conditioned reactions through a calibrated reaction engine, streams
the swarm live (green / yellow / red), detects objection patterns, estimates
price sensitivity, and produces a report with segment insights and a
**trust/calibration panel**.

## What PersonaStorm is — and is not

**It is** a pre-research wind tunnel: a fast, cheap way to discover *likely*
objections, price resistance, weak messaging, and segment risks **before**
spending money on real surveys, focus groups, ad tests, or launches.

**It is not** a replacement for human research. Outputs are synthetic
hypotheses from a calibrated model — every report carries a disclaimer, a
trust panel that will happily tell you not to trust a run (collapse risk,
low benchmark confidence), and a final recommendation that always points to
real-human validation. The personas are not real people and never claim to be.

## Architecture (short version)

```
input → parser → persona space builder (1,000 structured personas)
      → diversity validator → reaction engine (mock | Fireworks | vLLM/MI300X)
      → batched swarm inference → SSE stream → quality checker + collapse detector
      → aggregator → report + trust panel
```

One calibrated model + 1,000 persona *profiles* — not 1,000 models. Personas
are data; the model has one trained skill: react consistently as the persona
described. Full rationale: [docs/architecture.md](docs/architecture.md).

```
personastorm/
├── apps/api        FastAPI backend (Python 3.11+, Pydantic v2, SSE)
├── apps/web        Next.js 14 frontend (TypeScript, Tailwind, Recharts)
├── packages/schemas  JSON Schema contract (mirrors Pydantic + TS types)
├── data/           sample inputs, benchmark samples, persona exports, runs
├── scripts/        seed_personas.py · run_local_demo.py · evaluate_outputs.py
└── docs/           architecture · api-contract · inference/training roadmaps
                    · evaluation framework · demo script
```

## Quickstart (local, no GPU, no keys)

Requirements: Python 3.10+ and Node 18+.

```bash
# 1) backend — http://localhost:8000  (docs at /docs)
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2) frontend — http://localhost:3000
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000, click a sample, **Run Storm**. Or use the
`Makefile`: `make api`, `make web`, `make test`, `make demo`, `make up`.

Docker instead:

```bash
docker compose up --build   # web :3000, api :8000
```

## Environment variables

Copy `.env.example` → `.env`. Everything defaults to a working mock setup.

| Variable | Default | Purpose |
|---|---|---|
| `INFERENCE_PROVIDER` | `mock` | `mock` \| `fireworks` \| `vllm` |
| `FIREWORKS_API_KEY` | — | required for `fireworks` |
| `FIREWORKS_MODEL` | `accounts/fireworks/models/gemma-3-27b-it` | hosted Gemma |
| `VLLM_BASE_URL` | `http://localhost:8001/v1` | OpenAI-compatible vLLM (AMD MI300X target) |
| `VLLM_MODEL` | `google/gemma-3-27b-it` | model or LoRA adapter name |
| `STORM_BATCH_SIZE` / `STORM_BATCH_INTERVAL_MS` | `25` / `350` | demo pacing (mock only) |
| `PERSONA_SEED` | `1337` | reproducible storms |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | frontend → API origin |

## Switching inference providers

```bash
INFERENCE_PROVIDER=mock       # deterministic local engine (default, CI, demos)
INFERENCE_PROVIDER=fireworks  # Fireworks-hosted Gemma (needs FIREWORKS_API_KEY)
INFERENCE_PROVIDER=vllm       # any OpenAI-compatible vLLM server (MI300X/ROCm target)
```

No code changes — the swap point is `apps/api/app/services/inference/`
(`PersonaInferenceProvider`). MI300X serving commands and the batching plan:
[docs/inference-roadmap.md](docs/inference-roadmap.md). LoRA calibration plan:
[docs/training-roadmap.md](docs/training-roadmap.md).

## Demo flow

1. Landing page → paste stimulus (or one-click sample) → pick market + count → **Run Storm**
2. Live grid: 1,000 cells light green/yellow/red; counters for buyers /
   unsure / rejectors, avg willingness to pay, top emerging objection,
   live collapse risk; hover any cell for that persona's quote
3. Report: executive summary, adoption bar, **kill quote**, segment heatmap,
   price-sensitivity curve, ranked objection clusters, segment insights,
   recommendations, trust/calibration panel, JSON download

2–3 minute judge script: [docs/demo-script.md](docs/demo-script.md).

## Tests & headless verification

```bash
cd apps/api && python -m pytest tests/ -q    # 18 tests: schema, diversity,
                                             # determinism, collapse detection, e2e SSE
python scripts/run_local_demo.py             # full pipeline in the terminal
python scripts/evaluate_outputs.py           # re-grade any persisted run
python scripts/seed_personas.py              # export persona populations
```

## Status: implemented vs placeholder

**Implemented and verified:** full storm pipeline end-to-end (mock provider),
6 market presets + heuristic custom segments, diversity validation, SSE
streaming with live collapse monitoring, all 8 quality metrics, objection
theme clustering, price curve, kill-quote selection, recommendations, trust
panel, all three UI pages, tests, Docker, JSON persistence.

**Structured placeholders (marked with TODOs):** `FireworksProvider` and
`VLLMProvider` (plumbing + prompts + guided-JSON schema ready; needs live
key / MI300X endpoint), analyst-agent narration, real benchmark calibration
data (shipped samples are labeled illustrative).

## License / hackathon note

Built as a hackathon project base. Sample data is illustrative; synthetic
outputs are hypotheses, not human research.

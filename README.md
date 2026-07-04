# ⛈ PersonaStorm — the product wind tunnel

Paste a product concept, landing page, ad, or pricing table. PersonaStorm
generates **1,000 structured synthetic personas** for your target market,
classifies the product into one of **10 categories**, runs each persona
through a **calibrated multi-criteria evaluation** (17 core market criteria +
age/life-stage overlay criteria), streams the swarm live (green / yellow /
red), and produces a **Market Evaluation Dashboard**: a system-computed
`market_fit_score`, top adoption blockers, criteria breakdown, age-cohort and
segment insights, price sensitivity, objection clusters, and a
**trust/calibration panel**.

## What PersonaStorm is — and is not

**It is** a pre-research wind tunnel: a fast, cheap way to discover *likely*
objections, price resistance, weak messaging, trust/proof gaps, and
segment/age risks **before** spending money on real surveys, focus groups, ad
tests, or launches. Every number in the report — the `market_fit_score`
above all — is **system-computed** from a deterministic scoring model (category
weights + age overlay + bounded modifiers + rare hard gates), never invented
or eyeballed by a language model.

**It is not** a replacement for human research. Outputs are synthetic
hypotheses from a calibrated model — every report carries a disclaimer, a
trust panel that will happily tell you not to trust a run (collapse risk, low
benchmark confidence, criteria consistency), and a `next_human_validation`
list that always points to real-human validation. No persona is a real
human, and no chain-of-thought is ever exposed — only short, honest,
user-facing rationale.

## Dashboard SaaS: auth, wallets, pricing & admin

PersonaStorm ships as a real dashboard product on top of the wind-tunnel engine:

- **Supabase Auth** — email/password login & signup. Every user gets a
  **profile**, a **credit wallet**, and **100 starter credits**.
- **Credit billing** — each run is priced by an editable pricing rule
  (`base + ceil(personas/100)·per100 + analyst_report`; a 1,000-persona run =
  65 credits) and charged **atomically** before it starts. Insufficient balance
  is blocked with a clear price preview; a run that fails is auto-refunded.
- **Protected dashboard** — `/dashboard`, `/storm/new` (live price preview),
  `/storm/[id]` (live stream), the market report, `/wallet` (balance +
  transaction history), and `/account`. Storms are **owned** — you can only see
  your own runs (admins see all).
- **Admin console** (`/admin`) — manage users, adjust wallets, change roles,
  browse all storm runs, and edit the active pricing rule.

Security model: the browser holds only the Supabase **anon** key and its access
token; the FastAPI backend verifies that token, owns every wallet mutation
through a service-role RPC, and enforces ownership/roles. RLS is enabled on all
tables and no client can write a balance. Full setup (Supabase project, backend
env, admin bootstrap): [docs/deployment.md](docs/deployment.md).

> Running the SaaS layer needs a Supabase project (`SUPABASE_*` on the backend,
> `NEXT_PUBLIC_SUPABASE_*` on the frontend). Without them the API still boots
> using an in-memory dev gateway so the engine and test suite run offline.

## How the criteria engine works

Every persona evaluates the stimulus across **17 core market criteria**
(problem awareness, need intensity, urgency, solution fit, value clarity,
differentiation, trust, proof requirement, pricing acceptance, perceived ROI,
ease of understanding, workflow fit, switching willingness, activation
likelihood, repeat usage potential, shareability, retention potential — all
`0..1`; `proof_requirement` is a **barrier**, not a benefit). Depending on the
persona's **life stage** (teen_student, student_young_adult, early_career,
parent_family, established_adult, older_adult), a handful of **age/life-stage
overlay criteria** are added (e.g. `parent_approval`, `subscription_fatigue`,
`safety_concern`).

The stimulus is classified into one of **10 product categories**
(`ai_tool`, `b2b_saas`, `consumer_app`, `ecommerce_product`,
`education_product`, `marketplace`, `social_product`, `hardware_product`,
`luxury_product`, `generic`) — auto-detected, or overridable via
`product_category` on the create request. Each category has its own **core
criteria weight preset** and an **age-overlay lambda**. The scorer
(`app/services/criteria/scoring.py::compute_market_fit`) blends the
category-weighted core score with the age-overlay score, applies small
bounded modifiers (±0.10, e.g. "trust gap with high proof demand"), and rare
multiplicative hard gates (e.g. a teen persona in a paid-education category
with near-zero parent approval), then clamps to `[0,1]` — that's the
`market_fit_score`. Full model: [docs/criteria-system.md](docs/criteria-system.md).

## Architecture (short version)

```
input → parser → category classifier → persona space builder (1,000 personas,
      life_stage + decision_context) → diversity validator → criteria preset
      selection → multi-criteria reaction engine (mock | nvidia | vLLM)
      → market-fit scoring (compute_market_fit) → SSE stream → quality /
      collapse / consistency check → segment + age-cohort + criteria
      aggregation → weakness diagnosis → analyst re-narration (mock | nvidia)
      → report + trust panel
```

Two independent engines, two separate `.env` knobs: the **reaction
provider** (`INFERENCE_PROVIDER`) generates the 1,000 persona reactions; the
**analyst model** (`ANALYST_PROVIDER`) summarizes and diagnoses that swarm
output afterward — it re-narrates text only and never invents a number.

One calibrated model + 1,000 persona *profiles* — not 1,000 models. Personas
are data; the model has one trained skill: react consistently as the persona
described across the criteria schema. Full rationale:
[docs/architecture.md](docs/architecture.md).

```
personastorm/
├── apps/api        FastAPI backend (Python 3.11+, Pydantic v2, SSE)
│   └── app/services/criteria/     registry · presets · age_overlays · scoring · classifier
│   └── app/services/aggregation/  criteria_aggregation · age_analysis · report_builder · objections · pricing
│   └── app/services/quality/      metrics · consistency_checker · collapse
│   └── app/services/     billing (pricing) · supabase_gateway (auth/wallet/admin) · storm_runner
│   └── app/routers/      storm · account · billing · admin · health
├── apps/web        Next.js 14 frontend (TypeScript, Tailwind, Recharts)
│   └── app/(app)/        protected dashboard: dashboard · storm/new · storm/[id] · wallet · account · admin
│   └── lib/              supabase client · auth context · api client
├── supabase/migrations/  SaaS schema (profiles · wallets · transactions · storm_runs · pricing_rules) + RLS
├── packages/schemas  JSON Schema contract (mirrors Pydantic + TS types)
├── data/           sample inputs, benchmark samples, persona exports, runs
├── scripts/        create_admin_user.py · seed_personas.py · run_local_demo.py · evaluate_outputs.py
└── docs/           architecture · criteria-system · api-contract · deployment ·
                    inference/training roadmaps · evaluation framework · demo script
```

## Quickstart (local, no GPU, no keys)

Requirements: **Python 3.11+** and **Node 18.17+**.

```bash
# 1) backend — http://localhost:8000  (docs at /docs)
cd apps/api
uv venv --python 3.11 .venv
uv pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000

# 2) frontend — http://localhost:3000
cd apps/web
npm install
npm run dev
```

(No `uv`? Any Python 3.11+ virtualenv works: `python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt`.)

Open http://localhost:3000, click a sample (e.g. **"AI SaaS concept"** —
PersonaPilot, an AI-SaaS product-concept sample with clear tiered pricing),
**Run Storm**. Or use the `Makefile`: `make api`, `make web`, `make test`,
`make demo`, `make up`.

Docker instead:

```bash
docker compose up --build   # web :3000, api :8000
```

## Environment variables

Copy `.env.example` → `.env`. Everything defaults to a working mock setup —
`INFERENCE_PROVIDER=mock` + `ANALYST_PROVIDER=mock` runs fully offline, no
key needed.

| Variable | Default | Purpose |
|---|---|---|
| `INFERENCE_PROVIDER` | `mock` | reaction engine for the 1,000-persona swarm: `mock` \| `nvidia` \| `vllm` |
| `ANALYST_PROVIDER` | `mock` | report/analyst model: `mock` (local deterministic builder) \| `nvidia` (GLM-5.2) |
| `NVIDIA_API_KEY` | — | required for the hosted NVIDIA endpoint (get an `nvapi-` key at [build.nvidia.com](https://build.nvidia.com)) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | NVIDIA NIM (hosted or self-hosted, OpenAI-compatible) |
| `NVIDIA_MODEL` | `z-ai/glm-5.2` | used by both the `nvidia` reaction provider and the `nvidia` analyst |
| `NVIDIA_MAX_TOKENS` / `ANALYST_MAX_TOKENS` | `2048` / `4096` | per-persona reaction budget / larger analyst-report budget |
| `VLLM_BASE_URL` | `http://localhost:8001/v1` | OpenAI-compatible vLLM (AMD MI300X target) |
| `VLLM_MODEL` | `google/gemma-3-27b-it` | model or LoRA adapter name |
| `STORM_BATCH_SIZE` / `STORM_BATCH_INTERVAL_MS` | `25` / `350` | demo pacing (mock only) |
| `PERSONA_SEED` | `1337` | reproducible storms |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | browser origins allowed to call the API — add your Vercel domain in production |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` *(dev only)* | frontend → API origin. **Local dev:** leave unset (defaults to localhost). **Production:** required — set it to your deployed FastAPI backend URL. A production build with this unset shows a clear config banner instead of failing against localhost. See [docs/deployment.md](docs/deployment.md). |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | — | backend Supabase project URL + anon key (auth/db). Unset → in-memory dev gateway. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **secret** — backend-only; bypasses RLS, owns wallet mutations. Never in frontend env. |
| `SUPABASE_JWT_SECRET` | — | **secret** — HS256 secret used to verify Supabase access tokens. |
| `API_ENV` | `dev` | set `prod` to refuse unverified tokens when the JWT secret is missing. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | frontend Supabase client (anon key only). Required for login/signup in production. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` | — | used by `scripts/create_admin_user.py` to bootstrap the first admin. |

## Switching providers

Two independent knobs — the reaction swarm and the analyst/report model:

```bash
INFERENCE_PROVIDER=mock    # deterministic local reaction engine (default, CI, demos)
INFERENCE_PROVIDER=nvidia  # NVIDIA NIM GLM-5.2 reaction swarm (needs NVIDIA_API_KEY)
INFERENCE_PROVIDER=vllm    # any OpenAI-compatible vLLM server (MI300X/ROCm target)

ANALYST_PROVIDER=mock      # local deterministic report builder's own text (default)
ANALYST_PROVIDER=nvidia    # NVIDIA NIM GLM-5.2 re-narrates the report (needs NVIDIA_API_KEY)
```

Three practical combos: **mock + mock** (fully offline demo/CI), **mock
swarm + nvidia analyst** (fast local swarm, one real-LLM call for report
polish), and **vllm swarm + nvidia analyst** (future AMD MI300X-hosted
swarm plus the GLM-5.2 analyst).

No code changes for either knob — the swap points are
`apps/api/app/services/inference/` (`PersonaInferenceProvider`) and
`apps/api/app/services/analyst/` (`AnalystProvider`). Both **fail
gracefully** when unconfigured: the reaction provider raises
`ProviderNotConfiguredError` at startup rather than mid-storm, and the
analyst factory catches that error and falls back to the mock analyst (local
report text) with a clear server log if `ANALYST_PROVIDER=nvidia` but
`NVIDIA_API_KEY` is missing or the call fails. On every path — mock or
LLM — `market_fit_score` is always recomputed server-side by
`compute_market_fit`; it is never a value a model invents, and the analyst
only ever re-narrates text fields, never numbers. MI300X serving commands
and the batching plan: [docs/inference-roadmap.md](docs/inference-roadmap.md).
LoRA calibration plan: [docs/training-roadmap.md](docs/training-roadmap.md).

### Why one calibrated model + 1,000 persona profiles, not 1,000 models

A persona is **data** (traits, budget, dealbreakers, life stage, decision
context), not model weights. The reaction model has exactly one trained
skill — "react consistently as the persona described, scored against the
criteria schema" — applied 1,000 times. That means: one model to serve (fits
on a single AMD MI300X's 192 GB HBM3 alongside the KV cache for the whole
swarm), one model to calibrate (a LoRA update fixes bias for every persona at
once, not one of a thousand fine-tunes), and persona adherence that's
actually measurable (structured traits let quality metrics check that
skeptics demand more proof and price-sensitive personas report lower
willingness to pay). See [docs/architecture.md](docs/architecture.md) for the
full argument.

## Demo flow

1. Landing page → paste stimulus (or one-click sample) → pick market + count
   → optional **product category** override → **Run Storm**
2. Live grid: 1,000 cells light green/yellow/red; live average market-fit
   score, adoption counters, avg willingness to pay, top emerging objection,
   live collapse-risk indicator; hover any cell for that persona's quote
3. Report (**Market Evaluation Dashboard**): hero market-fit score +
   confidence, top-3 adoption blockers, adoption forecast, criteria radar +
   breakdown (17 criteria, expandable), strengths, age-cohort breakdown,
   segment heatmap, trust/proof + differentiation + pricing-fit +
   workflow-fit panels, objections table, price curve, **kill quote**, next
   human validation, recommendations, trust/calibration panel, JSON download

2–3 minute judge script: [docs/demo-script.md](docs/demo-script.md).

## Tests & headless verification

```bash
cd apps/api
.venv/bin/python -m pytest -q                 # ~76 tests: criteria/scoring integrity,
                                               # schema, diversity, determinism,
                                               # consistency checker, collapse, e2e SSE
.venv/bin/python scripts/run_local_demo.py    # full pipeline in the terminal
.venv/bin/python scripts/evaluate_outputs.py  # re-grade any persisted run
.venv/bin/python scripts/seed_personas.py     # export persona populations
```

## Status: implemented vs placeholder

**Implemented and verified:** full multi-criteria storm pipeline end-to-end
(mock provider) — category classifier, 17-criterion scoring with age/life-stage
overlays and `compute_market_fit`, criteria + age-cohort + segment
aggregation, weakness/strength diagnosis, consistency checker, all quality
metrics (including `age_cohort_variance` and `criteria_consistency`), SSE
streaming with live collapse monitoring, objection theme clustering, price
curve, kill-quote selection, recommendations, `next_human_validation`, the
full Market Evaluation Dashboard UI (live grid + report), tests, Docker, JSON
persistence.

**Structured placeholders (marked with TODOs):** `VLLMProvider` (plumbing +
prompts + guided-JSON schema ready; needs a live MI300X/vLLM endpoint to test
end-to-end), a future LoRA-calibrated persona model (see
[docs/training-roadmap.md](docs/training-roadmap.md)), real benchmark
calibration data (shipped samples are labeled illustrative). `NvidiaProvider`
(reaction swarm) and `NvidiaAnalyst` (report narration) are implemented
against NVIDIA NIM GLM-5.2 and fall back gracefully without a live key, but
have not been exercised against a live key in this environment.

## License / hackathon note

Built as a hackathon project base. Sample data is illustrative; synthetic
outputs are hypotheses, not human research.

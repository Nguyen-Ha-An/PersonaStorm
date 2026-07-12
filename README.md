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
hypotheses from a calibrated model — every report carries a disclaimer and a
**trust/calibration panel** that will happily tell you not to trust a run:
collapse risk, low benchmark confidence, criteria consistency, **how much of
the persona trait model is actually evidence-backed vs. an unverified
estimate**, **which directional assumptions fired and on how many personas**,
whether **semantic grounding** was real or a formula fallback, and a
`next_human_validation` list that always points to real-human validation. No
persona is a real human, and no chain-of-thought is ever exposed — only short,
honest, user-facing rationale.

Recent work hardened this honesty end-to-end (see **Calibration & semantic
grounding** below): persona trait priors were moved out of code into
evidence-annotated data files, every directional nudge is now recorded in a
per-run assumptions ledger, an optional **semantic grounding** layer makes the
swarm react to what a product *is* (not just its copy surface), and a
known-outcome **benchmark backtest** gates regressions.

## Dashboard SaaS: auth, wallets, pricing & admin

PersonaStorm ships as a real dashboard product on top of the wind-tunnel engine:

- **Supabase Auth** — email/password login & signup, plus password reset. Every
  user gets a **profile**, a **credit wallet**, and **100 starter credits**,
  provisioned by the `handle_new_user()` Postgres trigger on signup and, as a
  belt-and-braces fallback, **lazily auto-repaired server-side**
  (`ensureUserProfileAndWallet()` / `gateway.ensureWalletWithStarter()`) on
  every authenticated request for any account whose row is missing (predates
  the trigger, or a signup where the trigger failed) — the starter grant is
  applied **exactly once** and never lowers an existing balance.
  Confirmation, magic-link, and password-reset links always return to the
  configured site (`NEXT_PUBLIC_SITE_URL`) via `/auth/callback` — set the
  Supabase **Site URL** + **Redirect URLs** to match. See
  [docs/deployment.md](docs/deployment.md#supabase-auth-site-url--redirect-configuration-required)
  for that setup and the leaked-session revocation runbook.
- **Credit billing** — each run is priced by an editable pricing rule
  (`base + ceil(personas/100)·per100 + analyst_report`; a 1,000-persona run =
  65 credits) and charged **atomically** before it starts. Insufficient balance
  is blocked with a clear price preview; a run that fails is auto-refunded.
- **Protected dashboard** — `/dashboard`, `/storm/new` (live price preview),
  `/storm/[id]` (live stream), the market report, `/wallet` (balance +
  transaction history), and `/account`. Storms are **owned** — you can only see
  your own runs (admins see all). `/dashboard` itself loads from a single
  `GET /api/dashboard` call (`user`, `wallet`, `pricing`, run `stats`,
  `recent_storms`) and renders real data or an honest loading /
  session-expired / error state — a failed auth check returns `401`, never a
  `200` with fake zeros. The topbar connectivity badge reflects the real
  server-verified session (`/api/me`), not a public health probe, so it never
  shows "Connected" while the server is rejecting the token.
- **Admin console** (`/admin`) — manage users, adjust wallets, change roles,
  browse all storm runs, and edit the active pricing rule.

Security model: the browser holds only the Supabase **anon** key and its access
token; the **Next.js API Route Handlers** (running server-side on Vercel) verify
that token, own every wallet mutation through a service-role RPC, and enforce
ownership/roles. Token verification is **algorithm-aware**
(`apps/web/lib/server/supabaseAdmin.ts`): HS256 tokens are checked locally
against `SUPABASE_JWT_SECRET`; tokens signed with asymmetric keys (ES256/RS256
— the modern default for new Supabase projects), or any token when the secret
is wrong or absent, fall back to a remote check against Supabase GoTrue
(`/auth/v1/user`) — so `SUPABASE_JWT_SECRET` is **optional**, and the shared
secret is only ever trusted for a token that itself declares HS256. RLS is
enabled on all tables and no client can write a balance. Site URL and Supabase
URL handling are centralized in `apps/web/lib/config.ts` — an isomorphic
barrel re-exporting `lib/site-url.ts` (site URL + localhost-in-production
guard) and `lib/supabase/config.ts` (`NEXT_PUBLIC_SUPABASE_URL` validation and
normalization) — as the single source of truth instead of scattered `env`
reads. Full setup (Supabase project, env vars, admin bootstrap):
[docs/deployment.md](docs/deployment.md).

> **PersonaStorm is a Vercel full-stack app** — the backend API is Next.js Route
> Handlers under `apps/web/app/api/*`, not a separate service. Production needs
> only **Vercel + Supabase**: there is no `BACKEND_API_BASE`, no
> `NEXT_PUBLIC_API_BASE`, and no FastAPI deployment. The `apps/api` FastAPI
> service stays for local/dev/reference and the offline test suite only.

> Running the SaaS layer needs a Supabase project (`SUPABASE_*` server-side on
> Vercel, `NEXT_PUBLIC_SUPABASE_*` on the frontend). Without them the server
> falls back to an in-memory dev gateway so the engine and test suite run offline.

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

## Calibration & semantic grounding

Two things a synthetic-persona tool can get quietly wrong are (1) inventing a
population from a developer's gut and (2) reacting to a pitch's *wording*
instead of the product's *substance*. Both are addressed explicitly, and the
report says out loud how much to trust the result.

- **Evidence-backed persona priors.** Trait distributions live in versioned
  data files (`data/persona_priors/*.json`), not code — each trait carries an
  evidence status (`sourced` \| `derived` \| `unverified`). Unverified priors
  have their spread automatically **widened ×1.5** (uncertainty we can't source
  becomes uncertainty the population expresses), and the report surfaces a
  **prior-coverage %**. Traits are sampled with **realistic correlations**
  (Cholesky), and a diversity **coherence** check flags incoherent tails.
- **Assumptions ledger.** Every directional "nudge" in the engine (e.g. a
  pricing-dealbreaker injection, an AI-novelty activation boost, the semantic
  blend) is registered with an evidence status and counted per run — the report
  lists exactly **which assumptions fired and on how many personas**. Objections
  are no longer gated by hand-authored dealbreaker pools; a matching dealbreaker
  only *boosts* an evidence-justified objection's weight.
- **Semantic grounding (optional).** One LLM call per storm assesses whether the
  product genuinely fits each segment across five criteria (`solution_fit`,
  `need_intensity`, `differentiation`, `workflow_fit`, `problem_awareness`) —
  with an anti-optimism prompt (forced cross-segment ranking, differentiation
  vs. *named* real alternatives, the stimulus fenced as untrusted data). Those
  scores are clamped-or-dropped at a trust boundary and blended
  `0.7·semantic + 0.3·formula` **only when a real assessment exists**; mock /
  offline mode honestly stays on formulas and labels itself `fallback_formulas`.
  The assessment is cached once per storm, so runs stay deterministic.
- **Honest counterfactual audit.** A cheap sensitivity check flips one context
  field at a time and re-runs; fields that can't move a reaction in the current
  provider are reported as `not_applicable` rather than a fake "pass".
- **Known-outcome benchmark.** `data/benchmark_outcomes/` holds disguised
  products with documented outcomes; an **offline backtest** (rank correlation +
  failure-mode + within-category-inversion gates) runs the full blend path
  against recorded fixtures — no live LLM in CI. *The shipped seed set is small
  and illustrative (a machinery tripwire, not accuracy validation); real
  validation needs a curated 15–25-product set — see
  `data/benchmark_outcomes/README.md`.*

Design + rationale:
[docs/superpowers/specs/2026-07-10-persona-calibration-semantic-grounding-design.md](docs/superpowers/specs/2026-07-10-persona-calibration-semantic-grounding-design.md).

## Architecture (short version)

```
input → parser → category classifier
   → persona space builder (1,000 personas: evidence-backed trait priors,
     correlated sampling, life_stage + decision_context) → diversity + coherence check
   → semantic assessor (one LLM call/storm: mock | nvidia) grounds 5 criteria per segment
   → multi-criteria reaction engine (mock | nvidia | vLLM), blends semantic + formula,
     records every directional nudge in the assumptions ledger
   → market-fit scoring (compute_market_fit) → SSE stream
   → quality / collapse / consistency + counterfactual bias audit
   → segment + age-cohort + criteria aggregation → weakness diagnosis
   → analyst re-narration (mock | nvidia)
   → report + trust/calibration panel (priors coverage · assumptions fired ·
     semantic source · confidence downgrades)
```

Three independent `.env` knobs, three graceful fallbacks: the **reaction
provider** (`INFERENCE_PROVIDER`) generates the 1,000 persona reactions; the
**semantic assessor** (`SEMANTIC_PROVIDER`) makes one LLM call per storm to
ground five product-fit criteria; the **analyst model** (`ANALYST_PROVIDER`)
summarizes and diagnoses the swarm output afterward. Every one of them
re-narrates or grounds only — **none ever invents a number**; `market_fit_score`
is always recomputed server-side by `compute_market_fit`.

One calibrated model + 1,000 persona *profiles* — not 1,000 models. Personas
are data; the model has one trained skill: react consistently as the persona
described across the criteria schema. Full rationale:
[docs/architecture.md](docs/architecture.md).

```
personastorm/
├── apps/web        Next.js 14 FULL-STACK app on Vercel (TypeScript, Tailwind, Recharts)
│   └── app/(app)/           protected dashboard: dashboard · storm/new · storm/[id] · wallet · account · admin
│   └── app/api/             the backend API — same-origin Route Handlers (health · me · dashboard ·
│                            wallet · billing/quote · storm/* · admin/*)
│   └── lib/server/          server-only backend: auth (session verify + lazy profile/wallet repair) ·
│                            supabaseAdmin (algorithm-aware JWT verify, GoTrue fallback) · gateway ·
│                            pricing · wallet · stormStore · stormEngine + engine/ (criteria · persona
│                            [priors · correlation · featureWiring] · providers · semantic · aggregation ·
│                            quality [+ counterfactual biasAudit] · benchmark) — the TS port of the engine
│   └── lib/                 config.ts (site URL + Supabase URL validation, single source of truth) ·
│                            supabase browser client · auth context · api client (same-origin /api/*)
├── apps/api        FastAPI backend — LOCAL/DEV/REFERENCE ONLY (not deployed in production)
│   └── app/services/…       the Python engine the TypeScript port mirrors 1:1 (calibration + semantic incl.)
├── supabase/migrations/  SaaS schema (profiles · wallets · transactions · storm_runs · pricing_rules) + RLS
├── packages/schemas  JSON Schema contract (mirrors Pydantic + TS types)
├── data/           persona_priors/ (evidence-annotated trait priors) · benchmark_outcomes/ (+ fixtures/) ·
│                    sample inputs · persona exports · runs
├── scripts/        create_admin_user.py · seed_personas.py · run_local_demo.py · evaluate_outputs.py
└── docs/           architecture · criteria-system · api-contract · deployment · demo script ·
                    inference/training roadmaps · superpowers/ (calibration + semantic specs & plans)
```

> **Deployment:** the whole app deploys to **Vercel** — frontend **and** the API
> Route Handlers (`apps/web/app/api/*`) as serverless functions. **Supabase** is
> Auth + Postgres. There is no separate backend to deploy and no
> `BACKEND_API_BASE` / `NEXT_PUBLIC_API_BASE`. The `apps/api` FastAPI service is
> kept for local development, reference, and the offline pytest suite only.
> Full picture: [docs/deployment.md](docs/deployment.md).

## Quickstart (local, no GPU, no keys)

Requirements: **Node 18.17+** (Python 3.11+ is only needed for the optional
`apps/api` reference service / test suite).

```bash
# The full app — frontend AND the API Route Handlers — http://localhost:3000
cd apps/web
npm install
npm run dev
```

With no Supabase env vars set, the server uses an in-memory dev gateway + dev
auth, so the engine, storms, and dashboard all work offline (data isn't
persisted across restarts — dev only). Set `NEXT_PUBLIC_SUPABASE_*` and
`SUPABASE_*` (see `.env.example`) to use a real Supabase project.

Open http://localhost:3000, click a sample (e.g. **"AI SaaS concept"** —
PersonaPilot, an AI-SaaS product-concept sample with clear tiered pricing),
**Run Storm**.

The original Python engine still runs as a reference / test suite:

```bash
cd apps/api
uv venv --python 3.11 .venv           # or: python3.11 -m venv .venv
uv pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000   # optional, reference only
.venv/bin/python -m pytest -q          # the calibration/scoring test suite
```

## Environment variables

Copy `.env.example` → `.env`. Everything defaults to a working mock setup —
`INFERENCE_PROVIDER=mock` + `ANALYST_PROVIDER=mock` runs fully offline, no
key needed.

| Variable | Default | Purpose |
|---|---|---|
| `INFERENCE_PROVIDER` | `mock` | reaction engine for the 1,000-persona swarm: `mock` \| `nvidia` \| `vllm` |
| `ANALYST_PROVIDER` | `mock` | report/analyst model: `mock` (local deterministic builder) \| `nvidia` (GLM-5.2) |
| `SEMANTIC_PROVIDER` | *(analyst provider)* | semantic grounding: `mock` (deterministic offline stand-in — no blend, honest formula fallback) \| `nvidia` (one real LLM call/storm grounding 5 criteria). Defaults to whatever `ANALYST_PROVIDER` is. |
| `SEMANTIC_MODEL` / `SEMANTIC_MAX_TOKENS` | *(analyst model)* / `2048` | model + token budget for the semantic assessor; model falls back to `ANALYST_MODEL` → `NVIDIA_MODEL`. |
| `PERSONA_PRIORS_DIR` | *(repo `data/persona_priors`)* | directory of evidence-annotated trait priors; unset → repo data when present, else embedded presets (labeled `unverified`). See `data/persona_priors/README.md`. |
| `NVIDIA_API_KEY` | — | required for any hosted NVIDIA path — reaction swarm, analyst, **and** semantic assessor (get an `nvapi-` key at [build.nvidia.com](https://build.nvidia.com)) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | NVIDIA NIM (hosted or self-hosted, OpenAI-compatible) |
| `NVIDIA_MODEL` | `z-ai/glm-5.2` | used by both the `nvidia` reaction provider and the `nvidia` analyst |
| `NVIDIA_MAX_TOKENS` / `ANALYST_MAX_TOKENS` | `2048` / `4096` | per-persona reaction budget / larger analyst-report budget |
| `VLLM_BASE_URL` | `http://localhost:8001/v1` | OpenAI-compatible vLLM (AMD MI300X target) |
| `VLLM_MODEL` | `google/gemma-3-27b-it` | model or LoRA adapter name |
| `STORM_BATCH_SIZE` / `STORM_BATCH_INTERVAL_MS` | `25` / `350` | demo pacing (mock only) |
| `PERSONA_SEED` | `1337` | reproducible storms |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | only used by the optional `apps/api` reference service. The Vercel app's API is same-origin, so CORS never applies to it. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | — | **server-side (Vercel)** Supabase project URL + anon key. `SUPABASE_URL` falls back to `NEXT_PUBLIC_SUPABASE_URL`. Unset → in-memory dev gateway. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **secret** — server-side only; bypasses RLS, owns wallet mutations. Never `NEXT_PUBLIC_`, never in the browser. |
| `SUPABASE_JWT_SECRET` | — | **secret, OPTIONAL** — HS256 secret to verify access tokens locally. Validation is algorithm-aware (`lib/server/supabaseAdmin.ts`): only a token that itself declares HS256 uses this secret; asymmetric (ES256/RS256) tokens — the modern Supabase default for new projects — or a missing/wrong secret fall back to a remote check against Supabase GoTrue (`/auth/v1/user`). So this var can be left unset even in production. |
| `API_ENV` | `dev` | set `prod` to refuse unverified tokens when the JWT secret is missing. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | frontend Supabase client (anon key only). Required for login/signup in production. `NEXT_PUBLIC_SUPABASE_URL` must be only `https://<ref>.supabase.co` — `lib/supabase/config.ts` validates and normalizes it at runtime, stripping (and logging) `/rest/v1`, `/auth/v1`, or `/storage/v1` if present, as defense-in-depth on top of the CI check in `deploy.yml`. |
| `NEXT_PUBLIC_SITE_URL` | — | canonical site URL used to build every Supabase Auth redirect (email confirmation, magic link, password reset), resolved by the centralized `lib/config.ts` / `lib/site-url.ts`. Prod: hardcoded `PRODUCTION_SITE_URL` = `https://personastorm.nguyenhaan.id.vn` — used even if this var is unset, and **never falls back to localhost**; `assertNoLocalhostInProduction()` throws (surfaced as the `auth_redirect_localhost` login error) if a misconfiguration would resolve a localhost redirect in prod. Dev: falls back to `http://localhost:3000` → `NEXT_PUBLIC_VERCEL_URL` → `window.location.origin`. |
| ~~`BACKEND_API_BASE`~~ / ~~`NEXT_PUBLIC_API_BASE`~~ | **removed** | No longer used. The API is same-origin Next.js Route Handlers on Vercel — there is no external backend URL. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_FULL_NAME` | — | used by `scripts/create_admin_user.py` to bootstrap the first admin. |

## Switching providers

Three independent knobs — the reaction swarm, the semantic assessor, and the
analyst/report model:

```bash
INFERENCE_PROVIDER=mock    # deterministic local reaction engine (default, CI, demos)
INFERENCE_PROVIDER=nvidia  # NVIDIA NIM GLM-5.2 reaction swarm (needs NVIDIA_API_KEY)
INFERENCE_PROVIDER=vllm    # any OpenAI-compatible vLLM server (MI300X/ROCm target)

SEMANTIC_PROVIDER=mock     # deterministic stand-in — no blend, formulas stand, honestly labeled (default)
SEMANTIC_PROVIDER=nvidia   # one real LLM call/storm grounds 5 product-fit criteria (needs NVIDIA_API_KEY)

ANALYST_PROVIDER=mock      # local deterministic report builder's own text (default)
ANALYST_PROVIDER=nvidia    # NVIDIA NIM GLM-5.2 re-narrates the report (needs NVIDIA_API_KEY)
```

Practical combos: **all mock** (fully offline demo/CI — the default; semantic
grounding is honestly disabled, criteria stay on formulas), **mock swarm +
nvidia semantic + nvidia analyst** (offline swarm, one grounding call + one
report-polish call), and **vllm swarm + nvidia semantic/analyst** (future AMD
MI300X-hosted swarm). Semantic grounding only *changes* the numbers when
`SEMANTIC_PROVIDER=nvidia` and a live key is present — in mock mode the report
labels `semantic_source: fallback_formulas` and adds a confidence downgrade, so
a demo never silently passes off ungrounded scores as grounded.

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

The TypeScript engine (production) and the Python engine (reference) are tested
independently and must both stay green:

```bash
# TypeScript engine + API + UI — from apps/web
npx vitest run       # ~184 tests: criteria/scoring, priors loader, correlation,
                     # assumptions ledger, semantic sanitize/blend, benchmark
                     # metrics + offline backtest gate, report/trust-panel
npx tsc --noEmit     # typecheck

# Python reference engine — from apps/api  (Windows: .venv\Scripts\python)
.venv/bin/python -m pytest -q                 # ~202 tests: the same coverage mirrored
.venv/bin/python scripts/run_local_demo.py    # full pipeline in the terminal
.venv/bin/python scripts/evaluate_outputs.py  # re-grade any persisted run
.venv/bin/python scripts/seed_personas.py     # export persona populations
```

The benchmark backtest runs offline against recorded fixtures (no live LLM in
CI). To (re)record fixtures from whatever assessor is configured:
`npm run record:fixtures` (from `apps/web`).

## Status: implemented vs placeholder

**Implemented and verified (mock provider, end-to-end, both engines green):**
full multi-criteria storm pipeline — category classifier, 17-criterion scoring
with age/life-stage overlays and `compute_market_fit`, criteria + age-cohort +
segment aggregation, weakness/strength diagnosis, consistency checker, all
quality metrics (including `age_cohort_variance` and `criteria_consistency`),
SSE streaming with live collapse monitoring, objection theme clustering, price
curve, kill-quote selection, recommendations, `next_human_validation`, the full
Market Evaluation Dashboard UI (live grid + report), tests, Docker, JSON
persistence. **Plus the calibration layer:** evidence-annotated trait priors +
loader (unverified-std widening, coverage), correlated Cholesky sampling +
coherence check, the assumptions registry/ledger + de-nudged provider,
evidence-weighted objections, the honest counterfactual bias audit, and the
`calibration_evidence` block on the report/trust panel. **Plus semantic
grounding:** the sanitizer trust boundary, the anti-optimism assessor (mock +
LLM, never-throw), the source-gated `0.7/0.3` blend, and the offline
benchmark backtest — all surfaced as `semantic_source` + confidence downgrades.

**Structured placeholders / not yet exercised:** `VLLMProvider` (plumbing +
prompts + guided-JSON schema ready; needs a live MI300X/vLLM endpoint). The
hosted LLM paths — `NvidiaProvider` (reaction swarm), `NvidiaAnalyst` (report
narration), and the `SemanticAssessor` — are implemented against NVIDIA NIM
GLM-5.2 and **fall back gracefully without a live key, but have not been run
against a live `NVIDIA_API_KEY` in this environment**, so semantic grounding's
real accuracy gain is unmeasured (mock mode honestly stays on formulas). The
benchmark ships an **illustrative 5-entry seed set** (a machinery tripwire, not
accuracy validation) — real validation needs a curated 15–25-product set and
re-derived thresholds. A future LoRA-calibrated persona model is roadmapped
(see [docs/training-roadmap.md](docs/training-roadmap.md)).

## License / hackathon note

Built as a hackathon project base. Sample data is illustrative; synthetic
outputs are hypotheses, not human research.

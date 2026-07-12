# PersonaStorm — Work Handoff (context for continuing the project)

> Paste this whole file to an assistant to continue the work. It is self-contained.

## 1. What PersonaStorm is

A "product wind tunnel." A user pastes a product concept (landing page, ad, pricing
table). The app generates **1,000 structured synthetic personas** for a target market,
classifies the product into one of 10 categories, runs each persona through a
**calibrated multi-criteria evaluation** (17 core market criteria + age/life-stage
overlays), streams the swarm live (green/yellow/red grid via SSE), and produces a
**Market Evaluation Dashboard**: a system-computed `market_fit_score`, adoption blockers,
criteria breakdown, segment/age insights, price sensitivity, objection clusters, and a
**trust/calibration panel**.

**Core philosophy (do not break this):** every NUMBER is computed server-side by a
deterministic scoring model (`compute_market_fit`). An LLM is only ever allowed to
generate persona reaction TEXT or re-narrate prose — **never a number, score, status, or
count**. The product is deliberately honest: it will tell the user not to trust a run
(collapse risk, low benchmark confidence, unverified priors).

## 2. Repo, stack, and where things live

- **Repo:** https://github.com/Nguyen-Ha-An/PersonaStorm  (local: `D:\PersonaStorm`, Windows)
- **Production app:** `apps/web` — Next.js 14 full-stack (TypeScript, Tailwind, Recharts).
  The backend IS the Next.js Route Handlers under `apps/web/app/api/*`. Deploys to
  **Vercel + Supabase**. There is NO separate backend service in production.
- **Reference engine / test oracle:** `apps/api` — FastAPI (Python 3.11+). Mirrors the TS
  engine exactly; used for local dev, reference, and the pytest suite. NOT deployed.
- **The engine (mirrored in both):**
  - TS: `apps/web/lib/server/engine/` — `stimulusParser`, `criteria/` (classifier, presets,
    registry, scoring, ageOverlays), `persona/` (generator, diversity, presets, priorsLoader,
    correlation, featureWiring), `providers/` (mockProvider, nvidiaProvider, fireworks,
    chatClient), `semantic/` (types, prompt, assessor), `quality/` (metrics, collapse,
    consistency, biasAudit), `aggregation/` (reportBuilder, etc.), `analyst/`, `benchmark.ts`.
  - Python: `apps/api/app/services/` with the same structure.
- **Shared data:** `data/persona_priors/*.json` (trait priors), `data/benchmark_outcomes/*`
  (benchmark set + `fixtures/`). Both engines read these same files.
- **Docs:** `docs/architecture.md`, `docs/criteria-system.md`, `docs/deployment.md`,
  `docs/demo-script.md`, and design specs + plans under `docs/superpowers/`.
- **SaaS layer:** Supabase auth (email/pw), credit wallets, per-run billing, admin console.
  `supabase/migrations/`. Browser holds only the anon key; all wallet mutations go through
  server-side service-role RPCs.

## 3. Current git state (as of handoff)

- Branch `main` == `origin/main` == commit `f5e8f0a`. Everything below is MERGED and PUSHED.
- **Two large features were just completed, reviewed, and merged:**
  - **Phase A — calibration & feature integrity** (commit range up to `08ca4d2`): moved
    persona trait priors out of code into `data/persona_priors/*.json` with per-trait
    evidence status (sourced/derived/unverified); unverified priors get their std widened
    ×1.5 (cap 0.20). Added correlated trait sampling (Cholesky) + a diversity coherence
    check. Added an **assumptions registry + per-run ledger** recording every directional
    "nudge"; de-nudged the mock provider; added per-persona coefficient jitter. Decoupled
    objections from dealbreaker gating (evidence-weighted, dealbreaker only boosts ×1.5).
    Rate-bounded pricing-dealbreaker injection to 40%/sub-segment. Wired the previously-dead
    counterfactual bias audit into runStorm with honest `not_applicable` reporting for
    mock-inert fields. Added a `calibration_evidence` block to the report + trust panel.
  - **Phase B — semantic grounding & benchmark** (up to `f5e8f0a`): a `SemanticAssessor`
    (one LLM call per storm) scores 5 "grounded" criteria (solution_fit, need_intensity,
    differentiation, workflow_fit, problem_awareness) per segment; the mock provider blends
    `0.7*semantic + 0.3*formula` for those 5 — **but only when the assessment came from a
    REAL source** (`source !== "fallback_formulas"`), so mock/offline mode honestly stays on
    formulas. Anti-optimism prompt (forced cross-segment ranking, differentiation vs named
    alternatives, fenced untrusted stimulus). Clamp-or-drop sanitizer as the LLM trust
    boundary; the assessor never throws. Added a known-outcome **benchmark backtest** (spearman
    rank + failure-mode + within-category-inversion metrics) that runs OFFLINE against
    recorded fixtures — NO live LLM in CI. `semantic_source` + confidence downgrades surfaced.
- **Tests currently green:** `apps/web` 184 vitest + `tsc --noEmit` clean; `apps/api` 202 pytest.
- **Production build:** `apps/web` `npm run build` succeeds (all routes compile).

## 4. IMPORTANT: uncommitted files that are NOT part of the merged work

A SEPARATE work session is fixing a tokenizer bug. These files are uncommitted in the
working tree and belong to THAT effort — do NOT sweep them into unrelated commits:
`apps/api/app/utils/text.py`, `apps/web/lib/server/engine/text.ts`,
`apps/web/lib/server/engine/providers/mockProvider.calibration.test.ts`,
`apps/api/tests/test_text.py`, `apps/web/lib/server/engine/text.test.ts`.
The bug: the shared tokenizer regex collapses hyphenated words, so `"AI-powered"` is one
token that never matches the AI keyword set — meaning a pitch saying "AI-powered" is NOT
detected as an AI product (breaks category classification + some scoring). If that session
hasn't finished, this fix still needs landing.

## 5. Invariants you MUST preserve when changing code

1. **Determinism:** same seed (+ same cached/injected semantic matrix) → identical personas,
   reactions, report. No `Math.random()` / unseeded `random` in engine paths. The semantic
   call is made ONCE per storm and cached.
2. **`market_fit_score` only from `computeMarketFit` / `compute_market_fit`.** No LLM value is
   ever a score/status/count. Every LLM number is schema-validated and clamped-or-dropped by
   the sanitizer; the assessor never throws to the caller.
3. **TS (`apps/web`) is production; Python (`apps/api`) is the mirror.** Any engine change must
   be made in BOTH and kept behaviorally identical (same 5 grounded criteria, same 0.7 blend
   weight, same clamp rules, same benchmark data files). One documented exception: the
   counterfactual bias audit exists only in the TS engine.
4. **Nothing silent:** every degradation is a visible label (`semantic_source`,
   `priors_source`, `confidence_downgrades`, `assumptions_fired`). Report/schema changes are
   additive only; legacy runs stay valid.
5. **Benchmark integrity:** the shipped 5 seed entries are ILLUSTRATIVE disguised composites
   (`illustrative: true`, no real brand names, no fabricated private figures). The backtest is
   a machinery tripwire, NOT accuracy validation. Thresholds are measured, not invented.

## 6. How to run / test

```
# Web app (the product) — from apps/web
npm install
npm run dev            # http://localhost:3000  (works fully offline, mock mode, no keys)
npm run build          # production build check
npx vitest run         # ~184 tests
npx tsc --noEmit       # typecheck

# Python reference engine — from apps/api  (Windows venv already exists at .venv)
.venv\Scripts\python -m pytest -q     # ~202 tests
```
With no Supabase env vars, the server uses an in-memory dev gateway + dev auth, so the
engine, storms, and dashboard all work offline (data not persisted across restarts).
Providers: `INFERENCE_PROVIDER` (mock|nvidia|vllm), `ANALYST_PROVIDER` (mock|nvidia),
`SEMANTIC_PROVIDER` (mock|nvidia, defaults to the analyst provider). `mock` everywhere = fully
offline. `.env.example` documents all vars.

## 7. Known limitations / what is NOT done

- **Live-LLM paths are implemented but UNTESTED against a real key.** `NvidiaProvider`,
  `NvidiaAnalyst`, the Fireworks worker swarm, and the `SemanticAssessor` all fall back
  gracefully without a key, but have never been exercised against a live `NVIDIA_API_KEY` /
  `FIREWORKS_API_KEY` in this environment. Mock mode honestly labels itself "formulas only."
- **The benchmark validates nothing yet** — only 5 illustrative seed entries (1 within-category
  hit/flop pair). Real validation needs 15–25 curated real products with documented outcomes
  and ≥3 within-category pairs, then re-derived thresholds. Curation guide:
  `data/benchmark_outcomes/README.md`. This is human/manual data work.
- **The SaaS billing/auth path was not smoke-tested against a real Supabase project** in the
  latest work (it builds and has tests, but verify end-to-end before charging credits).
- **The `vLLMProvider`** (AMD MI300X target) is structured plumbing awaiting a live endpoint.
- **Future phases** (documented in `docs/superpowers/specs/2026-07-10-persona-calibration-semantic-grounding-design.md`
  §14): retrieval grounding of category facts (real competitor pricing), LLM-swarm sycophancy
  debiasing, a human micro-calibration survey, and MiroFish-style persona generation from seed
  data.

## 8. Recommended next steps (in priority order)

1. **Land the tokenizer fix** (§4) — it's a real correctness bug affecting AI-category detection.
2. **Wire + smoke-test a live semantic key** (`SEMANTIC_PROVIDER=nvidia` + `NVIDIA_API_KEY`),
   then re-record benchmark fixtures from the live assessor (`npm run record:fixtures` in
   apps/web) and re-derive the backtest thresholds. This is what turns "plausible demo" into
   "actually accurate."
3. **Curate the real benchmark set** (15–25 disguised real products) per
   `data/benchmark_outcomes/README.md`, then re-measure thresholds in both engines.
4. **Smoke-test the Supabase auth + credit-billing flow** against a real project before launch.
5. **Security pass** on `apps/web/app/api/*` (auth verification, wallet mutations, rate limits).

## 9. Immediate context if this is for a HACKATHON

Ship it in **mock mode** as the demo — it's deterministic, offline, no keys, nothing to fail
on stage, and it looks finished (live 1,000-cell grid + full report dashboard). The honesty
(trust panel that tells judges not to trust a bad run) is a differentiator. Before demoing:
(a) avoid the `"AI-powered"` tokenizer bug — use a built-in sample or write "an AI assistant"
with a space; (b) do one live dry-run of sample → Run Storm → report; (c) keep the live-LLM
story to one sentence, don't demo a live key on stage. See `docs/demo-script.md` for the
2–3 minute judge script.

## 10. Working conventions used in this project

- Conventional commits (feat/fix/docs/test/refactor/chore), no attribution footer.
- Plans/specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/` (dated).
- The engine is developed TS-first, then the Python mirror in the same change.
- TDD: write the failing test, then implement. Both engines must stay green.

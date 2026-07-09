---
title: PersonaStorm - Demo/Portfolio CX Improvements
date: 2026-07-07
status: draft
approach: "B - demo-only, skip payments"
---

# PersonaStorm - Demo/Portfolio CX Improvements

This spec optimizes the ~3-minute evaluator golden path — landing → a public no-signup live simulation → a verdict-first report — layering frictionless entry, report clarity, and guided polish additively onto the existing PersonaStorm app, without changing any engine number, the payment flow, or the Python backend.

## 1. Summary & Goals

**Summary.** PersonaStorm is a synthetic market-research SaaS — a "pre-research wind tunnel." A user pastes a stimulus (product concept, landing-page copy, ad creative, or pricing table); a self-contained TypeScript engine (`apps/web/lib/server/engine`) generates up to 1,200 AI personas who react, and returns a market-fit report — objections, price resistance, weak messaging, trust gaps — in roughly 60 seconds. This project is a CX improvement pass delivered entirely in the `apps/web` UX layer. It is **additive**: it never removes analytical depth, never changes the engine's numeric outputs (scoring, inference, quality), and never touches the parallel Python reference backend (`apps/api`).

**Problem.** The current experience misfires for its actual audience. This is a **pre-launch portfolio / demo piece** — there are no real users; the real "customer" is an evaluator or recruiter who spends **2–5 minutes**. Two things work against that person:

- **High-friction entry.** The only way to see the product work is to sign up, land on the dashboard, author a run on `storm/new`, and spend credits — a wall between the evaluator and the "wow" moment.
- **A dense report.** `storm/[id]/report` opens straight into six tiers of diagnostics with no verdict on top. The evaluator has to read and synthesize before knowing whether the concept passed, and what to do about it — work they will not do in a 2–5 minute window.

**Chosen approach — B: Demo-only, skip payments.** We optimize three goals at demo-credible depth: (1) frictionless **first-run activation**, (2) **report clarity & action**, and (3) a **guided product tour + maximum polish**. Delivered as three additive UX workstreams: a public, no-signup **"Watch a 60-second live simulation"** path that replays one pre-baked run (the PersonaPilot AI-SaaS sample) read-only; a **verdict-first report** that leads with a derived verdict, a 4-tile at-a-glance strip, and up to 3 evidence-backed actions above the preserved six-tier "Full diagnostics" section; and a **driver.js guided tour** plus a polish pass (always-visible grid legend, a persistent "how it works" panel, graceful states, tasteful reduced-motion-aware micro-interactions).

**Hard constraints.** Do **not** build or optimize any pricing / purchase / buy-credits surface (credits remain admin-granted; seeded demo credits are an activation aid, not a payments feature). Do **not** change the engine's numeric outputs — credibility depends on not fudging numbers; all verdict and action content is **derived from existing report fields, never re-inferred**, with no new LLM calls. Do **not** touch `apps/api`.

**Success criteria** (checkable, phrased around the evaluator win condition — *instantly understand it → feel the wow → conclude the builder ships thoughtful, complete products*):

1. **Zero-friction wow.** An anonymous visitor can go landing → "Watch live" → streaming persona grid → report **without signing up or spending credits**, driven by the DB-enforced `is_demo = true` read-only path.
2. **Verdict in one glance.** The report page renders a `VerdictBanner` (strong / conditional / weak, with a caveat pill when confidence is low or collapse risk is non-low), an `AtAGlance` KPI strip, and up to 3 `TopActions` **above** the "Full diagnostics" divider — so the evaluator knows the answer and the top fixes before scrolling.
3. **Depth preserved, not deleted.** All six existing report tiers and every current panel remain reachable, rendered **expanded** below the "Full diagnostics" divider; only the tier-3 raw `CriteriaBreakdown` table is collapsed by default, and it auto-expands when a Top-3 action or tour step navigates to it.
4. **Self-explaining, guided, polished.** A first-visit `driver.js` tour (≤3 steps live, ≤4 steps report), an always-visible `GridLegend`, and a persistent `HowItWorks` panel let a cold evaluator understand the grid, the system-computed score, and the collapse-risk meter **without external help** — all skippable, re-launchable, and `prefers-reduced-motion`-aware. User-facing copy asserts no hardcoded persona or panel counts.
5. **Credible and intact.** Engine numeric outputs are unchanged and existing Python tests stay green; new pure-derivation logic (`deriveVerdict`, `selectTopActions`) ships at **100% branch coverage** with a public-demo Playwright smoke test — additive work that fudges no numbers.

## 2. Context: how PersonaStorm works today

The production path is a Next.js App Router app (`apps/web`) on Vercel plus Supabase, with the self-contained TypeScript engine in `apps/web/lib/server/engine`. A parallel Python FastAPI reference backend (`apps/api`) also exists but is **not touched by this work**.

### 2.1 End-to-end workflow

**Auth.** Supabase handles authentication.

**Dashboard.** Credits/wallet cards, a "what a run costs" explainer, recent storms, and an empty state.

**Create (`storm/new`).** The user fills in a name, stimulus type, and stimulus textarea (min 20 chars), picks a target market, lets product category auto-detect, and chooses a persona count (100 / 250 / 500 / 1000 / 1200). A live price preview updates on a 250 ms debounce, and a **"Run wind tunnel — N credits"** button is gated on both validity and sufficient credits.

**Server: `createAndRunStorm`** (synchronous, `maxDuration` 60), in `lib/server/stormStore.ts`:
1. Authenticate.
2. **Concurrency guard** — one running storm per user, stale after 3 min (anti cost-amplification).
3. Price quote.
4. **Atomic wallet debit** via the Supabase row-locking RPC `adjust_wallet_balance`, which rejects overdraw → `InsufficientCreditsError`. **This IS the balance check.**
5. Record the row as `running`.
6. Run `runStorm` synchronously.
7. On **success** → mark `complete`, store report JSON + reaction events. On **failure** → **full refund**, mark `failed` with a sanitized error.

**Engine pipeline (`runStorm`).** Parse stimulus (`stimulusParser`) → classify category (1 of 10 + risk flags) → select criteria preset (category → 17 weighted criteria + age overlay) → generate seeded personas (`life_stage` + `decision_context`) → diversity validation → batched swarm inference via provider (mock / nvidia / vllm) → **`market_fit_score` is SYSTEM-COMPUTED (the LLM never invents numbers)** → quality checks (metrics, consistency, collapse detection) → aggregation (per-criterion averages, age cohorts, top-3 strengths/weaknesses) → report builder (objections, price curve, recommendations) → analyst narration layered over already-final numbers (graceful fallback to deterministic). The pipeline emits SSE events (`init` / `reaction` / `progress` / `complete` / `error`), which are **persisted so a completed run can REPLAY as a live-looking storm**.

**Live view (`storm/[id]`).** An SSE stream drives a 1,000-cell grid — each cell is one persona (green = intent, yellow = needs proof, red = rejected) — alongside a live market-fit score, a collapse-risk meter, and a rolling 7-item quote feed. The client batches renders every 120 ms (~8 fps).

**Report (`storm/[id]/report`).** Six tiers of diagnostics, a JSON download, and a **"+ New simulation"** entry point.

### 2.2 Who the customer is for THIS project

This is a **pre-launch portfolio / demo piece**. There are no real users yet. The real "customer" is an **evaluator / recruiter** who spends roughly **2–5 minutes** with the product. The win condition: they instantly understand it → feel the wow → conclude that the builder ships thoughtful, complete products. That evaluator persona — not a paying end user — is who every decision in this spec optimizes for.

## 3. Scope & non-goals

This project is a **UX-layer improvement pass on `apps/web` only**. Every change is **additive**: it layers frictionless entry, a verdict-first report, and a guided tour on top of the existing product **without deleting analytical depth**. The chosen approach is **"B: Demo-only, skip payments"**, optimized for a recruiter/evaluator spending 2–5 minutes.

### 3.1 In scope

Three workstreams, all in `apps/web`.

**Workstream 1 — Frictionless entry (activation).**
- A public, **no-signup** "Watch a 60-second live simulation" path that reuses the engine's existing **REPLAY** capability.
- One pre-baked demo run (the **PersonaPilot AI-SaaS** sample, `persona_count = 1000`) via new seed script `scripts/seed_demo_storm.ts`, run in **MOCK mode with a FIXED RNG SEED**, deterministic and reproducible, written through the new code so it carries `verdict`/`top_actions` natively.
- Supabase migration adding **`is_demo boolean NOT NULL DEFAULT false`** to the storm-runs table **and** the stream/replay-events table, plus an **RLS policy allowing anon `SELECT` only on `is_demo = true` rows on both tables** (read-only, DB-enforced).
- Retrieval bypass in `getStormMeta`/`getStreamData`/`getStormReport` when `row.is_demo`, **reusing the existing routes** `/api/storm/[id]/stream` and `/api/storm/[id]/report`. The stream route falls back to the anon Supabase client when there is no session; landing CTA → `/demo` → the fixed demo storm.
- Authed polish: **seed demo credits on signup** (constant `DEMO_SIGNUP_CREDITS`) so a first real run never hits the credit wall (an activation nudge, **not** a payments feature), and a **"Not sure what to write?"** stimulus helper on `storm/new` that runs the existing `stimulusParser` (server-side, via a new `app/api/stimulus/inspect` route) to surface detected signals **before** a run is spent.

**Workstream 2 — Verdict-first report (clarity & action).** Everything **derived, never re-inferred; NO new LLM calls.**
- New pure isomorphic module `lib/server/engine/verdict.ts` exporting `deriveVerdict(report)` and `selectTopActions(report)`, called in `report.ts` at build time so `verdict` and `top_actions` are **persisted and included in the JSON export**. Added to `report.schema.json`, `engine/types.ts`, and `lib/types.ts`, with a **client fallback** that recomputes via the same isomorphic module for older runs missing the field. Reuses `GREEN_THRESHOLD = 0.62` / `RED_THRESHOLD = 0.38`; both functions are **total** (default every field, never throw).
- New components `components/report/{VerdictBanner,TopActions,AtAGlance}.tsx`. `report/page.tsx` renders **Verdict → AtAGlance → TopActions** on top, then wraps the existing **6 tiers** in a `#full-diagnostics` section under a **"Full diagnostics"** divider — **expanded, not collapsed** (only the tier-3 `CriteriaBreakdown` raw table stays collapsed by default, auto-expanding on anchor navigation). Panels gain unique `id` anchors so `TopActions` scroll-links resolve.

**Workstream 3 — Guided tour + polish.**
- A **driver.js** tour (declared as data, anchored via `data-tour="..."` attributes, SSR-safe, `prefers-reduced-motion` aware, first-visit gated on `ps_tour_live_seen` / `ps_tour_report_seen`, always skippable, re-launchable via a **"?" button in `Topbar.tsx`**): 3 steps on the live page, 4 on the report, capped ~4/page.
- Polish: always-visible `components/storm/GridLegend.tsx`; a dismissible `components/HowItWorks.tsx` elevating the existing `disclaimer` field; "what is this?" copy; graceful loading/error/reconnect states and skeletons; reduced-motion-aware micro-interactions; a first-run welcome toast tied to seeding; **one visual language** reusing `components/ui/*` + Tailwind tokens with a11y baked in.
- New files `components/Tour.tsx` (+ `lib/tour/steps.ts`), `components/HowItWorks.tsx`, `components/storm/GridLegend.tsx`; edits for `data-tour` attrs, the `Topbar.tsx` "?" button, and copy across landing/dashboard/new/report. Dependency: add **`driver.js`** to `apps/web/package.json`.

**Testing (in scope, additive).** Add **Vitest** to `apps/web` (minimal config) with unit tests `verdict.test.ts` and `topActions.test.ts` (**100% branch coverage** on pure derivation logic), RTL component tests for `VerdictBanner`/`TopActions`/`AtAGlance`, the pre-baked demo report JSON reused as canonical fixture, and one Playwright smoke test for the public demo path. Existing `apps/api` pytest suite stays green.

### 3.2 Non-goals (hard guardrails)

- **No pricing / purchase / buy-credits surface.** Do **not** build or optimize any checkout, plan-selection, "buy credits", or self-serve top-up flow. Credits remain **admin-granted**; the seeded demo/signup credits are an activation mechanism, explicitly **not** a payments feature.
- **No change to the engine's numeric outputs.** Scoring, inference, quality metrics, `market_fit_score`, thresholds, aggregation, and `statusFor`'s green/yellow/red classification — **unchanged**. `verdict`/`top_actions` are derivations over already-final fields with **no new LLM calls**.
- **No changes to `apps/api` (Python).** The FastAPI reference backend and its pytest suite are **not** modified.
- **No money-flow changes.** The concurrency guard, atomic wallet debit (`adjust_wallet_balance`), overdraw rejection (`InsufficientCreditsError`), and full-refund-on-failure path are **left intact**.
- **Not a full production funnel.** No growth funnel, email/lifecycle, analytics instrumentation, team/billing management, or scale hardening beyond what the 2–5-minute evaluator path requires.
- **No deletion of existing depth.** All current report tiers and diagnostics panels remain reachable and expanded under **"Full diagnostics"**; new surfaces sit **on top of**, never in place of, the existing experience.

## 4. Workstream 1 - Frictionless entry (activation)

This workstream removes every barrier between an evaluator landing on the app and feeling the "wow". All changes are additive and live in the UX/data-access layer of `apps/web`; the engine's numeric outputs are untouched, and `apps/api` (Python) is not modified. The centerpiece is a public, no-signup **"Watch a 60-second live simulation"** path that reuses the engine's existing REPLAY capability against one pre-baked, deterministic run.

### 4.1 Goals

1. **First-run activation** — an anonymous evaluator can watch a full live storm and read its report in under a minute, with no account, no credits, and no payment surface.
2. **Polished authed first run** — a real signup never hits the credit wall on its first storm.
3. **Pre-spend confidence** — the Create page tells the user what their draft stimulus actually contains before they spend a run.

### 4.2 The pre-baked demo run (fixed-seed, deterministic)

We do not build a second "demo engine". We run the real engine once, offline, and persist the result as a normal completed run flagged `is_demo = true`, then let the existing REPLAY machinery stream it back as a live-looking storm.

**Demo id single source of truth.** A new shared module `lib/server/demo.ts` exports the constant **`DEMO_STORM_ID = "demo-personapilot"`** (a plain string, safe to import from client or server code). Both `scripts/seed_demo_storm.ts` and `app/demo/route.ts` import this constant, so the seed target and the redirect target can never diverge.

**Seed script — `scripts/seed_demo_storm.ts`** (mirrors the shape and intent of `scripts/seed_personas.py`):

- Loads the **PersonaPilot AI-SaaS** stimulus from `data/sample_inputs/*` as the fixed input.
- Invokes the engine pipeline (`lib/server/engine`, entry `runStorm`) in **MOCK provider mode** with a **FIXED RNG SEED** and **`persona_count = 1000`** (so the replayed grid fills the documented 1000-cell live view). Because persona generation is already seeded (`life_stage + decision_context`) and `market_fit_score` is SYSTEM-COMPUTED, a fixed seed + mock provider makes the entire run **deterministic and reproducible**: same personas, same per-criterion averages, same report, same event stream on every execution.
- Writes the run row (with `storm_id = DEMO_STORM_ID`, `is_demo = true`), the `report.schema.json` report JSON, and the persisted **`init` / `reaction` / `progress` / `complete`** stream events into the store — exactly as a normal `createAndRunStorm` success would — so the demo storm REPLAYS through the same SSE path as any real completed run. The event rows also carry `is_demo = true` so RLS resolves them for anonymous readers.
- Because it is built with the **new code**, the seeded report carries `verdict` and `top_actions` natively (Workstream 2), so the demo exercises the verdict-first report end-to-end.

**Idempotency & deploy wiring:** the script is **idempotent** — re-running **upserts the same `DEMO_STORM_ID` row** rather than creating duplicates — and is wired into the deploy step so the demo fixture always exists in a fresh environment. The same pre-baked report JSON is reused downstream as the canonical Vitest fixture (§8.4), so the seed output and the components are validated against one artifact.

**Failure fallback:** the "fixture missing" condition is defined precisely as **`getStormMeta(DEMO_STORM_ID)` returning `null`**. When it does, `/demo` and the landing CTA degrade to **"Demo unavailable - start your own"** rather than surfacing a raw 404.

### 4.3 Data model & Supabase migration

New migration under `supabase/migrations/*`:

- Add column **`is_demo boolean NOT NULL DEFAULT false`** to **both** the storm-runs table **and** the stream/replay-events table.
- Add an **RLS policy allowing the `anon` role to `SELECT` only rows where `is_demo = true`** on **both** tables — read-only and **DB-enforced**. Anonymous replay reads the event rows directly, so the events table needs its own anon policy; event rows carry `is_demo` (or join to a permitted `is_demo = true` run) so the policy resolves them. The anonymous role can never read a real user's run or its events; the policy is the security boundary, not application code alone.
- Existing ownership rules are unchanged: for non-demo rows, `ownedStormRow` in `lib/server/stormStore.ts` still enforces owner-or-admin, and non-owners/non-admins continue to get **404** so real storm ids never leak.

### 4.4 Retrieval bypass (reused routes, DRY)

Rather than add parallel "public" endpoints, the existing retrieval functions gain a single demo bypass, and the existing routes are reused **as-is**:

- **`getStormMeta` / `getStreamData` / `getStormReport`** (in `lib/server/stormStore.ts`) return the row to **any caller** when `row.is_demo` is true, bypassing the ownership check. For all non-demo rows, behavior is identical to today (owner/admin only, else 404).
- The routes **`/api/storm/[id]/stream`** and **`/api/storm/[id]/report`** are **reused, not duplicated** (DRY). The **report route needs no structural change** — anonymous access to the demo report flows entirely through the `getStormReport` `is_demo` bypass plus RLS. The **stream route requires only a small edit**: use the anon Supabase client when there is no session (§4.5).

### 4.5 Anonymous streaming (anon client, RLS-gated)

`lib/useStormStream.ts` normally works around the fact that `EventSource` cannot set headers by fetching the Supabase access token and passing it as `?access_token=`. For the demo we resolve the "read the row to know if it's a demo, but anon can't read non-demo rows" chicken-and-egg by leaning on RLS rather than app branching:

- **Exact sequence & client.** With **no session**, the stream route uses the **anon Supabase client** to read the row. Because RLS restricts the anon role to `is_demo = true` rows, a returned row **is by definition the demo** and is streamed with no token required. An **empty result → 404** (never leaks a non-demo id). Authenticated users still pass their access token and read their own runs through the owner-scoped client exactly as today.
- The client still handles `init / reaction / progress / complete / error` and keeps the **120ms flush timer**. **Replay reconnection re-cursors** the persisted events (the demo is a completed run being replayed), so a dropped connection resumes from the last cursor rather than failing. The existing "3 failed connects before init → connectionError" guard is unchanged and, per Workstream 3 polish, reads as "Reconnecting..." rather than a hard fail.

### 4.6 `/demo` entry point and landing CTA

- The landing page (`apps/web/app/page.tsx`) gains a primary CTA: **"Watch a 60-second live simulation"**.
- CTA → **`/demo`** (`app/demo/route.ts`), a thin route that **redirects to `/storm/${DEMO_STORM_ID}`**, which then streams via the reused stream route and lands on `/storm/${DEMO_STORM_ID}/report`.
- Anonymous visitors thus flow: **landing → /demo → live grid streams → report with verdict**, with no signup. If `getStormMeta(DEMO_STORM_ID)` returns `null`, `/demo` and the CTA fall back to "Demo unavailable - start your own" (§4.2).

### 4.7 Authed first-run: demo-credit seeding (activation, NOT payments)

To keep the first *real* run friction-free without touching any purchase surface:

- **On signup, seed `DEMO_SIGNUP_CREDITS`** into the new user's wallet so their first `createAndRunStorm` never hits the credit wall. `DEMO_SIGNUP_CREDITS` is a single named config constant sized to **at least 2× the credit cost of a 1200-persona run** (the maximum), so a first run of *any* persona-count selection clears the wall with margin. The exact value is a tunable owned by the app operator. This is an **activation mechanism, not a payments feature** — it does not create, expose, or optimize any buy-credits / pricing surface. Credits remain admin-granted; this is a one-time onboarding grant.
- **Trigger & once-per-account guarantee.** Seeding runs from a **post-signup server hook (Supabase auth trigger / server-side handler)** that calls the **existing atomic wallet path** (`adjust_wallet_balance`), **guarded to run exactly once per user id** (idempotent on the user). Wallet accounting therefore stays consistent with the untouched concurrency-guard / atomic-debit / full-refund money flow.
- This pairs with the Workstream 3 first-run welcome toast, which reads the **actual granted wallet balance** (never a hardcoded number) and is gated once by `ps_welcome_seen`.

### 4.8 Stimulus helper on `storm/new` (pre-spend signal check)

On the Create page (`apps/web/app/(app)/storm/new/page.tsx`), add a **"Not sure what to write?"** affordance that lets the user validate their draft **before spending a run**:

- **Transport (explicit).** The client **never imports `stimulusParser`** (it lives under `lib/server/` and may carry server-only deps; `verdict.ts` remains the *only* isomorphic engine module). Instead the helper POSTs the draft to a **new thin server route `app/api/stimulus/inspect`** (or an equivalent server action) that runs the existing `stimulusParser` (`lib/server/engine/stimulusParser.ts`) server-side and returns the **detected signals as JSON** — e.g. **"2 prices, a trust signal, no clear CTA"**.
- This reuses the exact parser the engine runs at the top of `runStorm`, so the preview is faithful to what the pipeline will actually see; it does **not** invoke inference, generate personas, or consume credits.
- The call is **debounced like the live price preview (250 ms)** and complements the validity-gated "Run wind tunnel - N credits" button — the user now understands both the cost *and* the content quality of their stimulus before committing a run.

### 4.9 Files touched

| File | Change |
|------|--------|
| `lib/server/demo.ts` | **New.** Exports `DEMO_STORM_ID = "demo-personapilot"` (client-safe constant) as the single source of truth. |
| `scripts/seed_demo_storm.ts` | **New.** Fixed-seed MOCK-mode engine run over the PersonaPilot sample at `persona_count = 1000`; writes run + report + `init/reaction/progress/complete` events with `is_demo = true` under `DEMO_STORM_ID`; idempotent upsert; deploy-wired. |
| `supabase/migrations/*` | **New migration.** `is_demo boolean default false` on storm-runs **and** stream/replay-events; anon-`SELECT`-on-`is_demo=true` RLS policy on **both** tables. |
| `lib/server/stormStore.ts` | `getStormMeta`/`getStreamData`/`getStormReport` demo bypass; once-per-user signup demo-credit seed (`DEMO_SIGNUP_CREDITS`) via `adjust_wallet_balance`. |
| `apps/web/app/api/storm/[id]/stream/route.ts` | **Small edit:** use the anon Supabase client when no session; RLS returns the row only if `is_demo`, else 404. Reused, not duplicated. |
| `apps/web/app/api/storm/[id]/report/route.ts` | **No structural change** — anon access flows via the `getStormReport` `is_demo` bypass + RLS. |
| `apps/web/app/api/stimulus/inspect/route.ts` | **New.** Runs server-only `stimulusParser` on a draft, returns detected-signals JSON. |
| `apps/web/app/demo/route.ts` | **New.** Redirects to `/storm/${DEMO_STORM_ID}`; "Demo unavailable" fallback when `getStormMeta(DEMO_STORM_ID)` is null. |
| `apps/web/app/page.tsx` | Landing "Watch a 60-second live simulation" CTA → `/demo`. |
| `lib/useStormStream.ts` | Anonymous demo path: no `?access_token=` required; replay reconnection re-cursors. |
| `apps/web/app/(app)/storm/new/page.tsx` | "Not sure what to write?" helper calling `/api/stimulus/inspect` (debounced 250 ms) to show detected signals pre-spend. |

### 4.10 Invariants preserved

- Money flow untouched: concurrency guard (one running storm/user, stale after 3 min), atomic debit via `adjust_wallet_balance`, and full-refund-on-failure are unchanged.
- No numeric outputs change: the demo is a real engine run replayed; `market_fit_score` stays system-computed; existing Python tests in `apps/api/tests` stay green.
- No pricing/purchase surface is created; demo credits are an admin-style onboarding grant, not self-serve buying.
- Security boundary is DB-enforced: RLS confines anonymous reads to `is_demo = true` rows on both tables; all other rows still 404 for non-owners so ids never leak.

## 5. Workstream 2 - Verdict-first report (clarity & action)

**Goal.** An evaluator lands on the report and, within seconds, sees a plain-language answer ("build it / fix these first / not yet"), the evidence behind it, and the three highest-impact things to do next — *before* being asked to parse the full diagnostic breakdown. Everything in this workstream is **derived from the already-final report**, never re-inferred. There are **no new LLM calls, no new provider round-trips, and no change to any engine number** — `market_fit_score`, adoption counts, criteria averages, and quality metrics are read as-is.

### 5.1 Isomorphic derivation module — `lib/server/engine/verdict.ts`

A single new **pure, isomorphic** module (no I/O, no `fetch`, no Node/DOM globals) exports two functions:

- `deriveVerdict(report): Verdict`
- `selectTopActions(report): TopAction[]`

**Build-time persistence.** Both are invoked in `lib/server/engine/report.ts` at report-build time, immediately after `reportBuilder` has produced the final report object. Their outputs are written onto the report as new top-level fields `verdict` and `top_actions`, so they are (1) **persisted** into the stored report JSON alongside the existing tiers and (2) **included in the JSON export**.

Because the module is pure and isomorphic, the **exact same functions** run on the client as a **fallback**: if a report predates this work (`report.verdict` missing — e.g. an old run replayed), `report/page.tsx` recomputes verdict and actions in-browser from the same fields. New runs never recompute (they read the persisted value); only legacy runs hit the fallback path. One implementation, two call sites, identical output.

**Schema / type wiring** (same names everywhere):

- `report.schema.json` — add `verdict` (object) and `top_actions` (array).
- `lib/server/engine/types.ts` — add `Verdict` and `TopAction` interfaces, **reusing** the existing `GREEN_THRESHOLD` / `RED_THRESHOLD` constants (never redefined).
- `lib/types.ts` — mirror the client-facing shapes so `report/page.tsx` and the new components are typed.

`verdict` shape: `{ level: 'strong' | 'conditional' | 'weak', headline: string, rationale: string, caveated: boolean }`.
`top_actions` shape: array (length 0–3) of `{ rank: number, imperative: string, why: string, evidence: { stat: string, quote?: string }, anchorId: string }`. `evidence.stat` is a **preformatted display string** (e.g. `"42%"`, `"$120"`), so components and tests render it verbatim.

### 5.2 `deriveVerdict(report)`

Re-uses the engine thresholds verbatim — **`GREEN_THRESHOLD = 0.62`**, **`RED_THRESHOLD = 0.38`** — so the verdict language is consistent with the same cutoffs the swarm uses for `statusFor(buy_likelihood)`. These engine constants are read, never mutated; adoption counts are never re-derived.

**Inputs (all read defensively):**

```
green      = report.adoption.green      ?? 0
yellow     = report.adoption.yellow     ?? 0
red        = report.adoption.red        ?? 0
mfs        = Number.isFinite(report.overall.market_fit_score)
             ? report.overall.market_fit_score : 0        // 0..1
confidence = report.overall.confidence   ?? 'low'         // 'low' | 'medium' | 'high'
collapse   = report.quality.collapse_risk ?? '<non-low>'  // 'low' | ... | 'high'

intentShare = (green + yellow + red) > 0
              ? green / (green + yellow + red)
              : 0        // no adoption data -> conservative 0
```

**Caveat rule** (a caveat can *never* upgrade a report to `strong`):

```
caveated = (confidence === 'low') || (collapse !== 'low')
```

**Level (evaluated in this order):**

```
level =
  mfs >= GREEN_THRESHOLD && !caveated             -> 'strong'
  mfs <  RED_THRESHOLD   || collapse === 'high'    -> 'weak'
  otherwise                                        -> 'conditional'
```

The asymmetry is intentional: `strong` requires clearing `GREEN_THRESHOLD` **and** being un-caveated; `weak` triggers on either sub-`RED_THRESHOLD` fit **or** high collapse risk; everything else is `conditional`.

**Headlines** (fixed strings, one per level):

| level | headline |
|---|---|
| `strong` | `Strong signal - worth building` |
| `conditional` | `Promising - fix these first` |
| `weak` | `Weak signal - not yet` |

**Rationale** — templated **only** from real report fields, as ordered segments each owning its own leading connector, so absent clauses drop cleanly with their punctuation:

- **S1 (always):** `{round(mfs*100)}% market fit, {confidence} confidence`
- **S2 (present iff `top_strengths[0]` exists):** ` — {top_strengths[0]}`
- **S3 (present iff `top_blockers[0]` and/or `top_objections[0]` exist):** the blocker/objection clause ending in `holding intent at {round(intentShare*100)}%` (missing sub-token dropped)
- If S3 is absent, S1 is terminated with `; intent at {round(intentShare*100)}%.`

Four concrete canonical renderings (drive the tests):

- **All present:** `72% market fit, high confidence — clear value proposition, but pricing friction and 'Too expensive to justify' are holding intent at 58%.`
- **No strength:** `72% market fit, high confidence; pricing friction and 'Too expensive to justify' are holding intent at 58%.`
- **No blocker/objection:** `72% market fit, high confidence — clear value proposition; intent at 58%.`
- **All-empty:** `72% market fit, high confidence; intent at 58%.`

**Trust chip / caveat styling.** When `caveated` is true, `deriveVerdict` sets `caveated: true`; `VerdictBanner` then renders a prominent **"Directional only - low confidence"** pill *inside* the banner. Per §5.5 the caveat styling **augments** (does not replace) the level color — an amber accent + pill layered over the level treatment. Because `strong` can never be caveated, only `conditional`/`weak` + caveat combinations arise.

**Totality (never throws).** `deriveVerdict` is **total**; every field is defaulted before use so *every* report — sparse, partial, or malformed legacy — gets a verdict:

- Missing / NaN `market_fit_score` → **`0`** → deterministically `weak` (conservative).
- Missing `adoption` counts → `green/yellow/red = 0` → `intentShare = 0`.
- Missing `confidence` → **`'low'`** → `caveated = true`.
- Missing / unknown `quality.collapse_risk` → treated as **non-`'low'`** → `caveated = true` (fail toward caution).

The function has no throw paths, so the client fallback can call it unconditionally.

### 5.3 `selectTopActions(report)` — up to 3 enriched actions (TOTAL)

**No re-ranking.** `recommendations[]` is **already impact-ranked** by `reportBuilder` (top objection → missing pricing → missing proof → collapse risk (non-low) → price test → weak segment, capped at 6). `selectTopActions` takes the **first 3** of that existing order and *enriches* each with concrete evidence and a scroll anchor. It never re-sorts.

Each output row: `{ rank (1..3), imperative (from recommendation.title), why (from recommendation.detail), evidence: { stat, quote? }, anchorId }`.

**Matching semantics (deterministic).** Match against a **single normalized field: lowercased `recommendation.title`, then lowercased `recommendation.detail`**; matching is **case-insensitive**. The mapping rows are evaluated **in the exact order below; the first rule that matches wins**; a recommendation matching no rule routes to **DEFAULT**. This makes multi-keyword recommendations resolve to exactly one mapping.

| # | Matched keyword | Evidence source (real fields) | `evidence.stat` | `anchorId` |
|---|---|---|---|---|
| 1 | `objection` | `top_objections[0].share` (+ `example_quote` → `evidence.quote`) | `"{round(share*100)}%"` | `#objections` |
| 2 | `pricing` / `price` | price_sensitivity crossover (see below) + `avg_max_price` | crossover price w/ currency | `#pricing` |
| 3 | `proof` / `trust` | count of personas needing proof (`adoption.yellow`) | `"{yellow}"` | `#trust` |
| 4 | weak `segment` | segment name + `adoption_rate` | `"{segment}: {round(adoption_rate*100)}%"` | `#segments` |
| 5 | `collapse` / `quality` / `consensus` | `quality.collapse_risk` level | `"collapse risk: {collapse_risk}"` | `#quality` |
| — | **DEFAULT** (no keyword match) | none | evidence **omitted** | `#full-diagnostics` |

The previous `differentiation → #differentiation` row is **removed**: `differentiation` is not one of `reportBuilder`'s recommendation categories, so it could never fire (`DifferentiationPanel` still renders as a tier-4 diagnostic; it simply carries no TopActions anchor). **No branch may leave `anchorId` or `evidence` undefined** — the DEFAULT rule guarantees every top-3 recommendation yields a valid, non-crashing, scroll-linkable action.

**Pricing crossover (row 2).** The crossover is **the lowest `price` in `price_sensitivity[]` at which `share_willing` first falls below `0.5`**. If `share_willing` never falls below `0.5`, use **`avg_max_price`**. `evidence.stat` renders that price with currency (e.g. `"~$48"`).

**Fallback ladder** (only reached when fewer than 3 rows exist after enrichment, and **de-duplicated** so no underlying issue repeats):

1. Pad from **`weakest_criteria[]`** as `"Strengthen {criterion}"`, `evidence.stat` = the criterion score, `anchorId` = **`#criteria`** (auto-expands the collapsed `CriteriaBreakdown` on navigation, §5.6).
2. Still short → pad from **`next_human_validation[]`**, `evidence.stat` = persona share, `anchorId` = **`#next-validation`**.

Padding candidates are filtered against **already-selected actions (by underlying criterion/objection key) and against each other**, so the up-to-3 rows are always distinct.

**All-strong special case.** Fires **only when `overall.top_blockers.length === 0` AND there are zero `priority === 'now'` recommendations** — and it **takes precedence over both the normal path and the padding ladder**. In that case the up-to-3 rows are drawn from **`next_human_validation[]`** as **"Validate before shipping"** items, `evidence.stat` = persona share, `anchorId` = `#next-validation` — so a great result still ends on concrete next steps rather than an empty panel.

**≤3 guarantee.** Output length is clamped to a maximum of 3 and may be 1–2 when sources are genuinely sparse; `TopActions.tsx` renders 1–2 rows cleanly (no empty placeholder rows, no crash).

### 5.4 `AtAGlance` — 4-tile KPI strip

A compact strip directly under the verdict, four tiles, each a single derived number:

| Tile | Value |
|---|---|
| Market fit | `{round(mfs*100)}%` |
| Buy intent | `{round(intentShare*100)}%` |
| Top objection | `{top_objections[0].label} ({round(share*100)}%)` |
| Willing to pay | `~${avg_max_price}` |

Every tile degrades independently: any missing source renders **`-`** rather than throwing or blanking the strip. Tiles re-use the `InsightCard` visual language from `components/ui/*`.

### 5.5 New components — `components/report/{VerdictBanner,TopActions,AtAGlance}.tsx`

- **`VerdictBanner.tsx`** — renders `verdict.headline`, `verdict.rationale`, and (when `verdict.caveated`) the "Directional only - low confidence" pill with an **amber accent layered over** the level color (`strong`/`conditional`/`weak`). Carries `data-tour="verdict-banner"`.
- **`TopActions.tsx`** — renders up to 3 ranked rows (`imperative` + `why` + `evidence.stat`/`quote`), each a scroll-link to its `anchorId`. Carries `data-tour="top-actions"`.
- **`AtAGlance.tsx`** — the 4-tile strip above.

All three consume the persisted `report.verdict` / `report.top_actions` when present, and otherwise the client-side `deriveVerdict(report)` / `selectTopActions(report)` fallback — identical output either way.

### 5.6 `report/page.tsx` restructure — verdict-first, depth preserved

The page is re-ordered to a **verdict-first** layout while keeping **all existing depth** (additive, never delete):

```
[ VerdictBanner ]      <- the answer
[ AtAGlance ]          <- 4 KPI tiles
[ TopActions ]         <- 3 actions, each scroll-links into diagnostics
------ Full diagnostics ------   (bold divider, id="full-diagnostics")
[ the existing 6 tiers, expanded ]
```

**The six tiers (enumerated once, for checkability):**

| Tier | Panels |
|---|---|
| T1 Overview + Trust | `MarketFitHero`, exec summary, `TrustPanel` |
| T2 Adoption | `BlockerCards`, `StrengthCards` |
| T3 Criteria | `CriteriaRadar`, `CriteriaBreakdown` *(raw table collapsed by default)* |
| T4 Deep-dives | `TrustProofPanel`, `DifferentiationPanel`, `PricingFitPanel`, `WorkflowFitPanel` |
| T5 Evidence | `PriceCurve`, `SegmentHeatmap`, `AgeCohortBreakdown`, `ObjectionsTable`, `KillQuoteCard` |
| T6 Next steps | `Recommendations`, `NextValidationPanel` |

**Progressive-disclosure decision — EXPANDED below the divider.** The `#full-diagnostics` section renders **expanded**, not collapsed. For a recruiter/evaluator, visible depth is the wow: they should be able to scroll and *see* every panel of rigor without hunting for a toggle. The **only** thing collapsed by default is the **tier-3 raw `CriteriaBreakdown` table** (long, low-signal at a glance); everything else stays open. Per §5.3 / the anchor rules, navigating to `#criteria` (via a Top-3 action or tour step) **auto-expands** that table, then scrolls — so an evaluator is never dropped onto a hidden section.

**Scroll anchors — unique, 1:1 with a single DOM target** (no id applied to two components, no duplicate DOM ids):

| `id` | Single element |
|---|---|
| `#objections` | `ObjectionsTable` |
| `#pricing` | `PricingFitPanel` |
| `#price-curve` | `PriceCurve` |
| `#trust` | `TrustProofPanel` |
| `#quality` | `TrustPanel` |
| `#segments` | `SegmentHeatmap` |
| `#criteria` | `CriteriaBreakdown` |
| `#next-validation` | `NextValidationPanel` |

Anchor scrolling is smooth-scroll and reduced-motion aware (Workstream 3). The `Full diagnostics` divider carries `data-tour="full-diagnostics"` for the report tour step.

## 6. Workstream 3 - Guided tour & polish

All work in this workstream is UX-layer, additive, and client-only. It never deletes existing depth, changes engine numbers, or touches the money flow or `apps/api`. The goal is a self-explaining product that an evaluator understands in 2–5 minutes without reading docs.

### 6.1 Guided tour (driver.js)

**Dependency.** Add `driver.js` (~5kb, framework-agnostic spotlight + popover) to `apps/web/package.json` — a settled reuse-first decision, giving spotlight masking, popovers, keyboard nav, and step sequencing out of the box.

**Component & data.** New files:
- `components/Tour.tsx` — a thin client component that instantiates driver.js, filters steps to those whose anchors are actually present, and drives the sequence.
- `lib/tour/steps.ts` — tour steps declared as **data**, each referencing a real element via a `data-tour="..."` attribute selector, keeping the tour decoupled from component internals.

**Anchoring.** Steps target `data-tour` attributes added to existing elements (never CSS classes or DOM structure):
- Live page (`storm/[id]`): `data-tour` on `PersonaGrid` (grid cells) and `LiveCounters` (market-fit score, collapse-risk meter).
- Report page (`storm/[id]/report`): `data-tour` on `VerdictBanner`, `TopActions`, the "Full diagnostics" divider, and the JSON download control.

**Per-page step lists** (cap ~4 steps/page):

*Live-storm page — 3 steps:*
1. Grid meaning — each cell is one persona; green = intent, yellow = needs proof, red = rejected.
2. Live market-fit score — system-computed, never invented by the LLM.
3. Collapse-risk meter — what it signals about persona diversity / consensus collapse.

*Report page — 4 steps:*
1. Verdict banner — "your answer".
2. Top-3 actions — "what to fix, with evidence".
3. "Full diagnostics" divider — "the full diagnostic breakdown below (every panel)".
4. JSON download — export the full report.

Tour copy asserts **no hardcoded persona or panel counts**.

**Gating & relaunch.**
- Fires only on **first visit per page**, gated by `localStorage` keys `ps_tour_live_seen` / `ps_tour_report_seen`.
- Always skippable (Esc / skip control).
- Re-launchable any time via a persistent **"?" button in `components/dashboard/Topbar.tsx`**, which re-runs the current page's tour regardless of the seen-flag.

**Robustness.**
- **SSR-safe:** all driver.js access guarded by `typeof window !== 'undefined'`; nothing runs during server render.
- **Reduced motion:** respects `prefers-reduced-motion` — spotlight transitions/animations disabled when preferred.
- **Missing anchors:** before starting, `Tour.tsx` filters declared steps down to selectors present in the DOM, so a step whose target isn't rendered (e.g. an old run without a verdict) is skipped rather than throwing. Tour steps targeting a collapsed panel auto-expand it first (§5.6 rule).
- **localStorage unavailable:** all reads/writes wrapped in `try/catch`; on failure the tour degrades to "show, don't persist" (may re-show, never errors).
- **Keyboard navigable:** fully operable via keyboard (next/prev/skip).

### 6.2 Polish pass ("maximum polish") - checklist

1. **Always-visible grid legend.** New `components/storm/GridLegend.tsx` on the live page so comprehension of green/yellow/red **never depends on the tour**. Static, always present.
2. **Persistent "how it works" panel.** New `components/HowItWorks.tsx` — a dismissible panel elevating the report `disclaimer` field into plain language: "AI personas react; scores are system-computed, not invented; directional - not a replacement for human research." Where a number is shown it binds to **`report.persona_count`** (never a hardcoded "1000"). Dismiss state persisted in `localStorage` (same try/catch degradation).
3. **Self-explaining copy.** One-line "what is this?" copy on the live grid, report sections, and empty states. Copy edits land across `app/page.tsx`, `dashboard/page.tsx`, `storm/new/page.tsx`, and `storm/[id]/report/page.tsx`. No hardcoded persona/panel counts; refer to "the full diagnostic breakdown (every panel)".
4. **Graceful states.** Lean on existing `loading.tsx` / `error.tsx` / `not-found.tsx`:
   - Live-stream `connectionError` (3 failed connects before init) presents as **"Reconnecting..."**, not a hard failure.
   - Skeletons for the verdict banner and KPI strip while the report loads.
5. **Tasteful micro-interactions**, all `prefers-reduced-motion` aware (each falls back to instant, static presentation):
   - Verdict banner entrance animation.
   - KPI count-up on the `AtAGlance` tiles.
   - Smooth-scroll when a Top-3 action anchor is followed: **`#objections`, `#pricing`, `#trust`, `#segments`, `#quality`, `#criteria`, `#next-validation`**. Following a `#criteria` link **auto-expands the collapsed tier-3 `CriteriaBreakdown` table** before scrolling.
6. **First-run welcome toast**, tied to the Workstream 1 signup seeding: "Welcome - you've got N demo credits. Try a sample." N is read from the **actual granted wallet balance** (never hardcoded); shown once, gated by `ps_welcome_seen`.
7. **One visual language + accessibility baked in.**
   - All new components (`Tour`, `HowItWorks`, `GridLegend`, plus WS2's `VerdictBanner` / `TopActions` / `AtAGlance`) reuse `components/ui/*` primitives and Tailwind tokens — no bespoke styling system.
   - a11y baseline: visible focus states throughout; `aria` labeling on the persona grid and the collapse-risk meter; keyboard-navigable tour; count-up and entrance animations respect reduced motion.

### 6.3 Files touched

**New files:** `components/Tour.tsx`, `lib/tour/steps.ts`, `components/HowItWorks.tsx`, `components/storm/GridLegend.tsx`.

**Edited files:**
- `components/dashboard/Topbar.tsx` — persistent "?" relaunch button.
- `components/report/VerdictBanner.tsx`, `components/report/TopActions.tsx`, and the "Full diagnostics" divider in `storm/[id]/report/page.tsx` — `data-tour` attributes.
- `components/storm/PersonaGrid.tsx`, `components/storm/LiveCounters.tsx` — `data-tour` attributes + aria.
- Copy edits across `app/page.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/storm/new/page.tsx`, `app/(app)/storm/[id]/report/page.tsx`.

**Dependency:** add `driver.js` to `apps/web/package.json`.

## 7. Data flow & error handling

This section specifies the three data flows and the error-handling matrix that keeps them total. Enforcement is called out explicitly as **DB (RLS)** versus **app (route/module)** wherever a fallback or bypass exists. No money-flow, engine-numeric, or `apps/api` path is altered.

### 7.1 Data flows

#### 7.1.1 Flow A — Demo run (seed once, replay to anyone)

The demo is a real, pre-computed run that is *replayed*, not re-inferred. Nothing in this flow calls the provider at request time.

1. **Seed (build/deploy time, once).** `scripts/seed_demo_storm.ts` runs the engine in **MOCK mode with a FIXED RNG SEED** at **`persona_count = 1000`** against the PersonaPilot AI-SaaS sample. Running the *new* code, `runStorm` produces a report already carrying `verdict` and `top_actions` (Flow B). The script writes the run row, `report` JSON, and the persisted **`init`/`reaction`/`progress`/`complete`** stream events into the store with `storm_id = DEMO_STORM_ID` and `is_demo = true`. It is **idempotent** (upserts the same `DEMO_STORM_ID`, never duplicates) and **wired into deploy**.
2. **Schema + RLS (DB).** A migration adds `is_demo boolean NOT NULL DEFAULT false` to the storm-runs table **and** the replay-events table, with an **RLS policy granting `anon` SELECT only on `is_demo = true` rows on both tables** — read-only, DB-enforced. Non-demo rows remain invisible to anonymous callers at the database layer regardless of app logic. Ownership on non-demo rows continues via `ownedStormRow`.
3. **Retrieval bypass (app).** `getStormMeta`, `getStreamData`, `getStormReport` short-circuit their ownership check and return the row to **any** caller when `row.is_demo`. This is an *app-level* convenience on top of the DB guarantee — RLS is the real boundary.
4. **Reused routes (DRY).** The public path reuses `/api/storm/[id]/stream` and `/api/storm/[id]/report`. The **report route is unchanged**; the **stream route only gains an anon-client fallback**. Landing CTA → `/demo` (`app/demo/route.ts`) → server redirect to `/storm/${DEMO_STORM_ID}`.
5. **Anonymous streaming.** With no session the stream route uses the **anon Supabase client**; RLS returns the row only if `is_demo`, so a returned row **is** the demo and is streamed with no token; an empty result → **404** (never leaks non-demo ids). Authenticated users pass `?access_token=` for their own runs. Replay reconnection **re-cursors** from persisted events (120 ms flush timer and `init/reaction/progress/complete/error` handling unchanged).
6. **Authed activation (parallel, not payments).** On signup, a once-per-user server hook seeds **`DEMO_SIGNUP_CREDITS`** via `adjust_wallet_balance` so the first real run clears the atomic debit. No buy-credits UI is introduced.

#### 7.1.2 Flow B — Verdict & Top-3 actions (derived once, persisted, client-fallback)

Everything here is **derived from already-final report fields** — no new LLM calls, no re-inference, no number changes.

1. **Build time (server).** `report.ts` imports the pure isomorphic `lib/server/engine/verdict.ts` and calls `deriveVerdict(report)` and `selectTopActions(report)` over the already-built report. Results are written to `report.verdict` and `report.top_actions` — **persisted** and included in the JSON export. Fields are added to `report.schema.json`, `engine/types.ts`, `lib/types.ts`.
2. **`deriveVerdict`.** Reuses `GREEN_THRESHOLD = 0.62` / `RED_THRESHOLD = 0.38` verbatim. Computes `intentShare`, `mfs`, `caveated = confidence === 'low' || collapse_risk !== 'low'`; derives `level` (a caveat can never yield `strong`), templated headline + rationale, and the in-banner trust chip. **Total** — see §7.2.
3. **`selectTopActions`.** Takes the **first 3 already-impact-ranked `recommendations[]`** (order fixed by `reportBuilder`; **no re-ranking**) and enriches each into `{ rank, imperative, why, evidence{stat, quote?}, anchorId }` via the first-match keyword mapping (§5.3: `objection → #objections`, `pricing/price → #pricing`, `proof/trust → #trust`, `weak segment → #segments`, `collapse/quality → #quality`, else **DEFAULT → #full-diagnostics`**). Sparse input is padded by the de-duplicated fallback ladder; the all-strong case is handled per §5.3. **Total** — no undefined `anchorId`/`evidence`.
4. **Serve.** The report page reads `report.verdict` / `report.top_actions` straight from the persisted JSON for new runs.
5. **Client fallback (isomorphic).** If `report.verdict` is absent (old runs), `report/page.tsx` recomputes via the **same** functions — identical logic, no divergence. `AtAGlance` reads the same derived + raw fields.

#### 7.1.3 Flow C — Tour & onboarding state (client-only, SSR-guarded)

1. **Storage.** Tour/onboarding state lives **only in client `localStorage`**; nothing server-side. First-visit gating uses `ps_tour_live_seen` / `ps_tour_report_seen`; `HowItWorks` and the welcome toast track their own flags (`ps_welcome_seen`).
2. **SSR safety.** All access guarded by `typeof window` so the tour and `lib/tour/steps.ts` never touch storage or DOM during server render.
3. **Step binding.** Steps declared as data, anchored to `data-tour` attributes on `VerdictBanner`, `TopActions`, the "Full diagnostics" divider, `PersonaGrid`, `LiveCounters`.
4. **Re-entry.** The persistent "?" button in `Topbar.tsx` re-launches the tour regardless of seen-flags. `prefers-reduced-motion` honored throughout.

### 7.2 Error-handling matrix

| Failure | Where it surfaces | Enforcement layer | Fallback behavior |
|---|---|---|---|
| **Demo fixture missing / not seeded** | `/demo` route + landing CTA | App | Never a raw 404. Absence is defined as `getStormMeta(DEMO_STORM_ID)` returning `null`; both `/demo` and the CTA degrade to **"Demo unavailable — start your own"**. The idempotent, deploy-wired seed script self-heals the fixture on next deploy. |
| **`deriveVerdict` on empty/partial report** | `verdict.ts` (server build + client fallback) | App | **Total, never throws.** Missing/NaN `market_fit_score` → `0` (→ `weak`); missing `adoption` → `intentShare = 0`; missing `confidence` → `'low'` (→ caveated); unknown/missing `collapse_risk` → treated as non-`'low'` (→ caveated). Every report gets a `verdict`. |
| **Top-3 recommendation matching no keyword** | `selectTopActions` | App | **DEFAULT** enrichment: `imperative`/`why` from title/detail, `evidence` omitted, `anchorId = #full-diagnostics`. No undefined anchor/evidence. |
| **Sparse Top-3 / all-strong** | `selectTopActions` | App | De-duplicated fallback ladder: pad from `weakest_criteria[]` (`"Strengthen {criterion}"`, `#criteria`), then `next_human_validation[]` (`#next-validation`). **All-strong** (`top_blockers.length === 0` AND no `priority === 'now'`) → up to 3 "Validate before shipping" rows from `next_human_validation[]` (`#next-validation`), taking precedence. Guarantees **up to 3**; renders 1–2 gracefully. |
| **Missing KPI data in `AtAGlance`** | `AtAGlance.tsx` | App | Any missing tile value renders **`-`**; the strip never breaks. |
| **Top-3 anchor targets a collapsed panel** | `report/page.tsx` | App | Navigating to `#criteria` **auto-expands** the collapsed tier-3 `CriteriaBreakdown` table, then smooth-scrolls. |
| **Tour anchor selector absent** | `Tour.tsx` / `lib/tour/steps.ts` | App | Steps **filtered to present `data-tour` selectors before start**; a missing anchor drops its step rather than aborting. `GridLegend` / `HowItWorks` / inline "what is this?" copy make comprehension tour-independent. |
| **`localStorage` unavailable / throws** | `Tour.tsx`, `HowItWorks.tsx`, welcome toast | App | Wrapped in `try/catch`; degrades to **"show, don't persist"** — surfaces still render, seen/dismiss state simply isn't remembered. |
| **Anonymous stream reconnect / dropped connection** | `useStormStream` + stream route | App + DB | For demo rows, reconnection **re-cursors** from persisted events using the anon client (RLS-scoped). Transient `connectionError` reads as **"Reconnecting…"**; verdict/KPI **skeletons** cover the gap. |
| **Non-owner requests a non-demo storm** | `getStormMeta`/`ownedStormRow` + RLS | DB (primary) + app | Unchanged: non-owners/non-admins get **404** so ids never leak. The `is_demo` bypass and anon client apply **only** to `is_demo = true` rows; RLS blocks anon reads of non-demo rows at the DB even if app logic were bypassed. |
| **Money flow (concurrency guard, atomic debit, refund)** | `createAndRunStorm` | App + DB RPC | **Untouched.** Concurrency guard (stale after 3 min), atomic `adjust_wallet_balance` debit (→ `InsufficientCreditsError`), and full refund on failure remain exactly as-is. Signup demo-credit seeding adds balance but alters no debit/refund logic. |
| **Old run without persisted `verdict`/`top_actions`** | `report/page.tsx` | App | Client recomputes via the isomorphic functions (Flow B step 5) — no server round-trip, identical output. |

**Enforcement summary:** the demo's read-only exposure is guaranteed at the **DB layer via the `anon` / `is_demo = true` RLS policy on both tables**; the app-level `is_demo` bypass and the stream route's anon-client fallback are conveniences on top of that guarantee, never the sole gate. All verdict/top-action derivation and all tour/onboarding state are **app/client concerns** with total, throw-free fallbacks. The engine's numeric outputs and the entire money flow are strictly read-only in this work — existing `apps/api` pytest suites stay green because the change is purely additive.

## 8. Testing strategy

All testing work is **purely additive** and lives entirely in `apps/web`. No engine numbers change, so the existing `apps/api/tests` (pytest) suite is untouched and stays green. The web app currently has **no JS/TS test runner configured**; this workstream introduces one.

### 8.1 Runner: add Vitest to `apps/web`

- Add **Vitest** as the unit + component runner (with `@testing-library/react` + `@testing-library/jest-dom` and `jsdom`). Vitest is chosen for zero-config TypeScript/ESM support and Vite-native speed; it coexists cleanly with Next.js App Router.
- Minimal config: a single `vitest.config.ts` (jsdom environment, path aliases mirroring `tsconfig.json` so `lib/server/engine/...` imports resolve), plus a `test` script in `apps/web/package.json`.
- **Playwright** is added separately (own config + `test:e2e` script) for the single public-demo smoke test (§8.5). It is not part of the Vitest run.

### 8.2 Unit tests — pure derivation logic (the correctness-critical core)

Target the new isomorphic `lib/server/engine/verdict.ts` (`deriveVerdict` + `selectTopActions`). Pure, deterministic, and defining the "answer" the evaluator reads first — the one place we insist on exhaustive coverage.

**`verdict.test.ts` — `deriveVerdict(report)`**

- **Truth table** across the three levels, reusing the implementation constants (`GREEN_THRESHOLD = 0.62`, `RED_THRESHOLD = 0.38`):
  - `strong` when `mfs >= 0.62` **and** not caveated → `"Strong signal - worth building"`.
  - `weak` when `mfs < 0.38` **or** `collapse_risk === 'high'` → `"Weak signal - not yet"`.
  - `conditional` otherwise → `"Promising - fix these first"`.
- **Caveat cap** — the caveat downgrades `strong → conditional` **only for the low-confidence case**; a high collapse risk yields `weak` (the weak branch fires first). Concrete cases:
  - `mfs = 0.7, confidence = 'low', collapse_risk = 'low'` → **`conditional`** (+ caveat pill).
  - `mfs = 0.7, collapse_risk = 'medium'` → **`conditional`** (+ caveat pill).
  - `mfs = 0.7, collapse_risk = 'high'` → **`weak`** (caveat pill still set).
  - Invariant asserted generally: **a caveat can never produce `strong`** (not "always downgrades to conditional").
- **Rationale templating** — verify the four canonical renderings (all-present / no-strength / no-blocker-or-objection / all-empty) from §5.2, each assembled from real fields with correct connectors and no leftover punctuation, where `intentShare = green / (green + yellow + red)`.
- **Totality** — never throws; always returns a verdict. Cases: missing/NaN `market_fit_score` → `0` → deterministically `weak`; missing `adoption` → `intentShare = 0`; missing `confidence` → `'low'` (caveated); unknown/undefined `collapse_risk` → caveated; empty `top_blockers`/`top_objections`/`top_strengths` → rationale still renders; assert no exception on a `{}`-ish report.

**`topActions.test.ts` — `selectTopActions(report)`**

- **`<= 3` guarantee** — never more than 3; takes the first 3 already-ranked `recommendations[]` **without re-ranking**.
- **Deterministic matching** — match on lowercased `recommendation.title` then `recommendation.detail`, case-insensitive, first rule in table order wins; multi-keyword recommendation resolves to exactly one mapping.
- **Enrichment mapping** — assert correct `anchorId` + `evidence` per keyword class:
  - objection → `top_objections[0]` share (+ `example_quote`) → `#objections`
  - pricing/price → crossover (lowest price where `share_willing` first < 0.5, else `avg_max_price`) + currency → `#pricing`
  - proof/trust → personas-needing-proof (`adoption.yellow`) count → `#trust`
  - weak segment → segment name + `adoption_rate` → `#segments`
  - collapse/quality → `quality.collapse_risk` level → `#quality`
  - **DEFAULT** (no match) → `evidence` omitted, `anchorId = #full-diagnostics`
  - shape verified: `{ rank, imperative (from title), why (from detail), evidence{stat, quote?}, anchorId }`, `evidence.stat` a preformatted string.
- **Fallback ladder** — when <3 recommendations, assert padding order `weakest_criteria[]` (`"Strengthen {criterion}"`, `#criteria`) → `next_human_validation[]` (`#next-validation`), **de-duplicated** by underlying key. Assert the **all-strong** trigger (`top_blockers.length === 0` AND no `priority === 'now'`) → 3 `"Validate before shipping"` rows from `next_human_validation[]`, taking precedence.
- **Sparse rendering** — graceful 1–2 action results when even the ladder cannot reach 3.

### 8.3 Component tests — React Testing Library (behavior, not pixels)

- **`VerdictBanner.tsx`** — correct headline text, level-appropriate color/state, and presence/absence of the "Directional only - low confidence" caveat pill per level (`strong` / `conditional` / `weak`); asserts the caveat amber accent **augments** (does not replace) the level color, and that the `data-tour` attribute is present.
- **`TopActions.tsx`** — renders exactly the returned rows (up to 3), each with its `anchorId` scroll-link, rank, imperative, and evidence stat/quote; `data-tour` present.
- **`AtAGlance.tsx`** — the 4 KPI tiles render from report fields and, critically, **missing data renders `"-"` and never throws**.

### 8.4 Shared fixture — the pre-baked demo report JSON

The **pre-baked demo report JSON** produced by `scripts/seed_demo_storm.ts` (the fixed-seed, 1000-persona PersonaPilot run) is reused as the **single canonical fixture** across unit and component tests. It:

- validates the **seed output** conforms to `report.schema.json` (including new `verdict` / `top_actions`),
- feeds `deriveVerdict` / `selectTopActions` and the RTL components with a realistic, schema-valid `report`, and
- keeps the demo path, the derivation logic, and the UI tested against **identical data** — if the fixture drifts from the schema, tests fail.

Deriving fixtures from the actual demo output (not hand-authored mocks) means the thing the evaluator sees on `/demo` is the thing under test.

### 8.5 End-to-end — one Playwright smoke test (public demo path)

A single unauthenticated smoke test:

**landing → click "Watch a 60-second live simulation" → `/demo` redirect → live grid streams (SSE) → navigate to report → verdict banner visible.**

This exercises the full `is_demo` chain in one pass: anon RLS SELECT on both tables, the anon-client stream fallback, the reused `/api/storm/[id]/report` route via the retrieval bypass, and the verdict-first render. Smoke-level — presence and flows, not exhaustive assertions.

### 8.6 Coverage stance and the explicit tradeoff

We **deliberately depart from the global "80% everywhere" default** and target coverage where it buys correctness, stating the split openly:

- **100% branch coverage on the pure derivation logic** (`verdict.ts`: `deriveVerdict` + `selectTopActions`, and the top-actions selection logic). Branch (not merely statement) coverage is required because the caveat asymmetry and first-match precedence create branches statement coverage would miss. It is cheap to cover (pure, deterministic, no I/O), defines the report's headline claim, and a wrong verdict directly undermines credibility.
- **Smoke-level on UI** — RTL component tests plus one Playwright path. We are not chasing line coverage on presentational components; their risk is low and churn (copy, layout, motion) is high.
- **Additive, engine untouched** — no scoring/inference/quality numbers change, so the existing `apps/api` pytest suite remains authoritative for engine behavior and stays green with zero edits.

**Honest tradeoff:** this consciously leaves large parts of `apps/web` (dashboard, create flow, live-view internals, tour wiring) without automated coverage. For a pre-launch portfolio/demo evaluated in 2–5 minutes, that is the right allocation — full branch correctness on the numbers the evaluator reads, a working proof of the marquee demo path, and no false confidence from padding coverage on low-risk view code. We record this as a stated stance and the deliberate point of divergence from the standing 80%-minimum rule.

## 9. File-level change map, risks & sequencing

All changes are UX-layer and **additive** in `apps/web`. Nothing here touches the engine's numeric outputs or `apps/api` (Python). The tables are the surface area; the detailed step-by-step implementation plan is a separate next step.

### 9.1 Workstream 1 — Frictionless entry (activation)

| File | New/Edit | Purpose |
|------|----------|---------|
| `lib/server/demo.ts` | New | Exports `DEMO_STORM_ID = "demo-personapilot"` (client-safe) — single source of truth for the demo id. |
| `scripts/seed_demo_storm.ts` | New | Mirrors `seed_personas.py`; runs the engine in MOCK mode with a FIXED RNG SEED at `persona_count = 1000` against the PersonaPilot sample; writes run + report + `init/reaction/progress/complete` events flagged `is_demo=true` under `DEMO_STORM_ID`. Deterministic, reproducible, idempotent; carries `verdict`/`top_actions` natively. |
| `supabase/migrations/<new>_add_is_demo.sql` | New | Adds `is_demo boolean default false` to storm-runs **and** stream/replay-events; adds anon-`SELECT`-on-`is_demo=true` RLS policy on **both** tables (read-only, DB-enforced). |
| `app/demo/route.ts` (`/demo`) | New | Redirects to `/storm/${DEMO_STORM_ID}`; falls back to "Demo unavailable - start your own" when `getStormMeta(DEMO_STORM_ID)` is null. |
| `app/api/stimulus/inspect/route.ts` | New | Runs server-only `stimulusParser` on a draft, returns detected-signals JSON (no inference, no credits). |
| `lib/server/stormStore.ts` | Edit | `getStormMeta`/`getStreamData`/`getStormReport` return the row to ANY caller when `row.is_demo`, preserving `ownedStormRow` 404 for non-demo rows. Once-per-user signup demo-credit seed (`DEMO_SIGNUP_CREDITS`) via `adjust_wallet_balance`. |
| `app/api/storm/[id]/stream/route.ts` | Edit (small) | Use the anon Supabase client when no session; RLS returns the row only if `is_demo`, else 404; replay reconnection re-cursors. |
| `app/api/storm/[id]/report/route.ts` | No change | Anon demo access flows via the `getStormReport` `is_demo` bypass + RLS. |
| `app/page.tsx` (landing) | Edit | Hero CTA "Watch a 60-second live simulation" → `/demo`; graceful fallback copy if fixture absent. |
| `app/(app)/storm/new/page.tsx` | Edit | "Not sure what to write?" helper POSTs the draft to `/api/stimulus/inspect` (debounced 250 ms) to show detected signals BEFORE a run is spent. |

### 9.2 Workstream 2 — Verdict-first report (clarity & action)

| File | New/Edit | Purpose |
|------|----------|---------|
| `lib/server/engine/verdict.ts` | New | Pure, isomorphic module exporting `deriveVerdict(report)` and `selectTopActions(report)`; reuses `GREEN_THRESHOLD`/`RED_THRESHOLD`; both TOTAL, never throw. Everything derived, no new LLM calls. |
| `components/report/VerdictBanner.tsx` | New | Level (strong/conditional/weak), headline, templated rationale; "Directional only - low confidence" pill + amber accent augmenting the level color when caveated. |
| `components/report/AtAGlance.tsx` | New | 4-tile KPI strip (Market fit, Buy intent, Top objection, Willing to pay); missing data renders "-", never breaks. |
| `components/report/TopActions.tsx` | New | Up to 3 enriched, scroll-linked action rows (`imperative`/`why`/`evidence{stat,quote?}`/`anchorId`). |
| `lib/server/engine/report.ts` | Edit | Calls `deriveVerdict` + `selectTopActions` at build time so `verdict` + `top_actions` are PERSISTED and included in the JSON export. |
| `report.schema.json` | Edit | Adds `verdict` and `top_actions` fields. |
| `lib/server/engine/types.ts` | Edit | Adds `Verdict`/`TopAction` types (alongside existing `GREEN_THRESHOLD`/`RED_THRESHOLD`/`statusFor`). |
| `lib/types.ts` | Edit | Client-side `Verdict`/`TopAction` types; `evidence.stat` is a preformatted string. |
| `app/(app)/storm/[id]/report/page.tsx` | Edit | Renders Verdict → AtAGlance → TopActions on top, then wraps the 6 tiers in a `#full-diagnostics` section under a bold "Full diagnostics" divider (EXPANDED); client fallback recomputes via the same isomorphic module for old runs; auto-expands `CriteriaBreakdown` on `#criteria` navigation. |
| `components/report/*` panels | Edit | Add unique 1:1 `id` anchors: `#objections` (ObjectionsTable), `#pricing` (PricingFitPanel), `#price-curve` (PriceCurve), `#trust` (TrustProofPanel), `#quality` (TrustPanel), `#segments` (SegmentHeatmap), `#criteria` (CriteriaBreakdown), `#next-validation` (NextValidationPanel). Only the tier-3 `CriteriaBreakdown` raw table is collapsed by default. |

### 9.3 Workstream 3 — Guided tour + polish

| File | New/Edit | Purpose |
|------|----------|---------|
| `components/Tour.tsx` | New | driver.js spotlight+popover tour; SSR-safe (`typeof window` guarded), `prefers-reduced-motion` aware, first-visit gated (`ps_tour_live_seen`/`ps_tour_report_seen`), always skippable; filters steps to present selectors before start. |
| `lib/tour/steps.ts` | New | Tour steps as data, anchored to `data-tour="..."` attributes (live: 3 steps; report: 4 steps; cap ~4/page); count-free copy. |
| `components/HowItWorks.tsx` | New | Persistent dismissible panel elevating the `disclaimer` field; binds any number to `report.persona_count`. |
| `components/storm/GridLegend.tsx` | New | Always-visible green/yellow/red legend so comprehension does not depend on the tour. |
| `components/storm/PersonaGrid.tsx`, `LiveCounters.tsx` | Edit | Add `data-tour` attrs for grid meaning, live market-fit score, collapse-risk meter; aria on grid/meter. |
| `components/report/VerdictBanner.tsx`, `TopActions.tsx`, diagnostics divider | Edit | Add `data-tour` attrs for verdict / Top-3 / "Full diagnostics" / JSON download steps. |
| `components/dashboard/Topbar.tsx` | Edit | Persistent "?" button to re-launch the tour. |
| `apps/web/package.json` | Edit | Add `driver.js` dependency (~5kb). |
| Copy across landing/dashboard/new/report | Edit | One-line "what is this?" copy, empty-state copy, "Reconnecting..." live-stream messaging, first-run welcome toast (reads actual granted balance), verdict/KPI skeletons; no hardcoded persona/panel counts. |

### 9.4 Testing (net-new infra)

| File | New/Edit | Purpose |
|------|----------|---------|
| `apps/web/vitest.config.ts` | New | Minimal Vitest config (jsdom, path aliases). |
| `verdict.test.ts` | New | Truth table + caveat cap (low-confidence → conditional; high collapse → weak) + rationale renderings + totality (100% branch on pure derivation). |
| `topActions.test.ts` | New | Deterministic matching, enrichment mapping → correct `anchorId`+evidence (incl. collapse/quality and DEFAULT), crossover definition, de-duplicated fallback ladder, all-strong precedence, `<=3` guarantee. |
| `VerdictBanner`/`TopActions`/`AtAGlance` RTL tests | New | Headline/color/caveat-augment per level; up-to-3 rows + anchors; missing → "-". |
| `apps/web/playwright.config.ts` + demo smoke test | New | Public path: landing → "Watch live" → grid streams → report → verdict visible. |
| Pre-baked demo report JSON | Reuse | Canonical fixture validating both the seed and the components. |

### 9.5 Risks & open questions

- **Anon-stream security surface via RLS.** Anonymous demo access relies on the anon-`SELECT`-on-`is_demo=true` RLS policy (on both storm-runs and events tables) as the *sole* gate. Verify no non-demo row/event is ever readable by the anon client, and that `ownedStormRow`'s 404-for-non-owners is untouched for all real runs.
- **Demo-run freshness / re-seed cadence.** The pre-baked run can drift as the report schema/engine evolves; the seed script must stay idempotent (upsert `DEMO_STORM_ID`) and wired into deploy so the demo always carries native `verdict`/`top_actions`. Open: re-seed on every deploy vs. on schema change.
- **Isomorphic recompute divergence.** The client fallback must produce output identical to the server-persisted `verdict`/`top_actions` for old runs — any drift between the two call sites of the shared module is a correctness bug.
- **Sparse Top-3 fallback correctness.** The de-duplicated ladder (recommendations → `weakest_criteria[]` → `next_human_validation[]`, all-strong → "Validate before shipping") must always yield up to 3 distinct rows and render 1–2 gracefully.
- **`localStorage` unavailability.** Tour/onboarding gating degrades to "show, don't persist" under try/catch; confirm no crash in privacy/incognito contexts.
- **Demo credit seeding on signup.** `DEMO_SIGNUP_CREDITS` (≥ 2× a 1200-persona run) must read unambiguously as activation, not a purchase surface, and the once-per-user hook must not interfere with the untouched money flow (concurrency guard, atomic `adjust_wallet_balance` debit, refund).
- **New test infra from zero.** Vitest + Playwright are introduced fresh in `apps/web`; the existing `apps/api` pytest suite must stay green (work is purely additive, no engine numbers change).
- **Future verdict-cutoff calibration is out of scope.** `GREEN_THRESHOLD = 0.62` / `RED_THRESHOLD = 0.38` are engine constants consumed by `statusFor` to produce `adoption.green/yellow/red` — an engine numeric output — and are **reused verbatim**; changing them would violate the "no engine-number change" constraint. If verdict-*level* cutoffs ever need to differ from the cell thresholds, that is **separate future work** implemented as *new verdict-only constants inside `verdict.ts`* that read the engine values but never mutate them or alter adoption counts. (The `driver.js` choice and the reuse-first tour decision are settled, not open.)

### 9.6 High-level build sequence

1. **Schema + verdict core.** Land the `is_demo` migration (+ RLS anon policy on both tables); add `lib/server/demo.ts` (`DEMO_STORM_ID`); implement `lib/server/engine/verdict.ts`; add `verdict`/`top_actions` to `report.schema.json`, `engine/types.ts`, `lib/types.ts`; wire persistence into `report.ts`. Ship `verdict.test.ts` + `topActions.test.ts` (100% branch).
2. **Report UI.** Build `VerdictBanner`/`AtAGlance`/`TopActions`; reorganize `report/page.tsx` to Verdict → AtAGlance → TopActions → `#full-diagnostics`; add the unique panel `id` anchors, the tier-3 raw-table collapse + auto-expand-on-anchor, and the client fallback recompute. RTL component tests.
3. **Demo seed + routes.** Author `scripts/seed_demo_storm.ts`; add the `is_demo` retrieval bypass in `stormStore.ts`; add the stream route's anon-client fallback; add `/demo` + landing CTA; add `/api/stimulus/inspect` + the `storm/new` helper; seed demo credits on signup. Playwright demo smoke.
4. **Tour + polish.** Add `driver.js`; build `Tour.tsx` + `lib/tour/steps.ts`; add `data-tour` attrs; add the Topbar "?" button, `GridLegend`, `HowItWorks`, skeletons, "Reconnecting..." state, welcome toast, micro-interactions (all reduced-motion aware); copy edits (no hardcoded counts).
5. **Tests / coverage finalize.** Wire the pre-baked demo report JSON as the canonical fixture; land the RTL component tests and the Playwright smoke; confirm the stated coverage stance (100% branch on pure derivation, smoke-level on UI) and that the Python suite remains green.
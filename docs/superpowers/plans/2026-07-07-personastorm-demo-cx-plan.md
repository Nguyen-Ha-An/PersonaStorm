# PersonaStorm Demo/Portfolio CX Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

## Goal

Turn PersonaStorm into a recruiter-ready portfolio demo by adding a frictionless public no-signup live demo, a verdict-first report, and a guided tour, all as additive UX layers over the existing engine without altering any numeric output.

## Architecture

All work is an additive UX layer inside `apps/web`, organized as three workstreams: (1) frictionless entry (public `/demo` streamed via `is_demo` rows + anonymous-read RLS), (2) verdict-first report (a new isomorphic `verdict.ts` that *derives* a verdict and top actions from existing report fields rather than re-inferring anything), and (3) guided tour plus polish (driver.js). The engine's scoring, inference, and quality outputs are reused verbatim; the demo replays a pre-seeded 1000-persona run through the existing streaming path.

## Tech Stack

Node 18.17+ / Next.js 14 App Router / TypeScript / Tailwind / Supabase (Postgres + GoTrue) / driver.js (tour) / Vitest + React Testing Library (unit) / Playwright (one smoke test).

## Global Constraints

- **Runtime:** Node 18.17+, Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres + GoTrue).
- **Additive only:** All work is UX-layer in `apps/web` and ADDITIVE — never delete existing report depth or engine behavior.
- **No payments:** Do NOT build or optimize any pricing/purchase/buy-credits surface. Seeded demo credits are an activation aid, not payments.
- **No engine-number changes:** Do NOT change engine numeric outputs (scoring/inference/quality). REUSE engine constants `GREEN_THRESHOLD = 0.62` and `RED_THRESHOLD = 0.38` verbatim.
- **Do not touch `apps/api`:** The Python FastAPI backend is out of scope.
- **One isomorphic module:** `verdict.ts` is the ONLY new server+client engine module. `stimulusParser` stays server-only, reached via a server route.
- **Copy has no hardcoded counts:** No hardcoded persona counts ("1000 personas") or panel counts ("20 panels") in user-facing copy — use dynamic `persona_count`; say "the full diagnostic breakdown (every panel)". There are 17 report components; never assert a panel count in copy.
- **New dependency:** `driver.js` for the tour.
- **Test runners:** Vitest (unit + React Testing Library) and Playwright (one smoke test).
- **Coverage target:** 100% BRANCH coverage on `verdict.ts` and the `selectTopActions` logic.
- **Naming:** PascalCase components/types, camelCase functions/vars, UPPER_SNAKE_CASE constants, `use`-prefixed hooks.

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `apps/web/lib/server/demo.ts` | Client-safe demo config: `DEMO_STORM_ID = "demo-personapilot"`, `DEMO_SIGNUP_CREDITS` constant. |
| `apps/web/lib/server/engine/verdict.ts` | Isomorphic `deriveVerdict` + `selectTopActions`; totality-safe verdict/top-action derivation. |
| `apps/web/lib/server/engine/verdict.test.ts` | Vitest branch coverage (100%) for `deriveVerdict`, including caveat-cap cases. |
| `apps/web/lib/server/engine/topActions.test.ts` | Vitest branch coverage (100%) for `selectTopActions`, padding ladder, and all-strong branch. |
| `apps/web/components/report/VerdictBanner.tsx` | Verdict-first banner (level color + caveat augmentation). |
| `apps/web/components/report/TopActions.tsx` | Top-3 action cards linking to unique anchor ids. |
| `apps/web/components/report/AtAGlance.tsx` | Verdict-first at-a-glance summary block. |
| `apps/web/components/report/VerdictBanner.test.tsx` / `TopActions.test.tsx` / `AtAGlance.test.tsx` | React Testing Library tests for the new report components. |
| `apps/web/components/storm/GridLegend.tsx` | Persona-grid status legend (green/yellow/red). |
| `apps/web/components/HowItWorks.tsx` | "How it works" explainer for entry/landing. |
| `apps/web/components/Tour.tsx` | driver.js tour mount and lifecycle. |
| `apps/web/lib/tour/steps.ts` | Tour step definitions (selectors + copy). |
| `apps/web/app/demo/route.ts` | `/demo` route redirecting to `/storm/${DEMO_STORM_ID}`. |
| `apps/web/app/api/stimulus/inspect/route.ts` | Server-only route running `stimulusParser`, returns detected signals JSON. |
| `apps/web/scripts/seed_demo_storm.ts` | Seeds/upserts the `is_demo=true` 1000-persona demo storm with verdict + top actions. |
| `supabase/migrations/2026XXXXXXXXXX_demo_read_only.sql` | Anon-read RLS on storm-runs + stream-events tables; idempotent post-signup credit-grant trigger. |
| `apps/web/vitest.config.ts` | Vitest config + test setup. |
| `apps/web/e2e/demo.spec.ts` | Playwright smoke test for the public demo flow. |

### Edited files

| File | Change |
|------|--------|
| `apps/web/lib/server/engine/report.ts` | Attach derived `verdict` + `top_actions` at report build time. |
| `apps/web/lib/server/engine/types.ts` | Add `Verdict` and `TopAction` types. |
| `apps/web/lib/types.ts` | Surface `Verdict`/`TopAction` in shared client types. |
| `packages/schemas/report.schema.json` | Add `verdict` + `top_actions` to the report schema. |
| `apps/web/app/(app)/storm/[id]/report/page.tsx` | Verdict-first restructure, unique anchors, client fallback ladder, auto-expand on navigation. |
| `apps/web/lib/server/stormStore.ts` | `is_demo` bypass in `getStormReport`/`getStreamData` retrieval. |
| `apps/web/app/api/storm/[id]/stream/route.ts` | Use anon Supabase client when no session (demo replay). |
| `apps/web/app/(app)/storm/[id]/page.tsx` | Mount `GridLegend`, add `data-tour` targets, mount `Tour`. |
| `apps/web/app/(app)/storm/new/page.tsx` | Stimulus helper wired to `/api/stimulus/inspect`. |
| `apps/web/components/dashboard/Topbar.tsx` | "?" control to relaunch the tour. |
| `apps/web/app/(app)/dashboard/page.tsx` | Welcome toast reading the actual granted credit balance. |
| `apps/web/app/page.tsx` | "Watch it live" CTA into the public demo. |
| `apps/web/package.json` | Add `driver.js`, Vitest/Playwright deps, and test scripts. |

## Build Order

Phases 0 → 6 are sequential: **Phase 0** (tooling/deps, the `Verdict`/`TopAction` types, the `report.schema.json` additions, and the Vitest runner) must land before any test-driven phase; **Phase 1** (the isomorphic `verdict.ts` — `deriveVerdict` + `selectTopActions` + build-time attach into `report.ts`) is the foundation every report change consumes; **Phase 2** (verdict-first report UI + client fallback) renders those derived fields; **Phase 3** (public demo: `is_demo` + anon RLS + seed script + anon streaming) and **Phase 4** (signup credits, stimulus helper, landing CTA) depend on the demo id and the attached fields; **Phase 5** (guided tour + polish) targets the finished UI; **Phase 6** (E2E smoke + final verification) validates the whole assembled flow.

---

## Phase 0 - Foundations (shared constants, types/schema, Vitest)

This phase lands the shared primitives every later phase imports: the demo id / signup-credit constants, the `Verdict` / `TopAction` types (server + client mirror), the `report.schema.json` additions, and a working Vitest + React Testing Library runner proven by a trivial green test. No engine numbers change; no runtime behavior ships yet.

**Inherited global constraints (apply to every task below):**
- Node 18.17+; Next.js 14 App Router; TypeScript; Tailwind; Supabase. All work is UX-layer in `apps/web`, additive.
- Do NOT build any pricing/purchase surface. Do NOT change engine numeric outputs. Do NOT touch `apps/api`. Reuse `GREEN_THRESHOLD = 0.62` / `RED_THRESHOLD = 0.38` verbatim (they already live in `apps/web/lib/server/engine/types.ts`; this phase does not redefine them).
- `apps/web/lib/server/demo.ts` is client-safe (no server-only imports). `verdict.ts` is the only new isomorphic module (it arrives in Phase 1; this phase only declares its types).
- Naming: PascalCase types, camelCase functions/vars, UPPER_SNAKE_CASE constants.
- No hardcoded persona/panel counts in user-facing copy.

**Shell:** the session shell is Windows PowerShell. Every command block below runs as-is in PowerShell — `npm`, `npx`, `git`, and `findstr` are all PowerShell-safe. There is no POSIX `grep` on this machine; use `findstr` where a file search is shown. Commands are one-per-line and execute sequentially.

**Working directory convention:** the repo root is `C:\Users\Admin\Downloads\amd`. Unless a step says otherwise, run every `npm` / `npx` / `findstr` command **from `apps/web/`** (PowerShell: `Set-Location apps/web` first) so Vitest's `process.cwd()` is `apps/web`. Run `git` commands from the repo root.

**Import convention (single, plan-wide):** Phase 0 configures Vitest via `vite-tsconfig-paths`, and Task 0.2 ensures `apps/web/tsconfig.json` declares `baseUrl: "."` **and** `paths: { "@/*": ["./*"] }`. That makes BOTH import styles resolve everywhere — bare root-relative (`lib/...`, `components/...`, `test/...`) via `baseUrl`, and `@/`-prefixed (`@/lib/...`, `@/components/...`) via `paths`. No later phase needs to rewrite imports or re-map aliases; this is the one alias mechanism for the whole plan.

**Config ownership:** `apps/web/vitest.config.ts` is authored ONCE here (Task 0.2), including the coverage gate. Later phases (2, 5) may **Edit** it to add fixtures or setup, but must **never overwrite** it and must preserve the `coverage.include` + `thresholds` block and both plugins.

**Coverage note:** `vitest.config.ts` is authored in this phase with the 100%-branch gate on `lib/server/engine/verdict.ts` (which contains both `deriveVerdict` and `selectTopActions`), but that file does not exist until Phase 1. Therefore Phase 0 verifies the runner with `npm test` (not `npm run test:coverage`). `npm run test:coverage` becomes meaningful the moment `verdict.ts` lands in Phase 1.

---

### Task 0.1 - Install Vitest + React Testing Library + jsdom

Add the test-runner toolchain to `apps/web` as dev dependencies and register the `test` scripts. No config yet — just the deps and scripts, verified by `vitest --version`.

**Files**
- Modify: `apps/web/package.json` (devDependencies + scripts), `apps/web/package-lock.json` (generated)

**Interfaces**
- Consumes: npm registry (`vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/*`, `@vitejs/plugin-react`, `vite-tsconfig-paths`)
- Produces: npm scripts `test` → `vitest run`, `test:watch` → `vitest`, `test:coverage` → `vitest run --coverage` (Note: the coverage script is named `test:coverage` — every later phase's coverage gate MUST call `npm run test:coverage`, never `test:cov`.)

Steps:

- [ ] From `apps/web/`, install the dev dependencies (pinned for Node 18.17 compatibility):

```powershell
npm install -D vitest@2.1.8 @vitest/coverage-v8@2.1.8 jsdom@25.0.1 @testing-library/react@16.0.1 @testing-library/jest-dom@6.6.3 @testing-library/user-event@14.5.2 @vitejs/plugin-react@4.3.4 vite-tsconfig-paths@5.1.4
```

Expected output ends with a line similar to:

```
added 9 packages, and audited N packages in Xs
```

- [ ] Add the three test scripts to `apps/web/package.json`. Open the existing `"scripts"` object and add these keys (keep all existing scripts intact):

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
```

- [ ] From `apps/web/`, confirm the runner binary resolves:

```powershell
npx vitest --version
```

Expected output:

```
2.1.8
```

- [ ] Commit (from repo root):

```powershell
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore: add vitest, react-testing-library and jsdom to apps/web"
```

---

### Task 0.2 - Configure Vitest (jsdom) and prove the runner with a smoke test

Ensure the `@/` + bare import aliases resolve, then author `vitest.config.ts` (jsdom, tsconfig path aliases, coverage gate on the future `verdict.ts`), a jsdom setup file, and one trivial passing test. This is the "the runner works" checkpoint and the canonical config for the whole plan.

**Files**
- Modify: `apps/web/tsconfig.json` (ensure `baseUrl` + `@/*` path)
- Create: `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `apps/web/lib/smoke.test.ts`

**Interfaces**
- Consumes: `vitest/config` (`defineConfig`), `@vitejs/plugin-react` (`react`), `vite-tsconfig-paths` (`tsconfigPaths`), `@testing-library/react` (`cleanup`), `@testing-library/jest-dom/vitest`
- Produces: Vitest config (`test.environment='jsdom'`, `test.include='{lib,components,app}/**/*.test.{ts,tsx}'`, coverage v8 with per-file 100%-branch gate on `lib/server/engine/verdict.ts`); tsconfig that resolves both `lib/...` (via `baseUrl`) and `@/...` (via `paths`).

Steps:

- [ ] Ensure the alias mechanism is present so every later phase's imports resolve (both `lib/...` and `@/lib/...`). From `apps/web/`, check the current tsconfig:

```powershell
findstr /n "baseUrl paths @/*" tsconfig.json
```

Expected output on a default Next.js 14 scaffold (line numbers vary):

```
NN:    "baseUrl": ".",
NN:    "paths": {
NN:      "@/*": ["./*"]
```

If any of those three lines is missing, open `apps/web/tsconfig.json` and ensure `compilerOptions` contains exactly this (merge into the existing `compilerOptions`; do not duplicate keys):

```json
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
```

- [ ] Create `apps/web/vitest.config.ts` (the single canonical config — later phases Edit, never overwrite, and must keep the `coverage` block and both plugins):

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // tsconfigPaths honors tsconfig `baseUrl` + `paths`, so BOTH `lib/...` and
  // `@/lib/...` imports resolve under Vitest. Do not replace this with a manual
  // resolve.alias map — that would drop `@/` resolution used from Phase 3 on.
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{lib,components,app}/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Correctness-critical pure logic (Workstream 2). `verdict.ts` holds BOTH
      // deriveVerdict AND selectTopActions and lands in Phase 1; from then on
      // `npm run test:coverage` enforces 100% branch on it. This block is the
      // R12 enforcement mechanism — never delete it in a later phase.
      include: ['lib/server/engine/verdict.ts'],
      thresholds: {
        'lib/server/engine/verdict.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
})
```

- [ ] Create `apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees between tests (used from Phase 2 component tests onward).
afterEach(() => {
  cleanup()
})
```

- [ ] Create `apps/web/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest runner smoke test', () => {
  it('executes and evaluates assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})
```

- [ ] From `apps/web/`, run the suite:

```powershell
npm test
```

Expected output (trimmed):

```
 ✓ lib/smoke.test.ts (2 tests) Xms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit (from repo root):

```powershell
git add apps/web/tsconfig.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/lib/smoke.test.ts
git commit -m "test: configure vitest (jsdom) with a passing smoke test"
```

---

### Task 0.3 - Add demo constants (`lib/server/demo.ts`) — TDD

Create the single source of truth for the demo storm id and the signup credit grant. **This module is the ONLY place `DEMO_SIGNUP_CREDITS` / `MAX_RUN_CREDIT_COST` are defined in the entire plan.** Phase 4's signup migration and the dashboard welcome toast CONSUME this value (they must never re-declare or re-hardcode it). Client-safe (imported by `/demo`, the seed script, and the dashboard toast).

**Sizing rationale (R15, single source of truth):** `MAX_RUN_CREDIT_COST` is the **credit cost** of the largest run (the 1200-persona option on `storm/new`), which quotes **120 credits** in the create-page price preview — it is a credit cost, NOT the persona count. `DEMO_SIGNUP_CREDITS = 2 × MAX_RUN_CREDIT_COST = 240`, satisfying the spec's "≥ 2× a 1200-persona run" (§9.4). Phase 4's migration literal and its sync test read `240` from this same derivation; nothing downstream re-hardcodes a credit number.

**Files**
- Create: `apps/web/lib/server/demo.ts`
- Test: `apps/web/lib/server/demo.test.ts`

**Interfaces**
- Consumes: nothing (plain constants; no server-only imports)
- Produces: `DEMO_STORM_ID: string` (`'demo-personapilot'`), `MAX_RUN_CREDIT_COST: number` (`120`), `DEMO_SIGNUP_CREDITS: number` (`= MAX_RUN_CREDIT_COST * 2` = `240`)

Steps:

- [ ] Write the failing test first — create `apps/web/lib/server/demo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEMO_STORM_ID, DEMO_SIGNUP_CREDITS, MAX_RUN_CREDIT_COST } from './demo'

// Independent literal encoding the real requirement (R15): the credit COST of
// the largest (1200-persona) run per the create-page price preview. Held
// SEPARATE from the module's own derivation so a change to demo.ts is actually
// caught rather than trivially satisfied (avoids a tautological assertion).
const LARGEST_RUN_CREDIT_COST = 120

describe('demo constants', () => {
  it('pins DEMO_STORM_ID to the fixed demo id', () => {
    expect(DEMO_STORM_ID).toBe('demo-personapilot')
  })

  it('models MAX_RUN_CREDIT_COST as the 1200-persona run credit cost', () => {
    expect(MAX_RUN_CREDIT_COST).toBe(LARGEST_RUN_CREDIT_COST)
  })

  it('grants at least 2x the cost of a 1200-persona run on signup (R15)', () => {
    expect(DEMO_SIGNUP_CREDITS).toBeGreaterThanOrEqual(2 * LARGEST_RUN_CREDIT_COST)
  })

  it('pins the signup grant to the derived value so downstream drift is caught', () => {
    expect(DEMO_SIGNUP_CREDITS).toBe(240)
  })

  it('sizes the signup grant to a whole number of credits', () => {
    expect(Number.isInteger(DEMO_SIGNUP_CREDITS)).toBe(true)
  })
})
```

- [ ] From `apps/web/`, run it and see it FAIL (module does not exist yet):

```powershell
npx vitest run lib/server/demo.test.ts
```

Expected output includes:

```
Error: Failed to load url ./demo (resolved id: .../lib/server/demo) ...
 Test Files  1 failed (1)
```

- [ ] Create `apps/web/lib/server/demo.ts`:

```ts
/**
 * Demo / activation constants — the single source of truth for the public,
 * no-signup demo run and the one-time signup credit grant.
 *
 * IMPORTANT: this module is imported from BOTH client and server code
 * (app/demo/route.ts, scripts/seed_demo_storm.ts, the dashboard welcome toast,
 * and — indirectly, via this value — the signup-credit Supabase migration).
 * Keep it free of any server-only imports (no `fs`, no Supabase server client,
 * no Node-only APIs) so it stays safe to bundle into the browser.
 */

/**
 * Fixed storm_id for the pre-baked PersonaPilot demo run. Both
 * `scripts/seed_demo_storm.ts` (seed target) and `app/demo/route.ts`
 * (redirect target) import this so the seeded row and the redirect can
 * never diverge.
 */
export const DEMO_STORM_ID = 'demo-personapilot'

/**
 * Credit COST of the LARGEST run a user can launch — the 1200-persona option
 * on `storm/new`, the most expensive persona-count under the current price
 * table. This is a CREDIT COST, not a persona count: a 1200-persona run quotes
 * 120 credits in the create-page price preview.
 *
 * SINGLE SOURCE OF TRUTH for run cost. If the price table ever changes, update
 * THIS one literal to the real quote for a 1200-persona run — the derivation
 * below and every downstream consumer (Phase 4 migration literal, welcome
 * toast) follow automatically. Nothing else in the codebase re-hardcodes a
 * credit number.
 */
export const MAX_RUN_CREDIT_COST = 120

/**
 * One-time onboarding grant seeded into a new user's wallet on signup so the
 * first real run never hits the credit wall. Sized at 2x the cost of the
 * largest possible run so ANY persona-count selection (100/250/500/1000/1200)
 * clears the atomic wallet debit with margin.
 *
 * Activation aid ONLY — not a payments/purchase surface. Credits remain
 * admin-granted; this is a single onboarding grant applied once per user id.
 *
 * Derivation: DEMO_SIGNUP_CREDITS = 2 * MAX_RUN_CREDIT_COST = 240
 * (>= 2x a 1200-persona run, per R15 / spec §9.4).
 */
export const DEMO_SIGNUP_CREDITS = MAX_RUN_CREDIT_COST * 2
```

- [ ] From `apps/web/`, run it and see it PASS:

```powershell
npx vitest run lib/server/demo.test.ts
```

Expected output:

```
 ✓ lib/server/demo.test.ts (5 tests) Xms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

- [ ] Commit (from repo root):

```powershell
git add apps/web/lib/server/demo.ts apps/web/lib/server/demo.test.ts
git commit -m "feat: add DEMO_STORM_ID and DEMO_SIGNUP_CREDITS demo constants"
```

---

### Task 0.4 - Add `Verdict` / `TopAction` types to the engine (`lib/server/engine/types.ts`)

Declare the server-side derivation types next to the existing engine constants. Verified by a compile-time (`.test-d.ts`) check driven with `tsc --noEmit` (RED → GREEN). This task only ADDS type exports; it does not touch the engine report interface — the report-shape wiring (`attachVerdictAndActions<T extends DerivableReport>`) is Phase 1's concern, and the client report interface gains the optional fields in Task 0.5.

**Files**
- Modify: `apps/web/lib/server/engine/types.ts` (append type declarations only)
- Test: `apps/web/lib/server/engine/verdict.types.test-d.ts` (compile-time only; not executed by Vitest)

**Interfaces**
- Consumes: nothing (pure type declarations)
- Produces: `type VerdictLevel = 'strong' | 'conditional' | 'weak'`; `interface Verdict { level; headline; rationale; caveated }`; `interface TopActionEvidence { stat: string; quote?: string }`; `interface TopAction { rank; imperative; why; evidence?; anchorId }`. (Consumed in Phase 1 by `verdict.ts` and `report.ts`.)

Steps:

- [ ] Write the failing compile check first — create `apps/web/lib/server/engine/verdict.types.test-d.ts`:

```ts
import type { Verdict, TopAction } from './types'

// Compile-time shape assertions — checked by `tsc --noEmit`, never executed.
// The filename ends in `.test-d.ts`, so Vitest's `*.test.{ts,tsx}` glob (which
// only matches files ending exactly `.test.ts` / `.test.tsx`) ignores it.
const _verdict: Verdict = {
  level: 'strong',
  headline: 'Strong signal - worth building',
  rationale: '72% market fit, high confidence; intent at 58%.',
  caveated: false,
}

const _actionWithEvidence: TopAction = {
  rank: 1,
  imperative: 'Address the top objection',
  why: 'It is holding intent down.',
  evidence: { stat: '42%', quote: 'Too expensive to justify' },
  anchorId: '#objections',
}

// DEFAULT branch: `evidence` omitted must still satisfy the type.
const _actionNoEvidence: TopAction = {
  rank: 2,
  imperative: 'Review the full diagnostics',
  why: 'No single blocker dominates.',
  anchorId: '#full-diagnostics',
}

void _verdict
void _actionWithEvidence
void _actionNoEvidence
```

- [ ] From `apps/web/`, run the type check and see it FAIL (types not exported yet):

```powershell
npx tsc --noEmit
```

Expected output contains a line like:

```
lib/server/engine/verdict.types.test-d.ts(1,20): error TS2305: Module '"./types"' has no exported member 'Verdict'.
```

- [ ] Append the type declarations to the end of `apps/web/lib/server/engine/types.ts` (do not modify the existing `GREEN_THRESHOLD` / `RED_THRESHOLD` / `statusFor` exports; do not touch any report interface here):

```ts
/**
 * Plain-language verdict DERIVED (never re-inferred) from the already-final
 * report. Produced by lib/server/engine/verdict.ts (deriveVerdict) at build
 * time and persisted onto the report as `report.verdict`.
 */
export type VerdictLevel = 'strong' | 'conditional' | 'weak'

export interface Verdict {
  level: VerdictLevel
  headline: string
  rationale: string
  caveated: boolean
}

/**
 * Evidence attached to a Top-3 action. `stat` is a PREFORMATTED display string
 * (e.g. "42%", "~$48") rendered verbatim by components and tests.
 */
export interface TopActionEvidence {
  stat: string
  quote?: string
}

/**
 * One enriched, scroll-linked next action. Produced by selectTopActions.
 * `evidence` is intentionally optional: the DEFAULT (no-keyword-match) branch
 * omits it (anchorId "#full-diagnostics"). `anchorId` is always present.
 */
export interface TopAction {
  rank: number
  imperative: string
  why: string
  evidence?: TopActionEvidence
  anchorId: string
}
```

- [ ] From `apps/web/`, re-run the type check and see it PASS (no error referencing `Verdict`/`TopAction`):

```powershell
npx tsc --noEmit
```

Expected: exit code `0`, no output. (If pre-existing unrelated errors surface, confirm none reference `Verdict`, `TopAction`, or `verdict.types.test-d.ts`.)

- [ ] Commit (from repo root):

```powershell
git add apps/web/lib/server/engine/types.ts apps/web/lib/server/engine/verdict.types.test-d.ts
git commit -m "feat: add Verdict and TopAction engine types"
```

---

### Task 0.5 - Mirror `Verdict` / `TopAction` in the client types (`lib/types.ts`)

Add the client-facing mirror so `report/page.tsx` and the new report components (Phase 2) are typed, and extend the client report shape with the two optional fields (client fallback path reads them when present, recomputes when absent).

**Files**
- Modify: `apps/web/lib/types.ts` (append mirror types + extend the `Report` interface)
- Test: `apps/web/lib/types.test-d.ts` (compile-time only)

**Interfaces**
- Consumes: nothing (pure type declarations)
- Produces: client mirror `type VerdictLevel`, `interface Verdict`, `interface TopActionEvidence`, `interface TopAction` (identical shapes to the engine types), plus optional `verdict?: Verdict` / `top_actions?: TopAction[]` on the client `Report` interface. (`Report` is structurally assignable to Phase 1's `DerivableReport`, so components may pass a `Report` to `deriveVerdict` / `selectTopActions`.)

Steps:

- [ ] Write the failing compile check first — create `apps/web/lib/types.test-d.ts`:

```ts
import type { Verdict, TopAction } from './types'

// Compile-time shape assertions — checked by `tsc --noEmit`, never executed.
const _verdict: Verdict = {
  level: 'conditional',
  headline: 'Promising - fix these first',
  rationale: '55% market fit, medium confidence; intent at 40%.',
  caveated: true,
}

const _action: TopAction = {
  rank: 1,
  imperative: 'Fix pricing friction',
  why: 'Willingness drops below half above the crossover price.',
  evidence: { stat: '~$48' },
  anchorId: '#pricing',
}

void _verdict
void _action
```

- [ ] From `apps/web/`, run the type check and see it FAIL:

```powershell
npx tsc --noEmit
```

Expected output contains:

```
lib/types.test-d.ts(1,20): error TS2305: Module '"./types"' has no exported member 'Verdict'.
```

- [ ] Append the client mirror types to the end of `apps/web/lib/types.ts` (identical shapes to the engine types — the client fallback in Phase 2 must produce the same objects):

```ts
/**
 * Client-facing mirror of the engine's derivation types
 * (lib/server/engine/types.ts). Kept identical so the isomorphic
 * deriveVerdict / selectTopActions fallback in report/page.tsx yields the
 * exact same shapes the server persisted.
 */
export type VerdictLevel = 'strong' | 'conditional' | 'weak'

export interface Verdict {
  level: VerdictLevel
  headline: string
  rationale: string
  caveated: boolean
}

export interface TopActionEvidence {
  stat: string
  quote?: string
}

export interface TopAction {
  rank: number
  imperative: string
  why: string
  evidence?: TopActionEvidence
  anchorId: string
}
```

- [ ] Locate the exact insertion point for the two optional report fields. From `apps/web/`:

```powershell
findstr /n "persona_count" lib\types.ts
```

Expected output (one line inside the `Report` interface; line number varies):

```
NN:  persona_count: number
```

- [ ] In the `Report` interface (the block that declares `persona_count`, `stimulus_type`, `target_market`), insert these two optional fields on the line immediately AFTER the `persona_count: number` member (both optional — legacy runs and in-progress builds may lack them):

```ts
  verdict?: Verdict
  top_actions?: TopAction[]
```

- [ ] From `apps/web/`, re-run the type check and see it PASS:

```powershell
npx tsc --noEmit
```

Expected: exit code `0`, no output referencing `Verdict`/`TopAction`.

- [ ] Commit (from repo root):

```powershell
git add apps/web/lib/types.ts apps/web/lib/types.test-d.ts
git commit -m "feat: mirror Verdict and TopAction client types with optional report fields"
```

---

### Task 0.6 - Add `verdict` / `top_actions` to `report.schema.json` — TDD

Extend the report JSON Schema so the seeded demo report (Phase 3) and the JSON export validate with the new fields. Both fields are optional (legacy runs lack them). Driven by a Vitest test that reads the schema from disk.

**This is the ONE and ONLY place `verdict` / `top_actions` are added to `report.schema.json`.** Phase 1's `report.ts` wiring task must NOT re-insert these properties (doing so would create duplicate JSON keys). The shapes below (with `additionalProperties: false`) are canonical.

**Files**
- Modify: `packages/schemas/report.schema.json`
- Test: `apps/web/lib/server/reportSchema.test.ts`

**Interfaces**
- Consumes: `node:fs` (`readFileSync`), `node:path` (`resolve`); the schema is read from `<repo>/packages/schemas/report.schema.json` via `resolve(process.cwd(), '../../packages/schemas/report.schema.json')` (Vitest cwd is `apps/web`).
- Produces: JSON Schema `properties.verdict` (object, enum level, 4 required subfields, `additionalProperties: false`) and `properties.top_actions` (array, `maxItems: 3`, item with `anchorId` and optional `evidence.stat`, `additionalProperties: false`). Neither is added to top-level `required`.

Steps:

- [ ] Write the failing test first — create `apps/web/lib/server/reportSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const schema = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../packages/schemas/report.schema.json'),
    'utf8',
  ),
) as { properties: Record<string, any>; required?: string[] }

describe('report.schema.json — verdict & top_actions', () => {
  it('declares a verdict object with level/headline/rationale/caveated', () => {
    const verdict = schema.properties.verdict
    expect(verdict).toBeDefined()
    expect(verdict.type).toBe('object')
    expect(verdict.additionalProperties).toBe(false)
    expect(verdict.properties.level.enum).toEqual([
      'strong',
      'conditional',
      'weak',
    ])
    expect(Object.keys(verdict.properties).sort()).toEqual([
      'caveated',
      'headline',
      'level',
      'rationale',
    ])
  })

  it('declares top_actions as an array capped at 3 enriched items', () => {
    const top = schema.properties.top_actions
    expect(top).toBeDefined()
    expect(top.type).toBe('array')
    expect(top.maxItems).toBe(3)
    expect(top.items.additionalProperties).toBe(false)
    expect(top.items.properties.anchorId.type).toBe('string')
    expect(top.items.properties.evidence.properties.stat.type).toBe('string')
  })

  it('keeps verdict & top_actions optional (not in top-level required)', () => {
    expect(schema.required ?? []).not.toContain('verdict')
    expect(schema.required ?? []).not.toContain('top_actions')
  })
})
```

- [ ] From `apps/web/`, run it and see it FAIL (`verdict`/`top_actions` not in schema yet):

```powershell
npx vitest run lib/server/reportSchema.test.ts
```

Expected output includes:

```
 FAIL  lib/server/reportSchema.test.ts > report.schema.json — verdict & top_actions > declares a verdict object ...
 → Cannot read properties of undefined (reading 'type')
 Test Files  1 failed (1)
```

- [ ] Edit `packages/schemas/report.schema.json`. Inside the top-level `"properties"` object (add as siblings of the existing fields — e.g. immediately after the `"persona_count"` property), insert these two properties. Do **not** add them to the top-level `"required"` array. Ensure the surrounding commas remain valid JSON:

```json
    "verdict": {
      "type": "object",
      "required": ["level", "headline", "rationale", "caveated"],
      "additionalProperties": false,
      "properties": {
        "level": { "type": "string", "enum": ["strong", "conditional", "weak"] },
        "headline": { "type": "string" },
        "rationale": { "type": "string" },
        "caveated": { "type": "boolean" }
      }
    },
    "top_actions": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["rank", "imperative", "why", "anchorId"],
        "additionalProperties": false,
        "properties": {
          "rank": { "type": "integer", "minimum": 1, "maximum": 3 },
          "imperative": { "type": "string" },
          "why": { "type": "string" },
          "evidence": {
            "type": "object",
            "required": ["stat"],
            "additionalProperties": false,
            "properties": {
              "stat": { "type": "string" },
              "quote": { "type": "string" }
            }
          },
          "anchorId": { "type": "string" }
        }
      }
    },
```

- [ ] From `apps/web/`, run it and see it PASS:

```powershell
npx vitest run lib/server/reportSchema.test.ts
```

Expected output:

```
 ✓ lib/server/reportSchema.test.ts (3 tests) Xms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] From `apps/web/`, run the full Phase 0 suite to confirm everything is green together:

```powershell
npm test
```

Expected output (trimmed):

```
 ✓ lib/smoke.test.ts (2 tests)
 ✓ lib/server/demo.test.ts (5 tests)
 ✓ lib/server/reportSchema.test.ts (3 tests)

 Test Files  3 passed (3)
      Tests  10 passed (10)
```

- [ ] Commit (from repo root):

```powershell
git add packages/schemas/report.schema.json apps/web/lib/server/reportSchema.test.ts
git commit -m "feat: add optional verdict and top_actions fields to report schema"
```

**Phase 0 exit criteria:** `npm test` (from `apps/web/`) reports 3 files / 10 tests passing (smoke 2, demo 5, schema 3); `npx tsc --noEmit` is clean; `lib/server/demo.ts` exports `DEMO_STORM_ID`, `MAX_RUN_CREDIT_COST` (`120`), and `DEMO_SIGNUP_CREDITS` (`240`) as the single source of truth (no later phase re-declares them); `Verdict` / `TopAction` exist in both `lib/server/engine/types.ts` and `lib/types.ts`; `report.schema.json` carries optional `verdict` / `top_actions` (canonical, added exactly once); `apps/web/tsconfig.json` resolves both `lib/...` and `@/...` imports; `vitest.config.ts` is the canonical config with the 100%-branch coverage gate wired on `lib/server/engine/verdict.ts` (activates in Phase 1 when `verdict.ts` lands).

---

## Phase 1 - Verdict engine (deriveVerdict + selectTopActions)

The crown jewel: a new **pure, isomorphic, TOTAL** module `apps/web/lib/server/engine/verdict.ts` that *derives* a verdict and up to three enriched actions from the fields the report already contains — **no new LLM calls, no engine-number changes**. It imports `GREEN_THRESHOLD` / `RED_THRESHOLD` verbatim from `types.ts` and consumes the `Verdict` / `TopAction` types and the `report.schema.json` additions created in **Phase 0 Task 0.6** (this phase does **not** re-touch `types.ts` or `report.schema.json`, to avoid duplicate declarations).

**Signatures (as consumed by Phase 2):**
- `deriveVerdict(report: DerivableReport): Verdict`
- `selectTopActions(report: DerivableReport): TopAction[]` (length 0–3)
- `attachVerdictAndActions<T extends DerivableReport>(report: T): T & { verdict: Verdict; top_actions: TopAction[] }` (build-time helper, Task 1.3)

`Report`, `Verdict`, and `TopAction` are the types from Phase 0. Phase 1 also defines and exports `DerivableReport` (`Partial<Report>`, to which a full `Report` is assignable). Both derivation functions take a `DerivableReport` and **read every field defensively** (optional chaining + numeric coercion) so a sparse, partial, or legacy report never throws.

---

### Task 1.1: `deriveVerdict` — the headline verdict (TDD)

**Files:**
- Create: `apps/web/lib/server/engine/verdict.ts`
- Test: `apps/web/lib/server/engine/verdict.test.ts`

**Interfaces:**
- Consumes: `GREEN_THRESHOLD` (`0.62`), `RED_THRESHOLD` (`0.38`) from `./types`; `Report`, `Verdict` types from Phase 0. `Verdict = { level: 'strong' | 'conditional' | 'weak'; headline: string; rationale: string; caveated: boolean }`.
- Produces: `export function deriveVerdict(report: DerivableReport): Verdict`.

- [ ] **Step 1: Write the failing test** (`apps/web/lib/server/engine/verdict.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { deriveVerdict } from './verdict';

// Minimal report factory: only the fields deriveVerdict reads. `any` keeps
// tests focused on behavior, not on constructing a full Report.
function report(overrides: any = {}): any {
  return {
    overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: [], top_strengths: [] },
    adoption: { green: 58, yellow: 30, red: 12 },
    quality: { collapse_risk: 'low' },
    top_objections: [],
    ...overrides,
  };
}

describe('deriveVerdict - level', () => {
  it('strong when mfs >= GREEN_THRESHOLD and not caveated', () => {
    expect(deriveVerdict(report({ overall: { market_fit_score: 0.62, confidence: 'high', top_blockers: [], top_strengths: [] } })).level).toBe('strong');
  });

  it('weak when mfs < RED_THRESHOLD', () => {
    expect(deriveVerdict(report({ overall: { market_fit_score: 0.37, confidence: 'high', top_blockers: [], top_strengths: [] } })).level).toBe('weak');
  });

  it('conditional in the middle band', () => {
    expect(deriveVerdict(report({ overall: { market_fit_score: 0.50, confidence: 'high', top_blockers: [], top_strengths: [] } })).level).toBe('conditional');
  });

  // R11 caveat cap: low confidence CANNOT be 'strong' even above GREEN_THRESHOLD
  it('caveat cap: mfs>=0.62 + low confidence + low collapse => conditional', () => {
    const v = deriveVerdict(report({ overall: { market_fit_score: 0.80, confidence: 'low', top_blockers: [], top_strengths: [] }, quality: { collapse_risk: 'low' } }));
    expect(v.level).toBe('conditional');
    expect(v.caveated).toBe(true);
  });

  // R11: collapse='high' forces weak (weak branch fires before conditional), even with high mfs
  it('collapse=high => weak even with mfs>=0.62', () => {
    const v = deriveVerdict(report({ overall: { market_fit_score: 0.80, confidence: 'high', top_blockers: [], top_strengths: [] }, quality: { collapse_risk: 'high' } }));
    expect(v.level).toBe('weak');
    expect(v.caveated).toBe(true);
  });

  it('medium collapse caveats but does not force weak', () => {
    const v = deriveVerdict(report({ overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: [], top_strengths: [] }, quality: { collapse_risk: 'medium' } }));
    expect(v.level).toBe('conditional');
    expect(v.caveated).toBe(true);
  });
});

describe('deriveVerdict - totality (never throws, R9 defaults)', () => {
  it('missing/NaN market_fit_score => 0 => weak', () => {
    const v = deriveVerdict({} as any);
    expect(v.level).toBe('weak');
  });
  it('missing confidence => low => caveated', () => {
    const v = deriveVerdict({ overall: { market_fit_score: 0.9, top_blockers: [], top_strengths: [] }, adoption: { green: 1, yellow: 0, red: 0 }, quality: { collapse_risk: 'low' } } as any);
    expect(v.caveated).toBe(true);
    expect(v.level).toBe('conditional');
  });
  it('missing collapse_risk => treated non-low => caveated but not forced weak', () => {
    const v = deriveVerdict({ overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: [], top_strengths: [] }, adoption: { green: 5, yellow: 3, red: 2 } } as any);
    expect(v.caveated).toBe(true);
    expect(v.level).toBe('conditional');
  });
});

describe('deriveVerdict - rationale (R10, four canonical renderings)', () => {
  const base = { overall: { market_fit_score: 0.72, confidence: 'high' }, adoption: { green: 58, yellow: 30, red: 12 }, quality: { collapse_risk: 'low' } };
  it('all present', () => {
    const v = deriveVerdict({ ...base, overall: { ...base.overall, top_strengths: ['clear value proposition'], top_blockers: ['pricing friction'] }, top_objections: [{ label: 'Too expensive to justify' }] } as any);
    expect(v.rationale).toBe("72% market fit, high confidence — clear value proposition, but pricing friction and 'Too expensive to justify' are holding intent at 58%.");
  });
  it('no strength', () => {
    const v = deriveVerdict({ ...base, overall: { ...base.overall, top_strengths: [], top_blockers: ['pricing friction'] }, top_objections: [{ label: 'Too expensive to justify' }] } as any);
    expect(v.rationale).toBe("72% market fit, high confidence; pricing friction and 'Too expensive to justify' are holding intent at 58%.");
  });
  it('no blocker/objection', () => {
    const v = deriveVerdict({ ...base, overall: { ...base.overall, top_strengths: ['clear value proposition'], top_blockers: [] }, top_objections: [] } as any);
    expect(v.rationale).toBe('72% market fit, high confidence — clear value proposition; intent at 58%.');
  });
  it('all empty', () => {
    const v = deriveVerdict({ ...base, overall: { ...base.overall, top_strengths: [], top_blockers: [] }, top_objections: [] } as any);
    expect(v.rationale).toBe('72% market fit, high confidence; intent at 58%.');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/web; npm run test -- verdict.test.ts`
Expected: FAIL — `Failed to resolve import "./verdict"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation** (`apps/web/lib/server/engine/verdict.ts`)

```ts
import { GREEN_THRESHOLD, RED_THRESHOLD } from './types';
import type { Report, Verdict } from './types';

/**
 * Permissive input for the total derivation functions: a full `Report` is
 * structurally assignable to it, but every field is optional so sparse,
 * partial, or legacy reports are accepted without throwing.
 */
export type DerivableReport = Partial<Report>;

const HEADLINES: Record<Verdict['level'], string> = {
  strong: 'Strong signal - worth building',
  conditional: 'Promising - fix these first',
  weak: 'Weak signal - not yet',
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function deriveVerdict(report: DerivableReport): Verdict {
  const overall = (report?.overall ?? {}) as any;

  // R9: NaN/missing market_fit_score -> 0
  const rawMfs = Number(overall.market_fit_score);
  const mfs = Number.isFinite(rawMfs) ? rawMfs : 0;

  // R9: missing confidence -> 'low'
  const confidence: string = overall.confidence ?? 'low';

  // R9: missing/unknown collapse_risk -> treated as non-low (caveat) but NOT 'high'
  const collapse = report?.quality?.collapse_risk;
  const collapseIsHigh = collapse === 'high';
  const collapseNonLow = collapse !== 'low'; // undefined !== 'low' -> true

  const caveated = confidence === 'low' || collapseNonLow;

  // R9: missing adoption -> intentShare 0
  const g = Number(report?.adoption?.green) || 0;
  const y = Number(report?.adoption?.yellow) || 0;
  const r = Number(report?.adoption?.red) || 0;
  const denom = g + y + r;
  const intentShare = denom > 0 ? g / denom : 0;

  // R11: order matters — strong, then weak, then conditional.
  let level: Verdict['level'];
  if (mfs >= GREEN_THRESHOLD && !caveated) level = 'strong';
  else if (mfs < RED_THRESHOLD || collapseIsHigh) level = 'weak';
  else level = 'conditional';

  // R10: rationale from present clauses only.
  const s1 = `${pct(mfs)} market fit, ${confidence} confidence`;
  const strength: string | undefined = overall.top_strengths?.[0];
  const blocker: string | undefined = overall.top_blockers?.[0];
  const objectionLabel: string | undefined = report?.top_objections?.[0]?.label;

  const bits: string[] = [];
  if (blocker) bits.push(blocker);
  if (objectionLabel) bits.push(`'${objectionLabel}'`);

  let rationale: string;
  if (bits.length > 0) {
    const joined = bits.join(' and ');
    const verb = bits.length > 1 ? 'are' : 'is';
    const lead = strength ? ` — ${strength}, but ` : '; ';
    rationale = `${s1}${lead}${joined} ${verb} holding intent at ${pct(intentShare)}.`;
  } else {
    rationale = strength
      ? `${s1} — ${strength}; intent at ${pct(intentShare)}.`
      : `${s1}; intent at ${pct(intentShare)}.`;
  }

  return { level, headline: HEADLINES[level], rationale, caveated };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/web; npm run test -- verdict.test.ts`
Expected: PASS — all `deriveVerdict` describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server/engine/verdict.ts apps/web/lib/server/engine/verdict.test.ts
git commit -m "feat(report): derive headline verdict from existing report fields"
```

---

### Task 1.2: `selectTopActions` — up to 3 enriched, anchor-linked actions (TDD)

**Files:**
- Modify: `apps/web/lib/server/engine/verdict.ts`
- Test: `apps/web/lib/server/engine/topActions.test.ts`

**Interfaces:**
- Consumes: `Report`, `TopAction` types from Phase 0. `TopAction = { rank: number; imperative: string; why: string; evidence?: { stat: string; quote?: string }; anchorId: string }`.
- Produces: `export function selectTopActions(report: DerivableReport): TopAction[]`.

**Rules encoded (R3/R6/R7/R8):**
- Take the **first 3** already-ranked `recommendations[]`; **never re-sort**.
- Match **case-insensitively** on `title` then `detail`; first precedence rule wins: `objection` → `pricing`/`price` → `proof`/`trust` → `segment` → `collapse`/`quality`/`consensus` → **DEFAULT**.
- Anchors (R4): `#objections`, `#pricing`, `#trust`, `#segments`, `#quality`, DEFAULT `#full-diagnostics`.
- **Pricing crossover (R6):** lowest `price` where `share_willing < 0.5`; else `avg_max_price`.
- **Fallback ladder (R7):** if < 3, pad from `weakest_criteria[]` (`#criteria`) then `next_human_validation[]` (`#next-validation`), **de-duplicated** by imperative.
- **All-strong (R8):** if `top_blockers.length === 0` AND zero `priority === 'now'` recs → rows are `next_human_validation[]` as "Validate before shipping" (`#next-validation`); takes precedence over the normal + padding paths.

- [ ] **Step 1: Write the failing test** (`apps/web/lib/server/engine/topActions.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { selectTopActions } from './verdict';

const rec = (title: string, detail = '', priority = 'now') => ({ title, detail, priority });

describe('selectTopActions - enrichment mapping (R3/R4)', () => {
  it('objection -> #objections with share stat and quote', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Address top objection', 'buyers object to price')],
      top_objections: [{ label: 'Too expensive', share: 0.34, example_quote: 'No way at that price' }],
    } as any);
    expect(a[0].anchorId).toBe('#objections');
    expect(a[0].evidence?.stat).toBe('34%');
    expect(a[0].evidence?.quote).toBe('No way at that price');
  });

  it('pricing -> #pricing with crossover stat (first price where share_willing < 0.5)', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Revisit pricing', 'test lower price points')],
      price_sensitivity: [
        { price: 10, share_willing: 0.9 },
        { price: 30, share_willing: 0.6 },
        { price: 48, share_willing: 0.4 },
        { price: 60, share_willing: 0.2 },
      ],
      avg_max_price: 25,
    } as any);
    expect(a[0].anchorId).toBe('#pricing');
    expect(a[0].evidence?.stat).toBe('~$48');
  });

  it('pricing crossover falls back to avg_max_price when share never drops below 0.5', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Adjust price', '')],
      price_sensitivity: [{ price: 10, share_willing: 0.9 }, { price: 20, share_willing: 0.7 }],
      avg_max_price: 22,
    } as any);
    expect(a[0].evidence?.stat).toBe('~$22');
  });

  it('proof/trust -> #trust with yellow count', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Add proof points', 'need trust signals')],
      adoption: { green: 40, yellow: 35, red: 25 },
    } as any);
    expect(a[0].anchorId).toBe('#trust');
    expect(a[0].evidence?.stat).toBe('35');
  });

  it('segment -> #segments', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Fix weak segment', 'enterprise lags')],
      segments: [{ segment: 'Enterprise', adoption_rate: 0.18 }],
    } as any);
    expect(a[0].anchorId).toBe('#segments');
    expect(a[0].evidence?.stat).toBe('Enterprise: 18%');
  });

  it('collapse/quality -> #quality', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Reduce collapse risk', 'personas converging')],
      quality: { collapse_risk: 'medium' },
    } as any);
    expect(a[0].anchorId).toBe('#quality');
    expect(a[0].evidence?.stat).toBe('collapse risk: medium');
  });

  it('DEFAULT (no keyword) -> #full-diagnostics, evidence omitted', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Do something generic', 'no keyword here')],
    } as any);
    expect(a[0].anchorId).toBe('#full-diagnostics');
    expect(a[0].evidence).toBeUndefined();
    expect(a[0].imperative).toBe('Do something generic');
  });

  it('matches on detail when title has no keyword; precedence objection > pricing', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Improve things', 'the top objection is about pricing')],
      top_objections: [{ label: 'Cost', share: 0.2 }],
    } as any);
    expect(a[0].anchorId).toBe('#objections'); // objection wins over pricing
  });
});

describe('selectTopActions - ranking, cap, fallback (R7)', () => {
  it('takes first 3 recommendations in order, ranks 1..3', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('A objection'), rec('B pricing'), rec('C proof'), rec('D segment')],
      top_objections: [{ label: 'o', share: 0.1 }],
    } as any);
    expect(a.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(a.length).toBe(3);
  });

  it('pads from weakest_criteria BEFORE next_human_validation, de-duplicated', () => {
    const a = selectTopActions({
      overall: { top_blockers: ['x'] },
      recommendations: [rec('Fix pricing', '')],
      weakest_criteria: [{ name: 'Differentiation', score: 0.3 }],
      next_human_validation: [{ question: 'Interview 5 buyers', persona_share: 0.4 }],
    } as any);
    expect(a.length).toBe(3);
    expect(a[0].anchorId).toBe('#pricing');
    expect(a[1].imperative).toBe('Strengthen Differentiation');
    expect(a[1].anchorId).toBe('#criteria');
    expect(a[2].imperative).toBe('Validate before shipping');
    expect(a[2].anchorId).toBe('#next-validation');
  });

  it('renders 1 row cleanly when sources are sparse (<=3 guarantee)', () => {
    const a = selectTopActions({ overall: { top_blockers: ['x'] }, recommendations: [rec('Only one', '')] } as any);
    expect(a.length).toBe(1);
  });
});

describe('selectTopActions - all-strong branch (R8)', () => {
  it('no blockers AND no "now" recs -> validation items, precedence over normal path', () => {
    const a = selectTopActions({
      overall: { top_blockers: [] },
      recommendations: [rec('Later idea', '', 'later')],
      next_human_validation: [
        { question: 'Test pricing with 5 buyers', persona_share: 0.5 },
        { question: 'Run a landing-page smoke test', persona_share: 0.3 },
      ],
    } as any);
    expect(a.every((x) => x.imperative === 'Validate before shipping')).toBe(true);
    expect(a.every((x) => x.anchorId === '#next-validation')).toBe(true);
    expect(a.length).toBe(2);
  });

  it('is total on an empty report (never throws, returns [])', () => {
    expect(() => selectTopActions({} as any)).not.toThrow();
    expect(selectTopActions({} as any)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/web; npm run test -- topActions.test.ts`
Expected: FAIL — `selectTopActions is not a function` (not exported yet).

- [ ] **Step 3: Write the minimal implementation** (append to `apps/web/lib/server/engine/verdict.ts`)

```ts
import type { TopAction } from './types';

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// R6: lowest price where share_willing first < 0.5; else avg_max_price.
function pricingStat(report: DerivableReport): string {
  const curve = asArray<any>((report as any)?.price_sensitivity)
    .filter((p) => typeof p?.price === 'number')
    .sort((a, b) => a.price - b.price);
  const crossover = curve.find((p) => Number(p?.share_willing) < 0.5);
  const price = crossover ? crossover.price : (report as any)?.avg_max_price;
  return typeof price === 'number' ? `~$${Math.round(price)}` : '-';
}

function enrich(rec: any, report: DerivableReport, rank: number): TopAction {
  const base = { rank, imperative: rec?.title ?? '', why: rec?.detail ?? '' };
  const hay = `${rec?.title ?? ''} ${rec?.detail ?? ''}`.toLowerCase();

  if (hay.includes('objection')) {
    const o = (report as any)?.top_objections?.[0];
    return { ...base, anchorId: '#objections', evidence: o ? { stat: `${Math.round(Number(o.share) * 100)}%`, quote: o.example_quote } : undefined };
  }
  if (hay.includes('pricing') || hay.includes('price')) {
    return { ...base, anchorId: '#pricing', evidence: { stat: pricingStat(report) } };
  }
  if (hay.includes('proof') || hay.includes('trust')) {
    const yellow = Number((report as any)?.adoption?.yellow) || 0;
    return { ...base, anchorId: '#trust', evidence: { stat: `${yellow}` } };
  }
  if (hay.includes('segment')) {
    const s = (report as any)?.segments?.[0];
    return { ...base, anchorId: '#segments', evidence: s ? { stat: `${s.segment}: ${Math.round(Number(s.adoption_rate) * 100)}%` } : undefined };
  }
  if (hay.includes('collapse') || hay.includes('quality') || hay.includes('consensus')) {
    const cr = (report as any)?.quality?.collapse_risk ?? 'unknown';
    return { ...base, anchorId: '#quality', evidence: { stat: `collapse risk: ${cr}` } };
  }
  return { ...base, anchorId: '#full-diagnostics' }; // DEFAULT — evidence omitted
}

// Tolerant accessors for the two loosely-shaped arrays.
const criterionName = (c: any): string => c?.name ?? c?.criterion ?? String(c ?? '');
const validationLabel = (v: any): string => v?.question ?? v?.test ?? v?.label ?? String(v ?? '');
const validationShare = (v: any): number => Number(v?.persona_share ?? v?.share) || 0;

function validationActions(report: DerivableReport): TopAction[] {
  return asArray<any>((report as any)?.next_human_validation)
    .slice(0, 3)
    .map((v, i) => ({
      rank: i + 1,
      imperative: 'Validate before shipping',
      why: validationLabel(v),
      evidence: { stat: `${Math.round(validationShare(v) * 100)}%` },
      anchorId: '#next-validation',
    }));
}

export function selectTopActions(report: DerivableReport): TopAction[] {
  const recs = asArray<any>((report as any)?.recommendations);
  const blockers = asArray<string>((report as any)?.overall?.top_blockers);
  const hasNow = recs.some((r) => r?.priority === 'now');

  // R8: all-strong — precedence over normal + padding paths.
  if (blockers.length === 0 && !hasNow) {
    return validationActions(report);
  }

  const actions: TopAction[] = recs.slice(0, 3).map((r, i) => enrich(r, report, i + 1));
  const seen = new Set(actions.map((a) => a.imperative));

  // R7: pad from weakest_criteria, then next_human_validation, de-duplicated.
  for (const c of asArray<any>((report as any)?.weakest_criteria)) {
    if (actions.length >= 3) break;
    const imperative = `Strengthen ${criterionName(c)}`;
    if (seen.has(imperative)) continue;
    actions.push({ rank: actions.length + 1, imperative, why: 'One of the lowest-scoring criteria.', evidence: { stat: `${Math.round(Number(c?.score ?? 0) * 100)}%` }, anchorId: '#criteria' });
    seen.add(imperative);
  }
  for (const v of asArray<any>((report as any)?.next_human_validation)) {
    if (actions.length >= 3) break;
    const imperative = 'Validate before shipping';
    if (seen.has(imperative)) continue;
    actions.push({ rank: actions.length + 1, imperative, why: validationLabel(v), evidence: { stat: `${Math.round(validationShare(v) * 100)}%` }, anchorId: '#next-validation' });
    seen.add(imperative);
  }

  return actions.slice(0, 3).map((a, i) => ({ ...a, rank: i + 1 }));
}
```

> **Type note:** `weakest_criteria[]` and `next_human_validation[]` item shapes are read through the tolerant `criterionName` / `validationLabel` / `validationShare` accessors above, so the code is correct regardless of whether the field is `name`/`criterion` or `question`/`test`. When implementing, confirm the real field names in `lib/server/engine/types.ts` and drop the unused accessor branches if desired.

- [ ] **Step 4: Run the test, verify it passes, and check branch coverage**

Run: `cd apps/web; npm run test -- topActions.test.ts verdict.test.ts`
Expected: PASS — every describe block green.

Run: `cd apps/web; npm run test:coverage -- verdict.test.ts topActions.test.ts`
Expected: coverage table shows `lib/server/engine/verdict.ts` at **100% Branch** (the Phase 0 `vitest.config.ts` thresholds enforce it; a missed branch fails the run).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server/engine/verdict.ts apps/web/lib/server/engine/topActions.test.ts
git commit -m "feat(report): select up to 3 enriched, anchor-linked top actions"
```

---

### Task 1.3: Attach `verdict` + `top_actions` at report build time (TDD)

Persist the derived fields so they ship in the stored report JSON (and the JSON export), with a client-side fallback still available in Phase 2 for legacy runs.

**Files:**
- Modify: `apps/web/lib/server/engine/verdict.ts`
- Modify: `apps/web/lib/server/engine/report.ts`
- Test: `apps/web/lib/server/engine/report.test.ts` (append)

**Interfaces:**
- Consumes: `deriveVerdict`, `selectTopActions` (Task 1.1/1.2); the report-building entry point in `report.ts` that returns the assembled `Report`.
- Produces: `export function attachVerdictAndActions<T extends DerivableReport>(report: T): T & { verdict: Verdict; top_actions: TopAction[] }` and its invocation at the end of the report build so `report.verdict` and `report.top_actions` are always populated.

- [ ] **Step 1: Write the failing test** (append to `apps/web/lib/server/engine/report.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { attachVerdictAndActions } from './verdict';

describe('attachVerdictAndActions', () => {
  it('populates verdict and top_actions on the report', () => {
    const out = attachVerdictAndActions({
      overall: { market_fit_score: 0.72, confidence: 'high', top_blockers: ['pricing friction'], top_strengths: ['clear value'] },
      adoption: { green: 58, yellow: 30, red: 12 },
      quality: { collapse_risk: 'low' },
      recommendations: [{ title: 'Address objection', detail: '', priority: 'now' }],
      top_objections: [{ label: 'Too expensive', share: 0.34, example_quote: 'q' }],
    } as any);
    expect(out.verdict?.level).toBe('conditional');
    expect(out.verdict?.headline).toBe('Promising - fix these first');
    expect(out.top_actions?.[0].anchorId).toBe('#objections');
  });

  it('is idempotent and never throws on a sparse report', () => {
    expect(() => attachVerdictAndActions({} as any)).not.toThrow();
    const out = attachVerdictAndActions({} as any);
    expect(out.verdict?.level).toBe('weak');
    expect(out.top_actions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/web; npm run test -- report.test.ts`
Expected: FAIL — `attachVerdictAndActions is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/server/engine/verdict.ts`:

```ts
export function attachVerdictAndActions<T extends DerivableReport>(report: T): T & { verdict: Verdict; top_actions: TopAction[] } {
  return { ...report, verdict: deriveVerdict(report), top_actions: selectTopActions(report) };
}
```

Then, in `apps/web/lib/server/engine/report.ts`, import it and wrap the assembled report on the way out (return the enriched report from the build function):

```ts
import { attachVerdictAndActions } from './verdict';

// ...at the end of the report-building function, replace `return report;` with:
return attachVerdictAndActions(report);
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/web; npm run test -- report.test.ts verdict.test.ts topActions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server/engine/verdict.ts apps/web/lib/server/engine/report.ts apps/web/lib/server/engine/report.test.ts
git commit -m "feat(report): persist verdict and top_actions at build time"
```

---

## Phase 2 - Verdict-first report UI

This phase builds the three verdict-first surfaces (`VerdictBanner`, `AtAGlance`, `TopActions`), a 1:1 anchor map, an auto-expanding collapsible, and restructures the report page so the answer sits above the preserved six-tier "Full diagnostics" section. Everything is **derived, never re-inferred** — no engine numbers change.

**Inherited constraints (every task obeys):** Node 18.17+, Next.js 14 App Router, TypeScript, Tailwind. All work is UX-layer in `apps/web`, additive. Do NOT build any pricing/buy-credits surface. Do NOT change engine numeric outputs; `verdict.ts` reuses `GREEN_THRESHOLD = 0.62` / `RED_THRESHOLD = 0.38` verbatim. `verdict.ts` is the only isomorphic engine module. Naming: PascalCase components/types, camelCase functions, UPPER_SNAKE_CASE constants. User-facing copy contains **no** hardcoded persona/panel counts — say "the full diagnostic breakdown (every panel)".

**Prerequisites (delivered by Phase 1, consumed here):**
- `apps/web/lib/server/engine/verdict.ts` exports `deriveVerdict(report: DerivableReport): Verdict` and `selectTopActions(report: DerivableReport): TopAction[]` — both total, never throw. `Report` (from `lib/types`) is structurally assignable to the permissive `DerivableReport`, so every Phase 2 component may pass a full `Report` directly.
- `apps/web/lib/types.ts` exports `Report`, `Verdict` (`{ level: 'strong'|'conditional'|'weak'; headline: string; rationale: string; caveated: boolean }`), and `TopAction` (`{ rank: number; imperative: string; why: string; evidence?: { stat: string; quote?: string }; anchorId: string }`), and `Report` now carries optional `verdict?: Verdict` and `top_actions?: TopAction[]`.
- `apps/web/vitest.config.ts` and `apps/web/vitest.setup.ts` already exist from **Phase 0 Task 0.2** and are the single, authoritative test harness: `environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']` (React Testing Library `jest-dom` + `cleanup`), `@vitejs/plugin-react`, `vite-tsconfig-paths`, and a `coverage` block (`provider: 'v8'`, `include: ['lib/server/engine/verdict.ts']`, `thresholds` branches/functions/lines/statements = 100) that enforces R12. Phase 2 **must not overwrite this file** — it only adds a shared fixture and, at most, surgical additive edits. The RTL + jsdom devDependencies were installed in **Phase 0 Task 0.1**; do not reinstall them.

**Import convention:** modules are imported by `apps/web`-root-relative paths (`lib/...`, `components/...`, `test/...`). The shared Vitest config (Phase 0 Task 0.2) resolves these via the `vite-tsconfig-paths` plugin, which honors `apps/web/tsconfig.json` (`baseUrl: "."` **plus** `paths: { "@/*": ["./*"] }`), so both bare-root imports (`lib/…`, `components/…`) and the `@/`-prefixed imports used in Phases 3/5/6 resolve identically against one config. Phase 2 uses bare-root imports throughout. All new presentational components are plain synchronous components; `AnchorCollapsible` is the only client island. Because `verdict.ts` is isomorphic (no server-only imports), importing `deriveVerdict`/`selectTopActions` into these components is safe on both server and client.

---

### Task 2.1 - Shared report fixture on the inherited RTL harness

Phase 0 already stood up the jsdom + React Testing Library harness and the `verdict.ts` coverage gate. This task adds only the typed `makeReport` factory that every Phase 2 component test consumes, and verifies the inherited harness still enforces the coverage gate and resolves imports. **Do not overwrite `vitest.config.ts` or re-create `vitest.setup.ts`.**

**Files**
- Create: `apps/web/test/fixtures/report.fixture.ts`
- Reference only (inherited from Phase 0 Task 0.2, do not modify here): `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`

**Interfaces**
- Consumes: `Report` (type) from `lib/types` (Phase 1).
- Produces: `makeReport(overrides?: Partial<Report>): Report` from `test/fixtures/report.fixture`.

Steps:

- [ ] Confirm the inherited Phase 0 harness survived intact (jsdom env, the `verdict.ts` coverage scope, and the 100% branch threshold that enforces R12). Run via the Bash tool:
  ```bash
  cd apps/web && rg -n "jsdom|lib/server/engine/verdict.ts|branches: 100" vitest.config.ts
  ```
  Expected: three matching lines — `environment: 'jsdom'`, `include: ['lib/server/engine/verdict.ts']`, and `branches: 100`. If any is missing, STOP and repair Phase 0 Task 0.2 rather than overwriting the config here (overwriting would drop the R12 branch gate).

- [ ] Create `apps/web/test/fixtures/report.fixture.ts`:
  ```ts
  import type { Report } from 'lib/types'

  /**
   * Hand-authored, schema-shaped Report used by Phase 2 component tests.
   * Phase 3's seeded demo JSON later becomes the canonical end-to-end fixture;
   * this factory keeps the UI tests independent of the seed script.
   */
  export function makeReport(overrides: Partial<Report> = {}): Report {
    const base = {
      storm_id: 'test-storm',
      title: 'PersonaPilot',
      summary: 'An AI copilot for product teams.',
      product_category: 'ai_saas',
      overall: {
        market_fit_score: 0.72,
        confidence: 'high',
        top_blockers: ['pricing friction'],
        top_strengths: ['clear value proposition'],
      },
      adoption: {
        green: 58,
        yellow: 30,
        red: 12,
        average_buy_likelihood: 0.55,
        average_market_fit_score: 0.72,
      },
      top_objections: [
        {
          label: 'Too expensive to justify',
          count: 42,
          share: 0.42,
          example_quote: 'Too expensive to justify for my team.',
          top_segments: ['SMB'],
        },
      ],
      price_sensitivity: [
        { price: 20, share_willing: 0.8 },
        { price: 48, share_willing: 0.42 },
      ],
      weakest_criteria: [{ criterion: 'Pricing clarity', score: 0.41 }],
      next_human_validation: ['Interview 5 SMB buyers on pricing'],
      quality: { collapse_risk: 'low' },
      recommendations: [],
      avg_max_price: 120,
      persona_count: 1000,
      stimulus_type: 'product_concept',
      verdict: {
        level: 'conditional',
        headline: 'Promising - fix these first',
        rationale:
          "72% market fit, high confidence — clear value proposition, but pricing friction and 'Too expensive to justify' are holding intent at 58%.",
        caveated: false,
      },
      top_actions: [
        {
          rank: 1,
          imperative: 'Address the top objection',
          why: 'Pricing is the most common rejection reason.',
          evidence: { stat: '42%', quote: 'Too expensive to justify for my team.' },
          anchorId: '#objections',
        },
        {
          rank: 2,
          imperative: 'Clarify pricing',
          why: 'Buyers drop off above the crossover price.',
          evidence: { stat: '~$48' },
          anchorId: '#pricing',
        },
        {
          rank: 3,
          imperative: 'Review the full diagnostics',
          why: 'No single blocker dominates; scan the breakdown.',
          anchorId: '#full-diagnostics',
        },
      ],
    }

    return { ...base, ...overrides } as unknown as Report
  }
  ```

- [ ] Confirm the inherited harness still boots and resolves the fixture's `lib/types` import (Phase 1 unit tests continue to pass under the untouched config):
  ```bash
  cd apps/web && npx vitest run lib/server/engine/verdict.test.ts
  ```
  Expected: `Test Files  1 passed (1)` (the jsdom env does not break the pure Phase 1 tests).

- [ ] Commit:
  ```bash
  cd apps/web && git add test/fixtures/report.fixture.ts && git commit -m "chore(web): add shared report fixture for phase 2 component tests"
  ```

---

### Task 2.2 - VerdictBanner component (headline + rationale + caveat pill)

Render the derived verdict: fixed level color, headline, rationale, and — when caveated — an amber-accent pill that **augments** (does not replace) the level color (R19). Carries `data-tour="verdict-banner"`.

**Files**
- Create: `apps/web/components/report/VerdictBanner.tsx`
- Test: `apps/web/components/report/VerdictBanner.test.tsx`

**Interfaces**
- Consumes: `deriveVerdict(report: DerivableReport): Verdict` from `lib/server/engine/verdict` (Phase 1 implements it over the permissive `DerivableReport`; `Report` from `lib/types` is structurally assignable, so the component passes a `Report`); `Report`, `Verdict` from `lib/types`; `makeReport` from `test/fixtures/report.fixture`.
- Produces: `VerdictBanner({ report: Report }): JSX.Element`.

Steps:

- [ ] Write the failing test `apps/web/components/report/VerdictBanner.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { VerdictBanner } from 'components/report/VerdictBanner'
  import { makeReport } from 'test/fixtures/report.fixture'

  function banner(container: HTMLElement): HTMLElement {
    return container.querySelector('[data-tour="verdict-banner"]') as HTMLElement
  }

  describe('VerdictBanner', () => {
    it('renders the persisted headline and rationale', () => {
      render(
        <VerdictBanner
          report={makeReport({
            verdict: {
              level: 'strong',
              headline: 'Strong signal - worth building',
              rationale: '82% market fit, high confidence; intent at 71%.',
              caveated: false,
            },
          })}
        />,
      )
      expect(screen.getByRole('heading', { name: 'Strong signal - worth building' })).toBeInTheDocument()
      expect(screen.getByText('82% market fit, high confidence; intent at 71%.')).toBeInTheDocument()
    })

    it('carries the data-tour anchor and level color per level', () => {
      const { container } = render(
        <VerdictBanner
          report={makeReport({
            verdict: { level: 'weak', headline: 'Weak signal - not yet', rationale: 'x', caveated: false },
          })}
        />,
      )
      expect(banner(container).getAttribute('data-tour')).toBe('verdict-banner')
      expect(banner(container).className).toContain('rose')
    })

    it('shows the caveat pill AND keeps the level color when caveated (augment, not replace)', () => {
      const { container } = render(
        <VerdictBanner
          report={makeReport({
            verdict: { level: 'weak', headline: 'Weak signal - not yet', rationale: 'x', caveated: true },
          })}
        />,
      )
      expect(screen.getByText('Directional only - low confidence')).toBeInTheDocument()
      const className = banner(container).className
      expect(className).toContain('rose') // level color preserved
      expect(className).toContain('ring-amber') // amber accent layered on top
    })

    it('hides the caveat pill when not caveated', () => {
      render(
        <VerdictBanner
          report={makeReport({
            verdict: { level: 'strong', headline: 'Strong signal - worth building', rationale: 'x', caveated: false },
          })}
        />,
      )
      expect(screen.queryByText('Directional only - low confidence')).not.toBeInTheDocument()
    })

    it('falls back to deriveVerdict when report.verdict is absent', () => {
      const report = makeReport({ verdict: undefined, overall: { market_fit_score: 0.2, confidence: 'high', top_blockers: [], top_strengths: [] } })
      render(<VerdictBanner report={report} />)
      expect(screen.getByRole('heading', { name: 'Weak signal - not yet' })).toBeInTheDocument()
    })
  })
  ```

- [ ] Run it, see it fail:
  ```bash
  cd apps/web && npx vitest run components/report/VerdictBanner.test.tsx
  ```
  Expected: `Error: Failed to resolve import "components/report/VerdictBanner"` → `Test Files  1 failed (1)`.

- [ ] Create `apps/web/components/report/VerdictBanner.tsx`:
  ```tsx
  import { deriveVerdict } from 'lib/server/engine/verdict'
  import type { Report, Verdict } from 'lib/types'

  const LEVEL_STYLES: Record<Verdict['level'], string> = {
    strong: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
    conditional: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    weak: 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100',
  }

  interface VerdictBannerProps {
    report: Report
  }

  export function VerdictBanner({ report }: VerdictBannerProps) {
    const verdict: Verdict = report.verdict ?? deriveVerdict(report)
    const caveatAccent = verdict.caveated ? 'ring-2 ring-amber-400/70' : ''

    return (
      <section
        data-tour="verdict-banner"
        role="status"
        aria-label="Verdict"
        className={`rounded-2xl border p-6 ${LEVEL_STYLES[verdict.level]} ${caveatAccent}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold">{verdict.headline}</h2>
          {verdict.caveated ? (
            <span className="shrink-0 rounded-full border border-amber-500 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              Directional only - low confidence
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-base leading-relaxed opacity-90">{verdict.rationale}</p>
      </section>
    )
  }
  ```

- [ ] Run it, see it pass:
  ```bash
  cd apps/web && npx vitest run components/report/VerdictBanner.test.tsx
  ```
  Expected: `✓ components/report/VerdictBanner.test.tsx (5 tests)` → `Tests  5 passed (5)`.

- [ ] Commit:
  ```bash
  cd apps/web && git add components/report/VerdictBanner.tsx components/report/VerdictBanner.test.tsx && git commit -m "feat(report): add VerdictBanner with caveat pill augmenting level color"
  ```

---

### Task 2.3 - AtAGlance KPI strip (4 tiles, missing -> "-")

Four derived tiles directly under the verdict; every tile degrades independently to `-` on missing data and never throws (R spec §5.4). Uses local tile markup mirroring the `components/ui/*` token language (no prop coupling to `InsightCard`).

**Files**
- Create: `apps/web/components/report/AtAGlance.tsx`
- Test: `apps/web/components/report/AtAGlance.test.tsx`

**Interfaces**
- Consumes: `Report` from `lib/types`; `makeReport` from `test/fixtures/report.fixture`.
- Produces: `AtAGlance({ report: Report }): JSX.Element`.

Steps:

- [ ] Write the failing test `apps/web/components/report/AtAGlance.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { AtAGlance } from 'components/report/AtAGlance'
  import { makeReport } from 'test/fixtures/report.fixture'

  describe('AtAGlance', () => {
    it('renders all four derived tiles from report fields', () => {
      render(<AtAGlance report={makeReport()} />)
      const values = screen.getAllByTestId('tile-value').map((el) => el.textContent)
      expect(values).toEqual(['72%', '58%', 'Too expensive to justify (42%)', '~$120'])
    })

    it('renders "-" for each missing source and never throws', () => {
      const report = makeReport({
        overall: undefined,
        adoption: undefined,
        top_objections: [],
        avg_max_price: undefined,
      })
      render(<AtAGlance report={report} />)
      const values = screen.getAllByTestId('tile-value').map((el) => el.textContent)
      expect(values).toEqual(['-', '-', '-', '-'])
    })

    it('renders "-" for buy intent when adoption counts sum to zero', () => {
      const report = makeReport({ adoption: { green: 0, yellow: 0, red: 0, average_buy_likelihood: 0, average_market_fit_score: 0 } })
      render(<AtAGlance report={report} />)
      const values = screen.getAllByTestId('tile-value').map((el) => el.textContent)
      expect(values[1]).toBe('-')
    })
  })
  ```

- [ ] Run it, see it fail:
  ```bash
  cd apps/web && npx vitest run components/report/AtAGlance.test.tsx
  ```
  Expected: `Error: Failed to resolve import "components/report/AtAGlance"` → `Test Files  1 failed (1)`.

- [ ] Create `apps/web/components/report/AtAGlance.tsx`:
  ```tsx
  import type { Report } from 'lib/types'

  const MISSING = '-'

  function pct(value: number | undefined | null): string {
    if (value === undefined || value === null || !Number.isFinite(value)) return MISSING
    return `${Math.round(value * 100)}%`
  }

  interface AtAGlanceProps {
    report: Report
  }

  export function AtAGlance({ report }: AtAGlanceProps) {
    const mfs = report.overall?.market_fit_score
    const green = report.adoption?.green
    const yellow = report.adoption?.yellow
    const red = report.adoption?.red
    const total = (green ?? 0) + (yellow ?? 0) + (red ?? 0)

    const marketFit = pct(mfs)
    const buyIntent = green === undefined || total <= 0 ? MISSING : pct((green ?? 0) / total)

    const objection = report.top_objections?.[0]
    const topObjection = objection?.label
      ? Number.isFinite(objection.share)
        ? `${objection.label} (${pct(objection.share)})`
        : objection.label
      : MISSING

    const avgMaxPrice = report.avg_max_price
    const willingToPay =
      avgMaxPrice === undefined || avgMaxPrice === null || !Number.isFinite(avgMaxPrice)
        ? MISSING
        : `~$${avgMaxPrice}`

    const tiles: { label: string; value: string }[] = [
      { label: 'Market fit', value: marketFit },
      { label: 'Buy intent', value: buyIntent },
      { label: 'Top objection', value: topObjection },
      { label: 'Willing to pay', value: willingToPay },
    ]

    return (
      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {tile.label}
            </div>
            <div
              data-testid="tile-value"
              className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100"
            >
              {tile.value}
            </div>
          </div>
        ))}
      </section>
    )
  }
  ```

- [ ] Run it, see it pass:
  ```bash
  cd apps/web && npx vitest run components/report/AtAGlance.test.tsx
  ```
  Expected: `✓ components/report/AtAGlance.test.tsx (3 tests)` → `Tests  3 passed (3)`.

- [ ] Commit:
  ```bash
  cd apps/web && git add components/report/AtAGlance.tsx components/report/AtAGlance.test.tsx && git commit -m "feat(report): add AtAGlance KPI strip with graceful missing-data fallback"
  ```

---

### Task 2.4 - TopActions component (up to 3 scroll-linked rows)

Render up to 3 enriched action rows; each is an anchor `<a href={anchorId}>` (anchorIds already carry `#`, e.g. `#objections`, DEFAULT `#full-diagnostics`). Renders 1-2 rows cleanly and returns `null` on 0 actions. Carries `data-tour="top-actions"`.

**Files**
- Create: `apps/web/components/report/TopActions.tsx`
- Test: `apps/web/components/report/TopActions.test.tsx`

**Interfaces**
- Consumes: `selectTopActions(report: DerivableReport): TopAction[]` from `lib/server/engine/verdict` (Phase 1 implements it over the permissive `DerivableReport`; `Report` from `lib/types` is structurally assignable, so the component passes a `Report`); `Report`, `TopAction` from `lib/types`; `makeReport` from `test/fixtures/report.fixture`.
- Produces: `TopActions({ report: Report }): JSX.Element | null`.

Steps:

- [ ] Write the failing test `apps/web/components/report/TopActions.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { TopActions } from 'components/report/TopActions'
  import { makeReport } from 'test/fixtures/report.fixture'

  describe('TopActions', () => {
    it('renders each persisted action as a scroll-link to its anchorId', () => {
      const { container } = render(<TopActions report={makeReport()} />)
      const links = Array.from(container.querySelectorAll('a'))
      expect(links).toHaveLength(3)
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['#objections', '#pricing', '#full-diagnostics'])
      expect(screen.getByText('Address the top objection')).toBeInTheDocument()
      expect(screen.getByText('Pricing is the most common rejection reason.')).toBeInTheDocument()
    })

    it('renders evidence stat and quote when present', () => {
      render(<TopActions report={makeReport()} />)
      expect(screen.getByText('42%')).toBeInTheDocument()
      expect(screen.getByText('"Too expensive to justify for my team."')).toBeInTheDocument()
    })

    it('omits the evidence chip for a DEFAULT action with no evidence', () => {
      const { container } = render(<TopActions report={makeReport()} />)
      const defaultRow = container.querySelector('a[href="#full-diagnostics"]') as HTMLElement
      expect(defaultRow).toBeInTheDocument()
      expect(defaultRow.querySelector('[data-testid="evidence-stat"]')).toBeNull()
    })

    it('carries the data-tour anchor', () => {
      const { container } = render(<TopActions report={makeReport()} />)
      expect(container.querySelector('[data-tour="top-actions"]')).toBeInTheDocument()
    })

    it('renders nothing when there are no actions', () => {
      const { container } = render(<TopActions report={makeReport({ top_actions: [] })} />)
      expect(container.querySelector('[data-tour="top-actions"]')).toBeNull()
    })

    it('falls back to selectTopActions when report.top_actions is absent', () => {
      const report = makeReport({
        top_actions: undefined,
        recommendations: [{ title: 'Address the top objection', detail: 'Buyers reject on price.', priority: 'now' }],
      })
      const { container } = render(<TopActions report={report} />)
      expect(container.querySelector('a[href="#objections"]')).toBeInTheDocument()
    })
  })
  ```

- [ ] Run it, see it fail:
  ```bash
  cd apps/web && npx vitest run components/report/TopActions.test.tsx
  ```
  Expected: `Error: Failed to resolve import "components/report/TopActions"` → `Test Files  1 failed (1)`.

- [ ] Create `apps/web/components/report/TopActions.tsx`:
  ```tsx
  import { selectTopActions } from 'lib/server/engine/verdict'
  import type { Report, TopAction } from 'lib/types'

  interface TopActionsProps {
    report: Report
  }

  export function TopActions({ report }: TopActionsProps) {
    const actions: TopAction[] = report.top_actions ?? selectTopActions(report)

    if (actions.length === 0) return null

    return (
      <section data-tour="top-actions" aria-label="Top actions" className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Do this next
        </h3>
        <ol className="space-y-3">
          {actions.map((action) => (
            <li key={action.rank}>
              <a
                href={action.anchorId}
                className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {action.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900 dark:text-slate-100">
                    {action.imperative}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                    {action.why}
                  </span>
                  {action.evidence?.stat ? (
                    <span
                      data-testid="evidence-stat"
                      className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {action.evidence.stat}
                    </span>
                  ) : null}
                  {action.evidence?.quote ? (
                    <span className="mt-2 block text-sm italic text-slate-500 dark:text-slate-400">
                      "{action.evidence.quote}"
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    )
  }
  ```

- [ ] Run it, see it pass:
  ```bash
  cd apps/web && npx vitest run components/report/TopActions.test.tsx
  ```
  Expected: `✓ components/report/TopActions.test.tsx (6 tests)` → `Tests  6 passed (6)`.

- [ ] Commit:
  ```bash
  cd apps/web && git add components/report/TopActions.tsx components/report/TopActions.test.tsx && git commit -m "feat(report): add TopActions scroll-linked action rows"
  ```

---

### Task 2.5 - REPORT_ANCHORS map + EXPAND_CRITERIA_EVENT (unique 1:1 ids per R4)

Encode the eight scroll-anchor ids as a single constant so the report page, `TopActions` scroll-links, and the Phase 5 tour all reference one source of truth. Also declare `EXPAND_CRITERIA_EVENT` here — the single, shared custom-event name that programmatic/tour navigation (Phase 5) uses to expand the collapsed `#criteria` panel (consumed by `AnchorCollapsible` in Task 2.6, resolving the R5 dead-event issue). A test enforces R4's uniqueness + exact set, catching any drift that would break a `TopActions` scroll-link.

**Files**
- Create: `apps/web/lib/report/anchors.ts`
- Test: `apps/web/lib/report/anchors.test.ts`

**Interfaces**
- Produces: `REPORT_ANCHORS` (readonly record of anchor keys -> id strings, no leading `#`) and `EXPAND_CRITERIA_EVENT: 'report:expand-criteria'` from `lib/report/anchors`.

Steps:

- [ ] Write the failing test `apps/web/lib/report/anchors.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { REPORT_ANCHORS, EXPAND_CRITERIA_EVENT } from 'lib/report/anchors'

  describe('REPORT_ANCHORS', () => {
    it('maps every panel to its unique anchor id (R4)', () => {
      expect(REPORT_ANCHORS).toEqual({
        objections: 'objections',
        pricing: 'pricing',
        priceCurve: 'price-curve',
        trust: 'trust',
        quality: 'quality',
        segments: 'segments',
        criteria: 'criteria',
        nextValidation: 'next-validation',
      })
    })

    it('has no duplicate ids (1:1 with a single DOM target)', () => {
      const ids = Object.values(REPORT_ANCHORS)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toHaveLength(8)
    })

    it('exposes the criteria expand-event name as a single source of truth', () => {
      expect(EXPAND_CRITERIA_EVENT).toBe('report:expand-criteria')
    })
  })
  ```

- [ ] Run it, see it fail:
  ```bash
  cd apps/web && npx vitest run lib/report/anchors.test.ts
  ```
  Expected: `Error: Failed to resolve import "lib/report/anchors"` → `Test Files  1 failed (1)`.

- [ ] Create `apps/web/lib/report/anchors.ts`:
  ```ts
  /**
   * Unique, 1:1 scroll-anchor ids for the report's diagnostics panels (R4).
   * TopAction.anchorId values are these prefixed with '#'.
   */
  export const REPORT_ANCHORS = {
    objections: 'objections',
    pricing: 'pricing',
    priceCurve: 'price-curve',
    trust: 'trust',
    quality: 'quality',
    segments: 'segments',
    criteria: 'criteria',
    nextValidation: 'next-validation',
  } as const

  export type ReportAnchorKey = keyof typeof REPORT_ANCHORS

  /**
   * Custom DOM event asking a collapsed AnchorCollapsible to expand + scroll for
   * programmatic / tour navigation to #criteria (R5). AnchorCollapsible (Task 2.6)
   * is the SINGLE owner of expand+scroll for its id; Phase 5's scroll manager
   * dispatches this event with `{ detail: { id } }` instead of scrolling to
   * #criteria itself, so the collapsed tier-3 table expands before the scroll.
   */
  export const EXPAND_CRITERIA_EVENT = 'report:expand-criteria'
  ```

- [ ] Run it, see it pass:
  ```bash
  cd apps/web && npx vitest run lib/report/anchors.test.ts
  ```
  Expected: `✓ lib/report/anchors.test.ts (3 tests)` → `Tests  3 passed (3)`.

- [ ] Commit:
  ```bash
  cd apps/web && git add lib/report/anchors.ts lib/report/anchors.test.ts && git commit -m "feat(report): add REPORT_ANCHORS 1:1 anchor map and expand-criteria event"
  ```

---

### Task 2.6 - AnchorCollapsible wrapper (collapsed by default, auto-expand on anchor nav + expand-event, R5)

The mechanism for R5: an id-anchored `<section>` that renders collapsed by default and auto-expands (then scrolls itself into view) on **either** of two triggers — (a) the URL hash equals its id (covers `TopActions` `<a href="#criteria">` clicks), or (b) it receives `EXPAND_CRITERIA_EVENT` targeting its id (covers Phase 5 driver.js tour steps / programmatic navigation, which cannot rely on `hashchange`). Wrapping `CriteriaBreakdown` with `id="criteria"` means both a `#criteria` link and a tour step expand the tier-3 raw table before scrolling. `AnchorCollapsible` is declared the **single owner of expand+scroll for its own id** — Phase 5's `AnchorScrollManager` must NOT also scroll to this id (it dispatches `EXPAND_CRITERIA_EVENT` instead), avoiding the double-scroll flagged in review. Client island (`'use client'`).

**Files**
- Create: `apps/web/components/report/AnchorCollapsible.tsx`
- Test: `apps/web/components/report/AnchorCollapsible.test.tsx`

**Interfaces**
- Consumes: React (`useState`, `useEffect`, `useRef`); `EXPAND_CRITERIA_EVENT` from `lib/report/anchors`.
- Produces: `AnchorCollapsible({ id: string; title: string; children: React.ReactNode }): JSX.Element`.

Steps:

- [ ] Write the failing test `apps/web/components/report/AnchorCollapsible.test.tsx`:
  ```tsx
  import { describe, it, expect, beforeEach, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { AnchorCollapsible } from 'components/report/AnchorCollapsible'
  import { EXPAND_CRITERIA_EVENT } from 'lib/report/anchors'

  describe('AnchorCollapsible', () => {
    beforeEach(() => {
      window.location.hash = ''
      Element.prototype.scrollIntoView = vi.fn()
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0)
        return 0
      })
    })

    it('is collapsed by default: renders the title button but hides children', () => {
      render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      expect(screen.getByRole('button', { name: /raw criteria breakdown/i })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('RAW TABLE')).not.toBeInTheDocument()
    })

    it('toggles children when the button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      await user.click(screen.getByRole('button'))
      expect(screen.getByText('RAW TABLE')).toBeInTheDocument()
      await user.click(screen.getByRole('button'))
      expect(screen.queryByText('RAW TABLE')).not.toBeInTheDocument()
    })

    it('auto-expands and scrolls when the hash matches its id', () => {
      const { container } = render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      window.location.hash = '#criteria'
      window.dispatchEvent(new Event('hashchange'))
      expect(screen.getByText('RAW TABLE')).toBeInTheDocument()
      expect((container.querySelector('#criteria') as HTMLElement)).toBeInTheDocument()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('expands the table BEFORE scrolling when it receives EXPAND_CRITERIA_EVENT for its id (tour/programmatic nav, R5)', () => {
      render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      window.dispatchEvent(new CustomEvent(EXPAND_CRITERIA_EVENT, { detail: { id: 'criteria' } }))
      expect(screen.getByText('RAW TABLE')).toBeInTheDocument()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('ignores EXPAND_CRITERIA_EVENT that targets a different id', () => {
      render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      window.dispatchEvent(new CustomEvent(EXPAND_CRITERIA_EVENT, { detail: { id: 'segments' } }))
      expect(screen.queryByText('RAW TABLE')).not.toBeInTheDocument()
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })

    it('exposes the id on the section element', () => {
      const { container } = render(
        <AnchorCollapsible id="criteria" title="Raw criteria breakdown">
          <div>RAW TABLE</div>
        </AnchorCollapsible>,
      )
      expect(container.querySelector('section#criteria')).toBeInTheDocument()
    })
  })
  ```

- [ ] Run it, see it fail:
  ```bash
  cd apps/web && npx vitest run components/report/AnchorCollapsible.test.tsx
  ```
  Expected: `Error: Failed to resolve import "components/report/AnchorCollapsible"` → `Test Files  1 failed (1)`.

- [ ] Create `apps/web/components/report/AnchorCollapsible.tsx`:
  ```tsx
  'use client'

  import { useEffect, useRef, useState, type ReactNode } from 'react'
  import { EXPAND_CRITERIA_EVENT } from 'lib/report/anchors'

  interface AnchorCollapsibleProps {
    id: string
    title: string
    children: ReactNode
  }

  export function AnchorCollapsible({ id, title, children }: AnchorCollapsibleProps) {
    const [expanded, setExpanded] = useState(false)
    const ref = useRef<HTMLElement>(null)

    useEffect(() => {
      if (typeof window === 'undefined') return
      const hashId = `#${id}`

      // AnchorCollapsible is the SINGLE owner of expand+scroll for its own id.
      // Phase 5's AnchorScrollManager must NOT also scroll to this id; for
      // programmatic / tour navigation it dispatches EXPAND_CRITERIA_EVENT so the
      // table expands before the scroll (rAF defers the scroll until after the
      // expanded children have rendered).
      function expandAndScroll() {
        setExpanded(true)
        window.requestAnimationFrame(() => {
          ref.current?.scrollIntoView({ block: 'start' })
        })
      }

      function syncFromHash() {
        if (window.location.hash === hashId) expandAndScroll()
      }

      function onExpandCriteria(event: Event) {
        const detail = (event as CustomEvent<{ id?: string }>).detail
        if (detail?.id === id) expandAndScroll()
      }

      syncFromHash()
      window.addEventListener('hashchange', syncFromHash)
      window.addEventListener(EXPAND_CRITERIA_EVENT, onExpandCriteria)
      return () => {
        window.removeEventListener('hashchange', syncFromHash)
        window.removeEventListener(EXPAND_CRITERIA_EVENT, onExpandCriteria)
      }
    }, [id])

    return (
      <section ref={ref} id={id} className="scroll-mt-24">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-900 transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <span>{title}</span>
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
        {expanded ? <div className="mt-3">{children}</div> : null}
      </section>
    )
  }
  ```

- [ ] Run it, see it pass:
  ```bash
  cd apps/web && npx vitest run components/report/AnchorCollapsible.test.tsx
  ```
  Expected: `✓ components/report/AnchorCollapsible.test.tsx (6 tests)` → `Tests  6 passed (6)`.

- [ ] Commit:
  ```bash
  cd apps/web && git add components/report/AnchorCollapsible.tsx components/report/AnchorCollapsible.test.tsx && git commit -m "feat(report): add AnchorCollapsible auto-expand on hash and expand-criteria event"
  ```

---

### Task 2.7 - Restructure report/page.tsx to verdict-first, depth preserved

Re-order the report body to **VerdictBanner -> AtAGlance -> TopActions -> "Full diagnostics" divider -> the six tiers (expanded)**. Add unique `id` anchors (R4) via `<section>` wrappers, wrap only the tier-3 `CriteriaBreakdown` raw table in `AnchorCollapsible` (R5), and rely on the leaf components' `report.verdict ?? deriveVerdict(...)` fallback for legacy runs. The page stays a Server Component; `AnchorCollapsible` is the sole client island. Anchor 1:1 coverage (R4) is verified by an **automated** test that reads the page source, not by eye.

**Files**
- Modify: `apps/web/app/(app)/storm/[id]/report/page.tsx`
- Test: `apps/web/app/(app)/storm/[id]/report/anchors.render.test.ts`

**Interfaces**
- Consumes: `Report` (with `verdict?`, `top_actions?`) from `lib/types`; existing `getStormReport` (unchanged) as the page's data source; `REPORT_ANCHORS` from `lib/report/anchors`; `VerdictBanner`, `AtAGlance`, `TopActions`, `AnchorCollapsible` from `components/report/*`; the existing tier panels (`MarketFitHero`, `TrustPanel`, `BlockerCards`, `StrengthCards`, `CriteriaRadar`, `CriteriaBreakdown`, `TrustProofPanel`, `DifferentiationPanel`, `PricingFitPanel`, `WorkflowFitPanel`, `PriceCurve`, `SegmentHeatmap`, `AgeCohortBreakdown`, `ObjectionsTable`, `KillQuoteCard`, `Recommendations`, `NextValidationPanel`).
- Produces: the restructured default-exported `ReportPage` (async server component) with the anchored six-tier layout.

Steps:

- [ ] **Discovery — capture each panel's exact current invocation** (so the restructure reuses each element verbatim rather than assuming its props). Run via the Bash tool:
  ```bash
  cd apps/web && rg -n "<(MarketFitHero|TrustPanel|BlockerCards|StrengthCards|CriteriaRadar|CriteriaBreakdown|TrustProofPanel|DifferentiationPanel|PricingFitPanel|WorkflowFitPanel|PriceCurve|SegmentHeatmap|AgeCohortBreakdown|ObjectionsTable|KillQuoteCard|Recommendations|NextValidationPanel)" "app/(app)/storm/[id]/report/page.tsx"
  ```
  Expected: one line per panel showing its current JSX and exact props (e.g. `<MarketFitHero report={report} />`, or a narrower form like `<PriceCurve data={report.price_sensitivity} />`). **Record every line exactly.** In the restructure below, wherever a panel appears as `<PanelName … />`, `…` means "that panel's existing props copied verbatim from this output" — never edit a panel's props; only its order and surrounding wrappers change.

- [ ] **Discovery — locate the executive-summary block** so it can be moved verbatim into the T1 slot:
  ```bash
  cd apps/web && rg -n -i "report\.summary|exec|summary" "app/(app)/storm/[id]/report/page.tsx"
  ```
  Expected: the line(s) rendering the exec-summary (e.g. `<p className="…">{report.summary}</p>` or an `InsightCard`). **Record the exact JSX**; the restructure moves this block unchanged into the T1 group where marked.

- [ ] Add the new imports at the top of `apps/web/app/(app)/storm/[id]/report/page.tsx` (keep the existing data-fetch and panel imports):
  ```tsx
  import { VerdictBanner } from 'components/report/VerdictBanner'
  import { AtAGlance } from 'components/report/AtAGlance'
  import { TopActions } from 'components/report/TopActions'
  import { AnchorCollapsible } from 'components/report/AnchorCollapsible'
  import { REPORT_ANCHORS } from 'lib/report/anchors'
  ```

- [ ] Replace the current flat six-tier body (the JSX that today renders the panels) with the structure below. The surrounding page shell (`getStormReport(params.id)`, `notFound()`, header, JSON-download control) is unchanged. Rules for this edit: (a) prepend the three verdict-first surfaces; (b) insert the "Full diagnostics" divider; (c) wrap each anchored panel in its `<section id={REPORT_ANCHORS.*}>` **around the exact panel element captured in discovery** (do not retype its props); (d) wrap `CriteriaBreakdown` in `AnchorCollapsible`; (e) paste the recorded exec-summary block verbatim where marked. `<PanelName … />` = the verbatim element from discovery.
  ```tsx
  <div className="space-y-6">
    {/* Verdict-first header: fallback lives inside each leaf via report.verdict ?? deriveVerdict(report) */}
    <VerdictBanner report={report} />
    <AtAGlance report={report} />
    <TopActions report={report} />

    {/* Full diagnostics divider (R20). DEFAULT TopAction/tour target #full-diagnostics. */}
    <div
      id="full-diagnostics"
      data-tour="full-diagnostics"
      className="scroll-mt-24 border-t-2 border-slate-300 pt-6 dark:border-slate-700"
    >
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Full diagnostics</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The full diagnostic breakdown (every panel).
      </p>
    </div>

    {/* T1 Overview + Trust */}
    <MarketFitHero … />
    {/* paste the recorded exec-summary block here, verbatim from discovery */}
    <section id={REPORT_ANCHORS.quality} className="scroll-mt-24">
      <TrustPanel … />
    </section>

    {/* T2 Adoption */}
    <BlockerCards … />
    <StrengthCards … />

    {/* T3 Criteria — radar expanded; only the raw table is collapsed (R5) */}
    <CriteriaRadar … />
    <AnchorCollapsible id={REPORT_ANCHORS.criteria} title="Raw criteria breakdown">
      <CriteriaBreakdown … />
    </AnchorCollapsible>

    {/* T4 Deep-dives */}
    <section id={REPORT_ANCHORS.trust} className="scroll-mt-24">
      <TrustProofPanel … />
    </section>
    <DifferentiationPanel … />
    <section id={REPORT_ANCHORS.pricing} className="scroll-mt-24">
      <PricingFitPanel … />
    </section>
    <WorkflowFitPanel … />

    {/* T5 Evidence */}
    <section id={REPORT_ANCHORS.priceCurve} className="scroll-mt-24">
      <PriceCurve … />
    </section>
    <section id={REPORT_ANCHORS.segments} className="scroll-mt-24">
      <SegmentHeatmap … />
    </section>
    <AgeCohortBreakdown … />
    <section id={REPORT_ANCHORS.objections} className="scroll-mt-24">
      <ObjectionsTable … />
    </section>
    <KillQuoteCard … />

    {/* T6 Next steps */}
    <Recommendations … />
    <section id={REPORT_ANCHORS.nextValidation} className="scroll-mt-24">
      <NextValidationPanel … />
    </section>
  </div>
  ```

- [ ] Write the failing automated anchor-coverage test `apps/web/app/(app)/storm/[id]/report/anchors.render.test.ts` (reads the page as text — never imports the server component, so no server-only modules execute). It asserts each `REPORT_ANCHORS` key and the `#full-diagnostics` divider id appears **exactly once** in the page, catching duplicate/missing/mislinked anchors that would break a `TopActions` scroll-link (replaces the old "verify by eye" step, R4):
  ```ts
  import { describe, it, expect } from 'vitest'
  import { readFileSync } from 'node:fs'
  import path from 'node:path'
  import { REPORT_ANCHORS } from 'lib/report/anchors'

  const PAGE_PATH = path.resolve(process.cwd(), 'app/(app)/storm/[id]/report/page.tsx')
  const source = readFileSync(PAGE_PATH, 'utf8')

  describe('report page anchor wiring (R4)', () => {
    it('references each REPORT_ANCHORS key exactly once (1:1 targets)', () => {
      for (const key of Object.keys(REPORT_ANCHORS)) {
        const matches = source.match(new RegExp(`REPORT_ANCHORS\\.${key}\\b`, 'g')) ?? []
        expect(matches, `REPORT_ANCHORS.${key}`).toHaveLength(1)
      }
    })

    it('renders the #full-diagnostics divider id exactly once (DEFAULT target)', () => {
      const matches = source.match(/id="full-diagnostics"/g) ?? []
      expect(matches).toHaveLength(1)
    })
  })
  ```

- [ ] Run the anchor-coverage test, see it pass (the restructure above already wired each anchor once):
  ```bash
  cd apps/web && npx vitest run "app/(app)/storm/[id]/report/anchors.render.test.ts"
  ```
  Expected: `✓ app/(app)/storm/[id]/report/anchors.render.test.ts (2 tests)` → `Tests  2 passed (2)`. If any anchor count is 0 (missing) or ≥2 (duplicate), the test fails and names the offending `REPORT_ANCHORS.<key>` — fix the page wiring before continuing.

- [ ] Typecheck the change:
  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no output, exit code 0.

- [ ] Confirm the full Phase 2 test set is green together (component surfaces + anchor map + page anchor coverage):
  ```bash
  cd apps/web && npx vitest run VerdictBanner AtAGlance TopActions AnchorCollapsible anchors
  ```
  Expected: `Test Files  6 passed (6)` and `Tests  25 passed (25)` — VerdictBanner (5), AtAGlance (3), TopActions (6), AnchorCollapsible (6), `lib/report/anchors.test.ts` (3), `app/(app)/storm/[id]/report/anchors.render.test.ts` (2).

- [ ] Re-run the Phase 1 R12 coverage gate to prove Phase 2 did not weaken it (the config was never overwritten, so the 100% branch threshold on `verdict.ts` still fails the build on any regression):
  ```bash
  cd apps/web && npm run test:coverage
  ```
  Expected: the v8 per-file table shows `lib/server/engine/verdict.ts` at `100` for `% Branch` (and functions/lines/statements); exit code 0. A sub-100 branch value on `verdict.ts` must exit non-zero via the inherited `thresholds` block.

- [ ] Build to confirm the App Router page compiles (server component + client island boundary intact):
  ```bash
  cd apps/web && npx next build
  ```
  Expected: `✓ Compiled successfully` with no error about importing a client component from a server component (the only `'use client'` file is `AnchorCollapsible`). Behavior of the anchor-nav scroll/expand is additionally covered by the Phase 5 Playwright demo smoke.

- [ ] Commit:
  ```bash
  cd apps/web && git add "app/(app)/storm/[id]/report/page.tsx" "app/(app)/storm/[id]/report/anchors.render.test.ts" && git commit -m "feat(report): restructure report page verdict-first with anchored six-tier diagnostics"
  ```

---

## Phase 3 - Public no-signup demo (infra)

This phase builds the database + retrieval + entry-point plumbing that lets an anonymous evaluator watch and read the pre-baked PersonaPilot demo run with no signup and no credits. It implements design resolutions R1, R2, R14, R17, and the §7.1.1 Flow-A error-handling matrix. The security boundary is the DB (anon RLS on `is_demo = true` rows on **both** tables); the retrieval-layer bypass and the stream route's anon-client fallback are conveniences layered on top of that guarantee.

**Phase dependencies (from earlier phases — assume present, do not recreate):**
- `apps/web/lib/server/demo.ts` exporting `export const DEMO_STORM_ID = "demo-personapilot"` (R1, client-safe).
- `apps/web/lib/server/engine/verdict.ts` + `report.ts` already attach `report.verdict` and `report.top_actions` at build time (Phase 1), so any engine run — including the seed — carries them natively (R2).
- `apps/web/vitest.config.ts` with the `@/` path alias mapped to the `apps/web` root (established in Phase 0 alongside `tsconfig.json`'s `"paths": { "@/*": ["./*"] }`), and a `test` script in `apps/web/package.json`. Every task below uses `@/…` imports, the single import convention for the whole plan.

**Inherited global constraints (every task below):** Node 18.17+; Next.js 14 App Router; TypeScript; Supabase. All work is additive and UX/data-access-layer in `apps/web`. Do NOT touch `apps/api`, engine numeric outputs, or any money-flow path (`adjust_wallet_balance`, concurrency guard, refund). Reuse the existing `/api/storm/[id]/stream` and `/api/storm/[id]/report` routes — the report route is **not** structurally changed. Naming: PascalCase types, camelCase functions, UPPER_SNAKE_CASE constants.

> **Shell note (Windows host).** Every fenced shell block in this phase is POSIX and is intended to run through the **Bash tool** (Git Bash on this machine), where `grep`, `curl`, `head`, `/dev/null`, `$VAR`, inline `VAR=… cmd` prefixes, and `|` pipes all behave exactly as written. If you run a block in PowerShell instead, translate as follows:
> - Set env vars on their own line first: `$env:SUPABASE_DB_URL = '…'` (then reference `$env:SUPABASE_DB_URL`, not `$SUPABASE_DB_URL`); there is no inline `VAR=… cmd` prefix.
> - `grep …` → the **Grep tool**, or `findstr /n /r "pattern" path`.
> - `curl` → `curl.exe` (the bare `curl` alias in PowerShell is `Invoke-WebRequest`); `-o /dev/null` → `-o $null`; `| head -c 400` → `| Select-Object -First 20`.
> - Discovery "locate" steps that use `grep` may instead be run with the Grep tool directly.

> **Table-name convention for this phase:** the plan uses `public.storm_runs` (the storm-runs table) and `public.storm_events` (the stream/replay-events table), with `storm_id text` as the public id that matches the `[id]` route param, and `owner_id uuid` as the owner. **Task 3.1 Step 1 confirms these exact names against the existing migrations. If your schema names them differently (e.g. `runs` / `events`), substitute those names consistently in every task below.**

---

### Task 3.1: Migration — `is_demo` flag + anon read-only RLS on both tables

**Files:**
- Create: `supabase/migrations/20260707120000_demo_read_only.sql`

**Interfaces:**
- Consumes: nothing (pure DDL).
- Produces: columns `public.storm_runs.is_demo boolean not null default false` and `public.storm_events.is_demo boolean not null default false`; RLS policies `anon_select_demo_runs` (on `storm_runs`) and `anon_select_demo_events` (on `storm_events`), each `for select to anon using (is_demo = true)`.

> This migration keeps the version prefix `20260707120000`. The Phase 4 signup-credits migration uses a strictly-later prefix (`20260707120500`) so the two never collide.

- [ ] **Step 1: Confirm the real table + column names**

Run (Bash tool):
```bash
grep -rniE "create table.*\.(storm_runs|storm_events|runs|events)|owner_id|storm_id" supabase/migrations | head -n 40
```
Expected: shows the `create table` statements for the runs table and the events table, plus their `owner_id` and `storm_id` columns. Note the exact table names, the id column that equals the `[id]` route param (`storm_id`), and the owner column (`owner_id`). If they differ from `storm_runs` / `storm_events` / `storm_id` / `owner_id`, substitute your real names throughout this phase.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260707120000_demo_read_only.sql`:
```sql
-- Public no-signup demo: flag demo rows and expose them READ-ONLY to the anon role.
-- Additive + reversible. Touches no money-flow table and no engine output.

-- 1. Flag columns (idempotent).
alter table public.storm_runs
  add column if not exists is_demo boolean not null default false;

alter table public.storm_events
  add column if not exists is_demo boolean not null default false;

-- 2. RLS must be ON for the policy to be the security boundary (no-op if already on).
--    (If a table did not previously use RLS, verify existing authed access in Step 4.)
alter table public.storm_runs   enable row level security;
alter table public.storm_events enable row level security;

-- 3. Anonymous SELECT, restricted to demo rows, on BOTH tables (R14).
drop policy if exists anon_select_demo_runs   on public.storm_runs;
drop policy if exists anon_select_demo_events on public.storm_events;

create policy anon_select_demo_runs
  on public.storm_runs
  for select
  to anon
  using (is_demo = true);

create policy anon_select_demo_events
  on public.storm_events
  for select
  to anon
  using (is_demo = true);

-- 4. Small demo-only index for replay event lookups.
create index if not exists storm_events_demo_idx
  on public.storm_events (storm_id)
  where is_demo = true;
```

- [ ] **Step 3: Apply the migration to the local Supabase DB**

Run (Bash tool):
```bash
supabase start
supabase migration up
```
Expected: `Applying migration 20260707120000_demo_read_only.sql...` followed by `Finished supabase migration up.` with no error.

- [ ] **Step 4: Verify columns, policies, and the anon boundary (this is the test)**

Set `SUPABASE_DB_URL` to your local DB URL (from `supabase status`, e.g. `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), then run (Bash tool; PowerShell users export with `$env:SUPABASE_DB_URL = '…'`):
```bash
psql "$SUPABASE_DB_URL" -c "select table_name, column_name from information_schema.columns where table_name in ('storm_runs','storm_events') and column_name='is_demo' order by table_name;"
```
Expected:
```
 table_name  | column_name
-------------+-------------
 storm_events | is_demo
 storm_runs   | is_demo
(2 rows)
```
```bash
psql "$SUPABASE_DB_URL" -c "select policyname, tablename from pg_policies where policyname like 'anon_select_demo%' order by tablename;"
```
Expected:
```
      policyname        |  tablename
------------------------+--------------
 anon_select_demo_events | storm_events
 anon_select_demo_runs   | storm_runs
(2 rows)
```
```bash
psql "$SUPABASE_DB_URL" -c "set role anon; select count(*) from public.storm_runs where is_demo = false;"
```
Expected: `0` (RLS hides every non-demo row from the anon role, even with an explicit `is_demo = false` filter). If an authenticated read path exists in your app, confirm it still returns owned rows (existing owner policy) — if enabling RLS newly blocked authed reads on `storm_events`, add the same owner policy that `storm_runs` already uses.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707120000_demo_read_only.sql
git commit -m "feat: add is_demo flag and anon read-only RLS for the public demo"
```

---

### Task 3.2: Pure access predicate `canReadStormRow` (retrieval-layer core)

Extract the demo-bypass decision into a pure, exported function so the branch logic is unit-testable with zero Supabase mocking. Task 3.3 wires it into `ownedStormRow`.

**Files:**
- Modify: `apps/web/lib/server/stormStore.ts` (add exported predicate + types)
- Test: `apps/web/lib/server/stormStore.access.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `export interface StormAccessRow { owner_id: string | null; is_demo: boolean }`
  - `export interface StormViewer { userId: string | null; isAdmin: boolean }`
  - `export function canReadStormRow(row: StormAccessRow, viewer: StormViewer): boolean`

- [ ] **Step 1: Write the failing test (full branch matrix)**

Create `apps/web/lib/server/stormStore.access.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { canReadStormRow } from './stormStore';

describe('canReadStormRow', () => {
  it('lets ANY caller read a demo row (anonymous)', () => {
    expect(
      canReadStormRow({ owner_id: 'u1', is_demo: true }, { userId: null, isAdmin: false }),
    ).toBe(true);
  });

  it('lets the owner read their own non-demo row', () => {
    expect(
      canReadStormRow({ owner_id: 'u1', is_demo: false }, { userId: 'u1', isAdmin: false }),
    ).toBe(true);
  });

  it('lets an admin read any non-demo row', () => {
    expect(
      canReadStormRow({ owner_id: 'u1', is_demo: false }, { userId: 'admin', isAdmin: true }),
    ).toBe(true);
  });

  it('denies a non-owner reading a non-demo row', () => {
    expect(
      canReadStormRow({ owner_id: 'u1', is_demo: false }, { userId: 'u2', isAdmin: false }),
    ).toBe(false);
  });

  it('denies an anonymous caller reading a non-demo row', () => {
    expect(
      canReadStormRow({ owner_id: 'u1', is_demo: false }, { userId: null, isAdmin: false }),
    ).toBe(false);
  });

  it('denies an anonymous caller when owner_id is null on a non-demo row', () => {
    expect(
      canReadStormRow({ owner_id: null, is_demo: false }, { userId: null, isAdmin: false }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (Bash tool, from `apps/web`):
```bash
npx vitest run lib/server/stormStore.access.test.ts
```
Expected: FAIL — `canReadStormRow is not a function` / no matching export from `./stormStore`.

- [ ] **Step 3: Implement the predicate**

In `apps/web/lib/server/stormStore.ts`, add near the top of the file (immediately after the existing imports):
```ts
export interface StormAccessRow {
  owner_id: string | null;
  is_demo: boolean;
}

export interface StormViewer {
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Pure access decision for a storm row (retrieval-layer half of the demo path).
 * Demo rows (is_demo = true) are publicly readable by ANY caller, anonymous
 * included. Every other row stays owner-or-admin only; callers that fail this
 * check are given a 404 by `ownedStormRow` so real storm ids never leak.
 * RLS remains the true security boundary (Task 3.1); this is DRY convenience.
 */
export function canReadStormRow(row: StormAccessRow, viewer: StormViewer): boolean {
  if (row.is_demo) return true;
  if (viewer.isAdmin) return true;
  return viewer.userId !== null && viewer.userId === row.owner_id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (Bash tool, from `apps/web`):
```bash
npx vitest run --coverage lib/server/stormStore.access.test.ts
```
Expected: `6 passed`; coverage report shows **100% branch** coverage for `canReadStormRow` (the three branches `is_demo`, `isAdmin`, `userId === owner_id` are all exercised true and false).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server/stormStore.ts apps/web/lib/server/stormStore.access.test.ts
git commit -m "feat: add canReadStormRow pure access predicate for demo bypass"
```

---

### Task 3.3: Wire the `is_demo` bypass into `ownedStormRow`

`getStormMeta`, `getStreamData`, and `getStormReport` all funnel row access through `ownedStormRow`, so patching the one predicate call there gives all three the demo bypass (R17) while leaving non-demo behavior byte-identical (non-owners still get 404).

**Files:**
- Modify: `apps/web/lib/server/stormStore.ts` (`ownedStormRow` ownership check → `canReadStormRow`)

**Interfaces:**
- Consumes: `canReadStormRow(row, viewer)`, `StormViewer` (Task 3.2).
- Produces: `getStormMeta(stormId)`, `getStreamData(stormId)`, `getStormReport(stormId)` return the row to any caller when `row.is_demo === true`; unchanged 404 for non-owners of non-demo rows.

- [ ] **Step 1: Locate the ownership check and the three getters**

Run (Bash tool):
```bash
grep -nE "function ownedStormRow|getStormMeta|getStreamData|getStormReport|isAdmin|owner_id" apps/web/lib/server/stormStore.ts
```
Expected: shows `ownedStormRow`'s definition and its inline ownership conditional (e.g. `if (!isOwner && !isAdmin) throw ...`), plus the three getters delegating to it. Note the exact line of the conditional, how the current viewer identity is derived (session user id + admin flag), and the local variable that holds the fetched row.

- [ ] **Step 2: Replace the inline ownership conditional with `canReadStormRow`**

In `apps/web/lib/server/stormStore.ts`, inside `ownedStormRow`, after the row is fetched and the not-found check has run, replace the existing owner/admin conditional (the `if (!isOwner && !isAdmin) throw <NotFound>` block located in Step 1) with the call below. Keep the surrounding fetch, error handling, and return exactly as they are — only the access decision changes:
```ts
  // Demo rows are public; every other row stays owner-or-admin (else 404 so ids never leak).
  if (
    !canReadStormRow(
      { owner_id: data.owner_id, is_demo: data.is_demo === true },
      { userId, isAdmin },
    )
  ) {
    throw new NotFoundError();
  }
```
> Use whatever "not found" error the file already throws for non-owners (the `<NotFound>` in Step 1) in place of `NotFoundError()` above, and whatever local variables hold the row (`data`), the session user id (`userId`), and the admin flag (`isAdmin`). **If `getStreamData` or `getStormReport` fetch their row independently rather than via `ownedStormRow`, add the identical `canReadStormRow` guard at each of those fetch sites** so all three honor `is_demo`.

- [ ] **Step 3: Verify the existing unit tests still pass and the file type-checks**

Run (Bash tool, from `apps/web`):
```bash
npx vitest run lib/server/stormStore.access.test.ts
npx tsc --noEmit
```
Expected: `6 passed`; `tsc` exits `0` with no errors (behavioral coverage of the wired-in bypass is exercised end-to-end by the seed + curl checks in Tasks 3.5–3.6 and the later Playwright smoke).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/server/stormStore.ts
git commit -m "feat: honor is_demo bypass in ownedStormRow so demo rows are publicly retrievable"
```

---

### Task 3.4: Seed script — `scripts/seed_demo_storm.ts` (fixed-seed, idempotent)

Runs the real engine once in MOCK mode with a fixed RNG seed at `persona_count = 1000` over the PersonaPilot sample, then UPSERTs the completed run + its replay events under `DEMO_STORM_ID` with `is_demo = true` (R1/R2). Deterministic and idempotent.

**Files:**
- Create: `apps/web/scripts/seed_demo_storm.ts`
- Modify: `apps/web/package.json` (add `seed:demo` script + `tsx` dev dependency)

**Interfaces:**
- Consumes: `DEMO_STORM_ID: string` (`@/lib/server/demo`); `runStorm(options)` (`@/lib/server/engine`) returning `{ report, events }` where `report` already carries `verdict` + `top_actions`; `@supabase/supabase-js` `createClient`.
- Produces: an idempotent upsert of one `storm_runs` row (`storm_id = DEMO_STORM_ID`, `is_demo = true`, `status = 'complete'`, `report` JSON) and its `storm_events` rows (each `is_demo = true`).

- [ ] **Step 1: Locate the sample file and confirm the `runStorm` signature + run-row columns**

Run (Bash tool):
```bash
ls apps/web/data/sample_inputs 2>/dev/null; ls data/sample_inputs 2>/dev/null
grep -nE "export .*function runStorm|runStorm" apps/web/lib/server/engine/index.ts apps/web/lib/server/engine/*.ts | head
```
Expected: the first line shows the PersonaPilot sample filename (e.g. `personapilot.json`); the second shows `runStorm`'s exported signature and options (provider mode, persona count, seed) and that it returns a report + persisted events. Note the exact sample path, the `runStorm` option names, and — from Task 3.1 Step 1 — the required (NOT NULL) columns of `storm_runs`. Adjust `SAMPLE_PATH`, the `runStorm({...})` option keys, and the upsert column set in Step 2 to match what you find.

- [ ] **Step 2: Write the seed script**

Create `apps/web/scripts/seed_demo_storm.ts`:
```ts
/**
 * Seed (or re-seed) the public demo storm.
 *
 * Runs the real engine ONCE in MOCK mode with a FIXED RNG SEED at
 * persona_count = 1000 against the PersonaPilot AI-SaaS sample, then UPSERTS
 * the completed run + its replay events under DEMO_STORM_ID with is_demo = true.
 * Deterministic + idempotent: re-running overwrites the same row, never dupes.
 *
 * Run with:  npm --workspace apps/web run seed:demo
 * Requires:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runStorm } from '@/lib/server/engine';
import { DEMO_STORM_ID } from '@/lib/server/demo';

const DEMO_PERSONA_COUNT = 1000;
const DEMO_RNG_SEED = 1337;
// Adjust to the path/filename confirmed in Step 1.
const SAMPLE_PATH = resolve(__dirname, '../data/sample_inputs/personapilot.json');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const sample = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as {
    stimulus: string;
    stimulus_type: string;
    target_market: string;
  };

  console.log(`[seed] running engine (mock, seed=${DEMO_RNG_SEED}, n=${DEMO_PERSONA_COUNT})...`);
  const { report, events } = await runStorm({
    stimulus: sample.stimulus,
    stimulusType: sample.stimulus_type,
    targetMarket: sample.target_market,
    personaCount: DEMO_PERSONA_COUNT,
    provider: 'mock',
    seed: DEMO_RNG_SEED,
  });

  if (!report.verdict || !report.top_actions) {
    throw new Error('[seed] engine did not attach verdict/top_actions — land the verdict-core phase first');
  }

  console.log(`[seed] upserting run row ${DEMO_STORM_ID}...`);
  const { error: runError } = await supabase.from('storm_runs').upsert(
    {
      storm_id: DEMO_STORM_ID,
      is_demo: true,
      owner_id: null,
      status: 'complete',
      stimulus: sample.stimulus,
      stimulus_type: sample.stimulus_type,
      target_market: sample.target_market,
      persona_count: DEMO_PERSONA_COUNT,
      report,
    },
    { onConflict: 'storm_id' },
  );
  if (runError) throw runError;

  console.log(`[seed] replacing ${events.length} replay events...`);
  const { error: deleteError } = await supabase
    .from('storm_events')
    .delete()
    .eq('storm_id', DEMO_STORM_ID);
  if (deleteError) throw deleteError;

  const rows = events.map((event, index) => ({
    storm_id: DEMO_STORM_ID,
    is_demo: true,
    seq: index,
    type: event.type,
    payload: event,
  }));
  const { error: insertError } = await supabase.from('storm_events').insert(rows);
  if (insertError) throw insertError;

  console.log(`[seed] done: ${DEMO_STORM_ID} (${events.length} events).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```
> Column names in both `upsert` and the events `insert` must match the schema confirmed in Task 3.1 Step 1. Include every NOT NULL column your `storm_runs` schema requires; drop any column above that your schema does not have. The `@/…` imports resolve because `tsx` is run through the `apps/web` tsconfig `@/*` paths mapping (Phase 0); if your `tsx` invocation does not honor tsconfig paths, add `tsconfig-paths/register` or switch these two imports to relative form.

- [ ] **Step 3: Add the npm script and `tsx` runner**

Run (Bash tool, from repo root):
```bash
npm --workspace apps/web add -D tsx
```
Then add to the `"scripts"` block of `apps/web/package.json`:
```json
    "seed:demo": "tsx scripts/seed_demo_storm.ts"
```

- [ ] **Step 4: Run the seed against the local DB**

Run (Bash tool, from repo root; values from `supabase status`):
```bash
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key_from_supabase_status>" \
npm --workspace apps/web run seed:demo
```
PowerShell equivalent (env vars must be set on their own lines — there is no inline prefix):
```powershell
$env:SUPABASE_URL = 'http://127.0.0.1:54321'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service_role_key_from_supabase_status>'
npm --workspace apps/web run seed:demo
```
Expected stdout:
```
[seed] running engine (mock, seed=1337, n=1000)...
[seed] upserting run row demo-personapilot...
[seed] replacing <N> replay events...
[seed] done: demo-personapilot (<N> events).
```

- [ ] **Step 5: Verify the seeded row + events + verdict (this is the test)**

Run (Bash tool; `$SUPABASE_DB_URL` as set in Task 3.1 Step 4 — PowerShell users use `$env:SUPABASE_DB_URL`):
```bash
psql "$SUPABASE_DB_URL" -c "select storm_id, is_demo, status, (report ? 'verdict') as has_verdict, (report ? 'top_actions') as has_actions from public.storm_runs where storm_id='demo-personapilot';"
```
Expected:
```
   storm_id       | is_demo |  status  | has_verdict | has_actions
------------------+---------+----------+-------------+-------------
 demo-personapilot| t       | complete | t           | t
(1 row)
```
```bash
psql "$SUPABASE_DB_URL" -c "select count(*) as events, bool_and(is_demo) as all_demo from public.storm_events where storm_id='demo-personapilot';"
```
Expected: `events` > 0 and `all_demo = t`.

- [ ] **Step 6: Verify idempotency (re-run makes no duplicates)**

Re-run the same seed command from Step 4, then:
```bash
psql "$SUPABASE_DB_URL" -c "select count(*) from public.storm_runs where storm_id='demo-personapilot';"
```
Expected: `1` (upsert overwrote the same row; no duplicate).

- [ ] **Step 7: Commit**

```bash
git add apps/web/scripts/seed_demo_storm.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add idempotent fixed-seed demo storm seed script"
```

---

### Task 3.5: `/demo` entry route with graceful fallback

A thin route handler that redirects to the demo storm when the fixture exists, and degrades to the landing page (never a raw 404) when `getStormMeta(DEMO_STORM_ID)` is `null` (R1, §7.2 "Demo fixture missing"). The landing page's `?demo=unavailable` banner that this redirect targets is rendered by the Phase 4 `app/page.tsx` edit.

**Files:**
- Create: `apps/web/app/demo/route.ts`
- Test: `apps/web/app/demo/route.test.ts`

**Interfaces:**
- Consumes: `DEMO_STORM_ID: string` (`@/lib/server/demo`); `getStormMeta(stormId: string): Promise<StormMeta | null>` (`@/lib/server/stormStore`).
- Produces: `export async function GET(request: Request): Promise<NextResponse>` — 307 redirect to `/storm/${DEMO_STORM_ID}` when meta present; 307 redirect to `/?demo=unavailable` when meta is `null`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/demo/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/stormStore', () => ({
  getStormMeta: vi.fn(),
}));

import { getStormMeta } from '@/lib/server/stormStore';
import { DEMO_STORM_ID } from '@/lib/server/demo';
import { GET } from './route';

const mockedGetStormMeta = vi.mocked(getStormMeta);

describe('GET /demo', () => {
  beforeEach(() => {
    mockedGetStormMeta.mockReset();
  });

  it('redirects to the demo storm when the fixture exists', async () => {
    mockedGetStormMeta.mockResolvedValue({ storm_id: DEMO_STORM_ID, is_demo: true } as never);
    const res = await GET(new Request('https://app.test/demo'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`https://app.test/storm/${DEMO_STORM_ID}`);
  });

  it('falls back to the landing page when the fixture is missing', async () => {
    mockedGetStormMeta.mockResolvedValue(null);
    const res = await GET(new Request('https://app.test/demo'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.test/?demo=unavailable');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (Bash tool, from `apps/web`):
```bash
npx vitest run app/demo/route.test.ts
```
Expected: FAIL — cannot resolve `./route` / `GET is not a function`.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/demo/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { DEMO_STORM_ID } from '@/lib/server/demo';
import { getStormMeta } from '@/lib/server/stormStore';

// Live DB lookup on every hit — never statically cache this redirect.
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const meta = await getStormMeta(DEMO_STORM_ID);
  if (!meta) {
    // Graceful fallback (R1/§7.2): never surface a raw 404 to an anonymous
    // evaluator. The landing page reads ?demo=unavailable to show
    // "Demo unavailable — run your own" (Phase 4 app/page.tsx edit).
    return NextResponse.redirect(new URL('/?demo=unavailable', request.url));
  }
  return NextResponse.redirect(new URL(`/storm/${DEMO_STORM_ID}`, request.url));
}
```
> The `@/` alias resolves to the `apps/web` root in both `tsconfig.json` and `vitest.config.ts` (established in Phase 0), so these two imports resolve in the route and its test with no per-file path adjustment.

- [ ] **Step 4: Run the test to verify it passes**

Run (Bash tool, from `apps/web`):
```bash
npx vitest run app/demo/route.test.ts
```
Expected: `2 passed`.

- [ ] **Step 5: Verify against the running dev server (seeded demo present)**

Start the dev server (`npm --workspace apps/web run dev`), then run (Bash tool):
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/demo
```
PowerShell equivalent: `curl.exe -s -o $null -w "%{http_code} %{redirect_url}`n" http://localhost:3000/demo`
Expected: `307 http://localhost:3000/storm/demo-personapilot`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/demo/route.ts apps/web/app/demo/route.test.ts
git commit -m "feat: add /demo entry route with graceful demo-unavailable fallback"
```

---

### Task 3.6: Stream route — anon-client fallback for anonymous streaming

The only structural change to the streaming path (R14/R17): when there is no session token, build the **anon** Supabase client so RLS confines the read to `is_demo = true` rows; a returned row is by definition the demo and streams; an empty result is a 404 (never leaks a non-demo id). Authed users keep passing their `?access_token=` and read their own runs exactly as today.

**Files:**
- Modify: `apps/web/app/api/storm/[id]/stream/route.ts`

**Interfaces:**
- Consumes: `?access_token=` query param; `@supabase/supabase-js` `createClient`; the existing SSE replay logic and `getStreamData` (unchanged below the client-selection point).
- Produces: anonymous callers stream `is_demo` rows; empty read → `Response('Not found', { status: 404 })`; authed behavior unchanged.

- [ ] **Step 1: Locate the current client construction, token read, row read, and stream block (discovery for the edit)**

Run (Bash tool; or the Grep tool with the same pattern):
```bash
grep -nE "access_token|createClient|createServerClient|getStreamData|new Response|ReadableStream|controller.enqueue" apps/web/app/api/storm/[id]/stream/route.ts
```
Expected: prints line numbers for (a) the `access_token` read from the query string, (b) the current Supabase client construction, (c) the row/events read (an inline `select` or a `getStreamData(...)` call), and (d) the `new ReadableStream(...)` that emits the SSE frames (init/reaction/progress/complete, 120ms flush, reconnect cursor). Record those four anchors — call them **L_token**, **L_client**, **L_read**, **L_stream**. The edit below rewrites the construction at **L_client** and inserts a 404 guard just after **L_read**; **everything from L_stream onward is left byte-for-byte unchanged.**

- [ ] **Step 2: Add the client selector and thread it into the read**

In `apps/web/app/api/storm/[id]/stream/route.ts`, add the helper near the top (after the existing imports):
```ts
import { createClient } from '@supabase/supabase-js';

/**
 * Choose the Supabase client for a stream request.
 * No token -> ANON client. RLS restricts the anon role to is_demo = true rows,
 * so any row it returns IS the demo and is streamed with no token (R14). The
 * RLS policy — not an app-side is_demo check — is the security boundary.
 * With a token -> the caller's authed client, reading their own runs as before.
 */
function buildStreamClient(accessToken: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```
Then, inside `GET`, at anchor **L_client** replace the current token-derived client construction with the selector below, and immediately after the row read at **L_read** insert the empty→404 guard:
```ts
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get('access_token'); // null for the anonymous demo path
  const supabase = buildStreamClient(accessToken);

  // RLS returns the row only if is_demo (anon) or owned (authed). Empty -> 404,
  // so a non-demo id is never confirmed to an anonymous caller.
  const { data: row } = await supabase
    .from('storm_runs')
    .select('storm_id, is_demo, status')
    .eq('storm_id', params.id)
    .maybeSingle();

  if (!row) {
    return new Response('Not found', { status: 404 });
  }
```
**Do not paste any placeholder for the streaming body.** Everything from anchor **L_stream** onward — the existing `new ReadableStream(...)` that emits the persisted init/reaction/progress/complete frames with the 120ms flush and the reconnect cursor — is left exactly as found in Step 1; it already streams `row.storm_id`. If the route currently reads the row via `getStreamData` instead of the inline `select` above, pass the `supabase` you built here into that call (so the anon client is the one that hits RLS) and keep the identical empty→404 guard on its result; do not duplicate the inline `select`.

- [ ] **Step 3: Verify the anonymous demo stream (this is the test)**

With the dev server running and the demo seeded (Task 3.4), run the anonymous stream with **no** token (Bash tool):
```bash
curl -s -N http://localhost:3000/api/storm/demo-personapilot/stream | head -c 400
```
PowerShell equivalent: `curl.exe -s -N http://localhost:3000/api/storm/demo-personapilot/stream | Select-Object -First 20`
Expected: Server-Sent-Events output beginning with an `event: init` frame and `data:` lines (progressing toward `event: complete`) — proving an anonymous caller streams the demo with no `access_token`.

- [ ] **Step 4: Verify a non-demo id 404s for an anonymous caller**

Pick any non-demo `storm_id` present in the DB (or a random one), then run with no token (Bash tool):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/storm/00000000-0000-0000-0000-000000000000/stream
```
PowerShell equivalent: `curl.exe -s -o $null -w "%{http_code}`n" http://localhost:3000/api/storm/00000000-0000-0000-0000-000000000000/stream`
Expected: `404` (RLS hides non-demo rows from the anon client, so the id is never confirmed).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/storm/[id]/stream/route.ts
git commit -m "feat: fall back to anon Supabase client for anonymous demo streaming"
```

---

**Phase 3 exit criteria:** the migration adds `is_demo` + anon RLS on both tables (Task 3.1, version prefix `20260707120000`); `canReadStormRow` is branch-covered and wired into `ownedStormRow` so `getStormMeta`/`getStreamData`/`getStormReport` serve demo rows to anyone (Tasks 3.2–3.3); the seed script deterministically upserts the PersonaPilot demo run with `verdict`/`top_actions` and replay events (Task 3.4); `/demo` redirects or degrades gracefully to `/?demo=unavailable` (Task 3.5, with the landing banner rendered by the Phase 4 `app/page.tsx` edit); and the stream route streams the demo to anonymous callers over the anon client while 404-ing non-demo ids (Task 3.6). The `/api/storm/[id]/report` route is untouched — anonymous report access flows entirely through the Task 3.3 retrieval bypass + RLS. The landing "Watch live" CTA and the end-to-end Playwright smoke that exercises this whole chain belong to later phases.

---

## Phase 4 - Activation extras (signup credits, stimulus helper, landing CTA)

This phase delivers Workstream-1 activation extras: once-per-user signup demo credits (R15), the pre-spend stimulus helper (R13), the one-time welcome toast (R15), the landing "Watch live" CTA (§4.6), and the "Demo unavailable" landing notice that completes R1's fallback (paired with Phase 3 Task 3.5's `/?demo=unavailable` redirect). All work is additive and UX-layer in `apps/web`; nothing here changes engine numbers, the money-flow (concurrency guard / atomic debit / refund), or `apps/api`.

**Constraints inherited by every task in this phase**
- Node 18.17+, Next.js 14 App Router, TypeScript, Tailwind, Supabase. Additive only — never delete existing depth.
- HARD: do NOT build/optimize any pricing/purchase/buy-credits surface. Signup credits are an activation aid, not payments.
- HARD: do NOT change engine numeric outputs; do NOT touch `apps/api`.
- Naming: PascalCase components/types, camelCase functions/vars, UPPER_SNAKE_CASE constants, `use`-prefixed hooks.
- User-facing copy contains NO hardcoded persona counts or panel counts. The welcome toast reads the ACTUAL granted balance (never a literal number).
- Reuse the existing `adjust_wallet_balance` atomic wallet path for the grant. Idempotent on user id. Never write directly to the `wallets` table.
- Imports use the `@/` root alias exclusively (e.g. `@/lib/...`, `@/components/...`), matching Phases 3/5/6. Never mix bare `lib/...` imports.

**Prerequisites delivered by earlier phases (assumed present — do NOT recreate)**
- `apps/web/lib/server/demo.ts` exists and exports, from Phase 0 Task 0.3, ALL THREE of: `DEMO_STORM_ID = "demo-personapilot"` (client-safe), `MAX_RUN_CREDIT_COST` (the verified credit cost of the largest — 1200-persona — run, read from the pricing module), and `DEMO_SIGNUP_CREDITS = MAX_RUN_CREDIT_COST * 2`. **This phase CONSUMES `DEMO_SIGNUP_CREDITS`; it never redeclares it.** A second `export const DEMO_SIGNUP_CREDITS` in this file would be a TypeScript `TS2451` duplicate-identifier error and break `tsc --noEmit`.
- `apps/web/app/demo/route.ts` exists (redirects to `/storm/${DEMO_STORM_ID}`), so `/demo` is a valid href.
- The `@/*` path alias is established once in Phase 0: `"paths": { "@/*": ["./*"] }` in `apps/web/tsconfig.json` and the matching `resolve.alias` (`'@' → apps/web root`) in the single `apps/web/vitest.config.ts`. Both bare-less `@/` imports and the vitest coverage gate (`coverage.include=['lib/server/engine/verdict.ts', ...]`, 100% branch thresholds) live in that one config; this phase adds nothing to it.
- Vitest is configured (jsdom default env; `@testing-library/jest-dom` registered in the setup file). `npm test` maps to `vitest`; the coverage script is `test:coverage`.
- The `is_demo` + RLS migration landed in Phase 3 Task 3.1 as `supabase/migrations/20260707120000_demo_read_only.sql`. This phase's signup-credit migration uses a STRICTLY LATER timestamp (`20260707120500`) so Supabase's version ordering never collides.

**Assumed neighboring interface (single documented coupling point)**
- `lib/server/engine/stimulusParser.ts` exports `parseStimulus(text: string): ParsedStimulus`, where the object exposes `prices: number[]`, `hasTrustSignal: boolean`, `hasCta: boolean`. If the real field names differ, the ONLY place to adjust is `toDetectedSignals` in Task 4.3. Confirm the export name/fields against the module before Task 4.4.

**Command working directories & shell**
- `npm` / `npx` / `node` commands run from `apps/web/`.
- `supabase` / `psql` commands run from the repo root `C:/Users/Admin/Downloads/amd/`.
- All commands below use only cross-platform executables (no bash-only syntax); they run identically in PowerShell and in the Bash tool.

---

### Task 4.1 - Guard test for the single-source `DEMO_SIGNUP_CREDITS` constant

`DEMO_SIGNUP_CREDITS` is owned by Phase 0 Task 0.3. This task adds NO source change — it only lands a regression-guard test that pins the R15 invariant (grant ≥ 2× the largest run's cost) against that single source. Because the constant already exists, the test passes on first run: **there is no red step here** (additive guard against already-shipped code).

**Files**
- Test: `apps/web/lib/server/demo.credits.test.ts` (Create)
- (No source modification — `apps/web/lib/server/demo.ts` is untouched by this phase.)

**Interfaces**
- Consumes: `DEMO_SIGNUP_CREDITS: number` and `MAX_RUN_CREDIT_COST: number` from `@/lib/server/demo` (both exported by Phase 0 Task 0.3).
- Produces: nothing (test only).

**Steps**
- [ ] Confirm the constant already exists (single source of truth). From `apps/web`:

```
npx rg -n "DEMO_SIGNUP_CREDITS|MAX_RUN_CREDIT_COST" lib/server/demo.ts
```

Expected (two exports, credits derived from cost — exact number depends on Phase 0's verified pricing):

```
lib/server/demo.ts:NN:export const MAX_RUN_CREDIT_COST = 120
lib/server/demo.ts:NN:export const DEMO_SIGNUP_CREDITS = MAX_RUN_CREDIT_COST * 2
```

If `DEMO_SIGNUP_CREDITS` is missing, STOP — it is a Phase 0 deliverable and must not be added here.

- [ ] Create the guard test `apps/web/lib/server/demo.credits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEMO_SIGNUP_CREDITS, MAX_RUN_CREDIT_COST } from '@/lib/server/demo'

// Regression guard on the R15 invariant. Both values come from the single source
// (lib/server/demo.ts, Phase 0 Task 0.3). This test does NOT invent a competing
// literal; it protects against a future edit that lowers the grant below 2x the
// largest run's credit cost.
describe('DEMO_SIGNUP_CREDITS', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(DEMO_SIGNUP_CREDITS)).toBe(true)
    expect(DEMO_SIGNUP_CREDITS).toBeGreaterThan(0)
  })

  it('grants at least 2x the credit cost of the largest run (R15)', () => {
    expect(DEMO_SIGNUP_CREDITS).toBeGreaterThanOrEqual(2 * MAX_RUN_CREDIT_COST)
  })
})
```

- [ ] Run it. It passes immediately (the constant already exists — no red step):

```
npx vitest run lib/server/demo.credits.test.ts
```

Expected:

```
 ✓ lib/server/demo.credits.test.ts (2 tests) 4ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit:

```
git add apps/web/lib/server/demo.credits.test.ts
git commit -m "test: guard DEMO_SIGNUP_CREDITS >= 2x largest-run cost (R15)"
```

---

### Task 4.2 - Signup-credit auth trigger migration (idempotent, reuses `adjust_wallet_balance`)

A Supabase migration that seeds `DEMO_SIGNUP_CREDITS` exactly once per new user via an `auth.users` AFTER INSERT trigger, reusing the atomic wallet path. A Vitest sync test reads the TS constant and asserts the SQL literal equals it, so the two can never drift. No raw writes to the `wallets` table (money-flow stays sanctioned).

**Files**
- Create: `supabase/migrations/20260707120500_signup_demo_credits.sql` (later timestamp than the Phase 3 `..._demo_read_only.sql` — no version collision)
- Test: `apps/web/lib/server/demo.signup-credits.test.ts` (Create)

**Interfaces**
- Consumes: existing RPC `public.adjust_wallet_balance(uuid, integer)` (positive delta = credit; never overdraws). Confirm exact signature before finalizing.
- Produces: table `public.signup_grants(user_id uuid pk, granted_at timestamptz)`; function `public.grant_signup_demo_credits() returns trigger`; trigger `on_auth_user_created_grant_credits on auth.users`.

**Steps**
- [ ] Read the single-source value so the migration literal matches it. From `apps/web`:

```
node -e "import('./lib/server/demo.ts').catch(()=>{}); const s=require('fs').readFileSync('lib/server/demo.ts','utf8'); const cost=+(s.match(/MAX_RUN_CREDIT_COST\s*=\s*(\d+)/)||[])[1]; console.log('DEMO_SIGNUP_CREDITS =', cost*2)"
```

Expected (the number is whatever Phase 0 verified; example shown for `MAX_RUN_CREDIT_COST = 120`):

```
DEMO_SIGNUP_CREDITS = 240
```

Use THAT integer wherever `240` appears below. The sync test mechanically enforces equality, so if your Phase 0 value differs the test will fail until the migration literal matches — substitute your number in both the SQL and re-run.

- [ ] Write the failing sync test. Create `apps/web/lib/server/demo.signup-credits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEMO_SIGNUP_CREDITS } from '@/lib/server/demo'

// vitest cwd is apps/web; the migration lives two levels up under supabase/migrations.
const MIGRATION_PATH = resolve(
  process.cwd(),
  '../../supabase/migrations/20260707120500_signup_demo_credits.sql',
)

describe('signup demo-credit migration', () => {
  it('hardcodes the same credit amount as DEMO_SIGNUP_CREDITS', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8')
    expect(sql).toContain(`DEMO_SIGNUP_CREDITS = ${DEMO_SIGNUP_CREDITS}`)
    expect(sql).toContain(`v_credits constant integer := ${DEMO_SIGNUP_CREDITS};`)
  })
})
```

- [ ] Run it and see it fail (file does not exist yet):

```
npx vitest run lib/server/demo.signup-credits.test.ts
```

Expected:

```
 FAIL  lib/server/demo.signup-credits.test.ts > signup demo-credit migration > hardcodes the same credit amount as DEMO_SIGNUP_CREDITS
Error: ENOENT: no such file or directory, open '.../supabase/migrations/20260707120500_signup_demo_credits.sql'
 Test Files  1 failed (1)
```

- [ ] Create the migration `supabase/migrations/20260707120500_signup_demo_credits.sql` (replace `240` with your Phase 0 value throughout if it differs):

```sql
-- Grants a one-time onboarding credit balance to every new user (activation aid, NOT payments).
-- Idempotent per user id via public.signup_grants; reuses the existing atomic wallet path
-- public.adjust_wallet_balance. Spec R15 / §4.7. Money-flow (debit/refund/concurrency) untouched.
-- No direct writes to public.wallets: the sanctioned RPC owns wallet state.
-- DEMO_SIGNUP_CREDITS = 240  (keep in sync with apps/web/lib/server/demo.ts; enforced by demo.signup-credits.test.ts)

-- 1. Ledger of accounts that have already received the signup grant (idempotency boundary).
create table if not exists public.signup_grants (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.signup_grants enable row level security;
-- No policies: only the SECURITY DEFINER trigger function touches this table.

-- 2. Trigger function: seed credits exactly once per new user.
create or replace function public.grant_signup_demo_credits()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_credits constant integer := 240;  -- DEMO_SIGNUP_CREDITS (sync: apps/web/lib/server/demo.ts)
  v_rows integer := 0;
begin
  -- Claim the once-per-user slot atomically. If already granted, do nothing.
  insert into public.signup_grants (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  get diagnostics v_rows = row_count;  -- 1 when we just claimed it, 0 when already granted

  if v_rows > 0 then
    -- Reuse the existing atomic wallet path. Positive delta = credit, never overdraws.
    perform public.adjust_wallet_balance(new.id, v_credits);
  end if;

  return new;
end;
$$;

-- 3. Fire after each new auth user is created.
drop trigger if exists on_auth_user_created_grant_credits on auth.users;
create trigger on_auth_user_created_grant_credits
  after insert on auth.users
  for each row
  execute function public.grant_signup_demo_credits();
```

- [ ] Run the sync test and see it pass:

```
npx vitest run lib/server/demo.signup-credits.test.ts
```

Expected:

```
 ✓ lib/server/demo.signup-credits.test.ts (1 test) 3ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- [ ] Apply the migration and confirm the reused RPC signature matches the positional call (from repo root):

```
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.adjust_wallet_balance"
```

Expected: one row whose argument list is `uuid, integer` (in that order). If the real definition uses different parameter names/order, edit the `perform public.adjust_wallet_balance(new.id, v_credits);` call to named args (e.g. `adjust_wallet_balance(p_user_id => new.id, p_delta => v_credits)`), then re-run `supabase db reset`.

- [ ] Confirm `adjust_wallet_balance` creates the wallet row for a brand-new user (so we never touch `public.wallets` directly). From repo root:

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\sf public.adjust_wallet_balance"
```

Expected: the function body upserts/inserts the wallet row (e.g. `insert into ... on conflict (user_id) do update`). If — and ONLY if — its body instead requires a pre-existing wallet row, discover the sanctioned wallet-initialization RPC and call it (never a raw INSERT):

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\df public.*wallet*"
```

Then add, immediately before the credit `perform`, a call to the wallet-init RPC named in that output (e.g. `perform public.ensure_wallet(new.id);`), and re-run `supabase db reset`. Do NOT add ad-hoc `insert into public.wallets ...`.

- [ ] Verify the trigger and function landed (from repo root):

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select tgname from pg_trigger where tgname = 'on_auth_user_created_grant_credits';"
```

Expected:

```
              tgname
-----------------------------------
 on_auth_user_created_grant_credits
(1 row)
```

- [ ] Verify the once-per-user grant end to end: sign up a throwaway user through the local Supabase Auth (Studio or the app signup form), then assert the ledger + balance (from repo root, replace the email):

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select g.user_id, g.granted_at from public.signup_grants g join auth.users u on u.id = g.user_id where u.email = 'probe@example.com';"
```

Expected: exactly one `signup_grants` row for that user (idempotency holds; a second signup of the same account never adds a second row). Confirm that user's wallet balance equals `DEMO_SIGNUP_CREDITS` (240 in the example):

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select balance from public.wallets w join auth.users u on u.id = w.user_id where u.email = 'probe@example.com';"
```

Expected: `240` (or your Phase 0 value).

- [ ] Commit:

```
git add supabase/migrations/20260707120500_signup_demo_credits.sql apps/web/lib/server/demo.signup-credits.test.ts
git commit -m "feat: seed DEMO_SIGNUP_CREDITS once per new user via auth trigger"
```

---

### Task 4.3 - Pure detected-signals module (`toDetectedSignals`, `summarizeSignals`)

The pure, dependency-free core of the stimulus helper: normalize a parser result into a small display shape and render the human summary string (e.g. `"2 prices, a trust signal, no clear CTA"`). Kept out of the route so it is testable without importing the server-only parser, and safe to import isomorphically (no server-only deps).

**Files**
- Create: `apps/web/lib/server/stimulusSignals.ts`
- Test: `apps/web/lib/server/stimulusSignals.test.ts` (Create)

**Interfaces**
- Consumes: a structurally-typed `ParserResultLike { prices?: unknown; hasTrustSignal?: unknown; hasCta?: unknown }` (the subset `parseStimulus` output must satisfy — the one coupling point).
- Produces:
  - `export const MIN_STIMULUS_LENGTH = 20`
  - `export type DetectedSignals = { priceCount: number; hasTrustSignal: boolean; hasClearCta: boolean }`
  - `export type InspectResponse = { signals: DetectedSignals; summary: string }`
  - `export function toDetectedSignals(parsed: ParserResultLike): DetectedSignals`
  - `export function summarizeSignals(s: DetectedSignals): string`

**Steps**
- [ ] Write the failing test. Create `apps/web/lib/server/stimulusSignals.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { toDetectedSignals, summarizeSignals } from '@/lib/server/stimulusSignals'

describe('toDetectedSignals', () => {
  it('normalizes a full parser result', () => {
    expect(toDetectedSignals({ prices: [10, 20], hasTrustSignal: true, hasCta: false })).toEqual({
      priceCount: 2,
      hasTrustSignal: true,
      hasClearCta: false,
    })
  })

  it('defaults every field defensively when the parser result is sparse', () => {
    expect(toDetectedSignals({})).toEqual({
      priceCount: 0,
      hasTrustSignal: false,
      hasClearCta: false,
    })
  })
})

describe('summarizeSignals', () => {
  it('renders the canonical multi-signal summary', () => {
    expect(
      summarizeSignals({ priceCount: 2, hasTrustSignal: true, hasClearCta: false }),
    ).toBe('2 prices, a trust signal, no clear CTA')
  })

  it('uses singular for exactly one price', () => {
    expect(
      summarizeSignals({ priceCount: 1, hasTrustSignal: false, hasClearCta: true }),
    ).toBe('1 price, no trust signal, a clear CTA')
  })

  it('says "no prices" when none are detected', () => {
    expect(
      summarizeSignals({ priceCount: 0, hasTrustSignal: true, hasClearCta: true }),
    ).toBe('no prices, a trust signal, a clear CTA')
  })
})
```

- [ ] Run it and see it fail (module missing):

```
npx vitest run lib/server/stimulusSignals.test.ts
```

Expected:

```
 FAIL  lib/server/stimulusSignals.test.ts [ lib/server/stimulusSignals.test.ts ]
Error: Failed to resolve import "@/lib/server/stimulusSignals"
```

- [ ] Implement `apps/web/lib/server/stimulusSignals.ts`:

```ts
/**
 * Pure, dependency-free helpers behind the /api/stimulus/inspect route.
 * No server-only imports here so both the route and unit tests (and, if ever needed,
 * client code) can import it freely.
 */

export const MIN_STIMULUS_LENGTH = 20

export type DetectedSignals = {
  priceCount: number
  hasTrustSignal: boolean
  hasClearCta: boolean
}

export type InspectResponse = {
  signals: DetectedSignals
  summary: string
}

/**
 * The subset of parseStimulus's output this feature reads. If the real parser uses
 * different field names, this is the ONLY place to change them.
 */
export type ParserResultLike = {
  prices?: unknown
  hasTrustSignal?: unknown
  hasCta?: unknown
}

export function toDetectedSignals(parsed: ParserResultLike): DetectedSignals {
  return {
    priceCount: Array.isArray(parsed.prices) ? parsed.prices.length : 0,
    hasTrustSignal: Boolean(parsed.hasTrustSignal),
    hasClearCta: Boolean(parsed.hasCta),
  }
}

export function summarizeSignals(s: DetectedSignals): string {
  const priceClause =
    s.priceCount === 0 ? 'no prices' : s.priceCount === 1 ? '1 price' : `${s.priceCount} prices`
  const trustClause = s.hasTrustSignal ? 'a trust signal' : 'no trust signal'
  const ctaClause = s.hasClearCta ? 'a clear CTA' : 'no clear CTA'
  return `${priceClause}, ${trustClause}, ${ctaClause}`
}
```

- [ ] Run it and see it pass:

```
npx vitest run lib/server/stimulusSignals.test.ts
```

Expected:

```
 ✓ lib/server/stimulusSignals.test.ts (5 tests) 5ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

- [ ] Commit:

```
git add apps/web/lib/server/stimulusSignals.ts apps/web/lib/server/stimulusSignals.test.ts
git commit -m "feat: add pure detected-signals summarizer for stimulus helper"
```

---

### Task 4.4 - `POST /api/stimulus/inspect` route (server-only parser, no credits)

The thin server route that runs the server-only `parseStimulus` on a posted draft and returns detected-signals JSON. The client never imports the parser (R13).

**Files**
- Create: `apps/web/app/api/stimulus/inspect/route.ts`
- Test: `apps/web/app/api/stimulus/inspect/route.test.ts` (Create)

**Interfaces**
- Consumes: `parseStimulus(text: string): ParsedStimulus` from `@/lib/server/engine/stimulusParser`; `toDetectedSignals`, `summarizeSignals`, `MIN_STIMULUS_LENGTH` from `@/lib/server/stimulusSignals`.
- Produces: `export async function POST(request: Request): Promise<Response>`. On success `200 { signals, summary }` (`InspectResponse`); on invalid input `400 { error }`. No inference, no persona generation, no credit consumption.

**Steps**
- [ ] Write the failing test. Create `apps/web/app/api/stimulus/inspect/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/server/engine/stimulusParser', () => ({
  parseStimulus: vi.fn(),
}))

import { parseStimulus } from '@/lib/server/engine/stimulusParser'
import { POST } from './route'

const mockedParse = vi.mocked(parseStimulus)

function post(body: unknown): Request {
  return new Request('http://localhost/api/stimulus/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/stimulus/inspect', () => {
  beforeEach(() => {
    mockedParse.mockReset()
  })

  it('returns detected signals for a valid draft', async () => {
    mockedParse.mockReturnValue({ prices: [10, 20], hasTrustSignal: true, hasCta: false } as never)

    const res = await POST(post({ text: 'A serious product concept with real detail here' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.summary).toBe('2 prices, a trust signal, no clear CTA')
    expect(json.signals).toEqual({ priceCount: 2, hasTrustSignal: true, hasClearCta: false })
    expect(mockedParse).toHaveBeenCalledOnce()
  })

  it('rejects a draft below the minimum length without invoking the parser', async () => {
    const res = await POST(post({ text: 'too short' }))
    expect(res.status).toBe(400)
    expect(mockedParse).not.toHaveBeenCalled()
  })

  it('rejects a non-string text field', async () => {
    const res = await POST(post({ text: 42 }))
    expect(res.status).toBe(400)
    expect(mockedParse).not.toHaveBeenCalled()
  })

  it('rejects an invalid JSON body', async () => {
    const req = new Request('http://localhost/api/stimulus/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] Run it and see it fail (route missing):

```
npx vitest run app/api/stimulus/inspect/route.test.ts
```

Expected:

```
 FAIL  app/api/stimulus/inspect/route.test.ts [ app/api/stimulus/inspect/route.test.ts ]
Error: Failed to resolve import "./route"
```

- [ ] Implement `apps/web/app/api/stimulus/inspect/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { parseStimulus } from '@/lib/server/engine/stimulusParser'
import {
  MIN_STIMULUS_LENGTH,
  summarizeSignals,
  toDetectedSignals,
  type InspectResponse,
} from '@/lib/server/stimulusSignals'

// stimulusParser is server-only and may carry Node deps: pin the Node runtime.
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawText = (body as { text?: unknown } | null)?.text
  const text = typeof rawText === 'string' ? rawText.trim() : ''

  if (text.length < MIN_STIMULUS_LENGTH) {
    return NextResponse.json(
      { error: `Stimulus must be at least ${MIN_STIMULUS_LENGTH} characters` },
      { status: 400 },
    )
  }

  // Faithful to what runStorm sees at the top of the pipeline. No inference, no credits.
  const parsed = parseStimulus(text)
  const signals = toDetectedSignals(parsed)
  const payload: InspectResponse = { signals, summary: summarizeSignals(signals) }
  return NextResponse.json(payload)
}
```

- [ ] Run it and see it pass:

```
npx vitest run app/api/stimulus/inspect/route.test.ts
```

Expected:

```
 ✓ app/api/stimulus/inspect/route.test.ts (4 tests) 12ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] Commit:

```
git add apps/web/app/api/stimulus/inspect/route.ts apps/web/app/api/stimulus/inspect/route.test.ts
git commit -m "feat: add /api/stimulus/inspect route for pre-spend signal check"
```

---

### Task 4.5 - `useStimulusInspect` hook (250ms debounce, aborts in-flight)

Client hook that debounces the draft (matching the 250ms live price preview) and calls the inspect route. Never imports the parser.

**Files**
- Create: `apps/web/lib/useStimulusInspect.ts`
- Test: `apps/web/lib/useStimulusInspect.test.ts` (Create)

**Interfaces**
- Consumes: `fetch('/api/stimulus/inspect')` returning `InspectResponse`; type `InspectResponse` and value `MIN_STIMULUS_LENGTH` from `@/lib/server/stimulusSignals` (`stimulusSignals` is pure, so this is safe in a client bundle).
- Produces: `export type StimulusInspectState = { status: 'idle' | 'loading' | 'ready' | 'error'; summary: string | null }`; `export function useStimulusInspect(text: string): StimulusInspectState`. Idle while `text.trim().length < MIN_STIMULUS_LENGTH`.

**Steps**
- [ ] Write the failing test. Create `apps/web/lib/useStimulusInspect.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStimulusInspect } from '@/lib/useStimulusInspect'

describe('useStimulusInspect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stays idle when text is shorter than the minimum', () => {
    const { result } = renderHook(() => useStimulusInspect('too short'))
    expect(result.current.status).toBe('idle')
    expect(result.current.summary).toBeNull()
  })

  it('debounces, then reports the detected-signals summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signals: { priceCount: 2, hasTrustSignal: true, hasClearCta: false },
        summary: '2 prices, a trust signal, no clear CTA',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useStimulusInspect('A serious product concept with real detail here'),
    )
    // Not fired before the debounce window elapses.
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('ready')
    expect(result.current.summary).toBe('2 prices, a trust signal, no clear CTA')
  })

  it('reports an error state when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useStimulusInspect('A serious product concept with real detail here'),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.summary).toBeNull()
  })
})
```

- [ ] Run it and see it fail (hook missing):

```
npx vitest run lib/useStimulusInspect.test.ts
```

Expected:

```
 FAIL  lib/useStimulusInspect.test.ts [ lib/useStimulusInspect.test.ts ]
Error: Failed to resolve import "@/lib/useStimulusInspect"
```

- [ ] Implement `apps/web/lib/useStimulusInspect.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { MIN_STIMULUS_LENGTH, type InspectResponse } from '@/lib/server/stimulusSignals'

const DEBOUNCE_MS = 250

export type StimulusInspectState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  summary: string | null
}

const IDLE: StimulusInspectState = { status: 'idle', summary: null }

export function useStimulusInspect(text: string): StimulusInspectState {
  const [state, setState] = useState<StimulusInspectState>(IDLE)

  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed.length < MIN_STIMULUS_LENGTH) {
      setState(IDLE)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setState({ status: 'loading', summary: null })
      try {
        const res = await fetch('/api/stimulus/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
          signal: controller.signal,
        })
        if (!res.ok) {
          setState({ status: 'error', summary: null })
          return
        }
        const data = (await res.json()) as InspectResponse
        setState({ status: 'ready', summary: data.summary })
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        setState({ status: 'error', summary: null })
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  return state
}
```

- [ ] Run it and see it pass:

```
npx vitest run lib/useStimulusInspect.test.ts
```

Expected:

```
 ✓ lib/useStimulusInspect.test.ts (3 tests) 30ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] Commit:

```
git add apps/web/lib/useStimulusInspect.ts apps/web/lib/useStimulusInspect.test.ts
git commit -m "feat: add debounced useStimulusInspect hook"
```

---

### Task 4.6 - `StimulusHelper` component ("Not sure what to write?")

The collapsible affordance rendered on the Create page; maps hook states to plain copy. No hardcoded counts.

**Files**
- Create: `apps/web/components/storm/StimulusHelper.tsx`
- Test: `apps/web/components/storm/StimulusHelper.test.tsx` (Create)

**Interfaces**
- Consumes: `useStimulusInspect(text: string): StimulusInspectState` from `@/lib/useStimulusInspect`.
- Produces: `export function StimulusHelper(props: { stimulus: string }): JSX.Element`. Inspects only while open (passes `''` when collapsed so no request fires until the user asks).

**Steps**
- [ ] Write the failing test. Create `apps/web/components/storm/StimulusHelper.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/useStimulusInspect', () => ({
  useStimulusInspect: () => ({
    status: 'ready',
    summary: '2 prices, a trust signal, no clear CTA',
  }),
}))

import { StimulusHelper } from '@/components/storm/StimulusHelper'

describe('StimulusHelper', () => {
  it('is collapsed until the user asks for help', () => {
    render(<StimulusHelper stimulus="A detailed product concept for testing" />)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('reveals detected signals when opened', () => {
    render(<StimulusHelper stimulus="A detailed product concept for testing" />)
    fireEvent.click(screen.getByRole('button', { name: /not sure what to write/i }))
    expect(screen.getByRole('note')).toHaveTextContent('2 prices, a trust signal, no clear CTA')
  })
})
```

- [ ] Run it and see it fail (component missing):

```
npx vitest run components/storm/StimulusHelper.test.tsx
```

Expected:

```
 FAIL  components/storm/StimulusHelper.test.tsx [ components/storm/StimulusHelper.test.tsx ]
Error: Failed to resolve import "@/components/storm/StimulusHelper"
```

- [ ] Implement `apps/web/components/storm/StimulusHelper.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useStimulusInspect } from '@/lib/useStimulusInspect'

export function StimulusHelper({ stimulus }: { stimulus: string }) {
  const [open, setOpen] = useState(false)
  // Only inspect while open — no request fires until the user asks.
  const { status, summary } = useStimulusInspect(open ? stimulus : '')

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-sm font-medium text-indigo-600 hover:underline"
      >
        Not sure what to write?
      </button>
      {open && (
        <div
          role="note"
          className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {status === 'idle' &&
            'Type at least 20 characters and we’ll show what your draft signals — before you spend a run.'}
          {status === 'loading' && 'Checking your draft…'}
          {status === 'ready' && <span>Your draft signals: {summary}.</span>}
          {status === 'error' && 'Could not analyze your draft right now — you can still run it.'}
        </div>
      )}
    </div>
  )
}
```

- [ ] Run it and see it pass:

```
npx vitest run components/storm/StimulusHelper.test.tsx
```

Expected:

```
 ✓ components/storm/StimulusHelper.test.tsx (2 tests) 40ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit:

```
git add apps/web/components/storm/StimulusHelper.tsx apps/web/components/storm/StimulusHelper.test.tsx
git commit -m "feat: add StimulusHelper pre-spend signal panel"
```

---

### Task 4.7 - Mount `StimulusHelper` on the Create page

Wire the helper below the stimulus textarea, bound to the page's existing stimulus state.

**Files**
- Modify: `apps/web/app/(app)/storm/new/page.tsx`

**Interfaces**
- Consumes: `StimulusHelper(props: { stimulus: string })` from `@/components/storm/StimulusHelper`; the page's existing controlled stimulus state value.
- Produces: no new exports (renders `<StimulusHelper>`).

**Steps**
- [ ] Locate the stimulus `<textarea>` and its controlled state variable. From `apps/web`:

```
npx rg -n "textarea|useState" "app/(app)/storm/new/page.tsx"
```

Expected: a `const [<name>, set<Name>] = useState(...)` line and a `<textarea ... value={<name>} ...>` line. Note the actual state variable name (referred to below as `stimulus`).

- [ ] Add the import alongside the other imports at the top of `apps/web/app/(app)/storm/new/page.tsx` (the file is already a `'use client'` component because it has the interactive form):

```tsx
import { StimulusHelper } from '@/components/storm/StimulusHelper'
```

- [ ] Immediately after the textarea's closing tag, inside the same form-field wrapper, insert (replace `stimulus` with the actual state variable name found above):

```tsx
<StimulusHelper stimulus={stimulus} />
```

- [ ] Verify it typechecks (from `apps/web`):

```
npx tsc --noEmit
```

Expected: no errors (exit code 0). If `tsc` reports `Cannot find name 'stimulus'`, replace `stimulus` with the page's actual stimulus state variable and re-run.

- [ ] Verify the helper works end to end by driving the app. Use the run skill:

```
Skill: run
```

Then open `/storm/new` (signed in), type a 20+ character draft, and click "Not sure what to write?".
Pass criteria (all must hold): a "Your draft signals: …" line appears within ~1s of typing, AND the credits balance shown in the topbar is unchanged after opening the helper (no run is spent).
Fail: the balance decreases, or no signals line appears.

- [ ] Commit:

```
git add "apps/web/app/(app)/storm/new/page.tsx"
git commit -m "feat: surface StimulusHelper on the create page"
```

---

### Task 4.8 - `WelcomeToast` component (one-time, reads actual balance)

A once-per-account welcome toast reading the actual granted wallet balance (never a literal), gated by `ps_welcome_seen`, degrading to "show, don't persist" if `localStorage` throws.

**Files**
- Create: `apps/web/components/dashboard/WelcomeToast.tsx`
- Test: `apps/web/components/dashboard/WelcomeToast.test.tsx` (Create)

**Interfaces**
- Consumes: `balance: number` prop (the actual wallet balance the dashboard already loads); `next/link`.
- Produces: `export function WelcomeToast(props: { balance: number }): JSX.Element | null`. Renders once; sets `ps_welcome_seen` on dismiss. CTA links to `/demo`.

**Steps**
- [ ] Write the failing test. Create `apps/web/components/dashboard/WelcomeToast.test.tsx` (the balance `137` is an arbitrary fixture — it proves the toast renders the wallet value it is GIVEN, never a hardcoded constant, per R15/R18):

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeToast } from '@/components/dashboard/WelcomeToast'

beforeEach(() => {
  window.localStorage.clear()
})

describe('WelcomeToast', () => {
  it('shows the actual granted balance on first visit', () => {
    render(<WelcomeToast balance={137} />)
    expect(screen.getByRole('status')).toHaveTextContent('137 demo credits')
  })

  it('links to the no-signup demo', () => {
    render(<WelcomeToast balance={137} />)
    expect(screen.getByRole('link', { name: /watch the live demo/i })).toHaveAttribute(
      'href',
      '/demo',
    )
  })

  it('does not render once ps_welcome_seen is set', () => {
    window.localStorage.setItem('ps_welcome_seen', '1')
    render(<WelcomeToast balance={137} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('persists dismissal', () => {
    render(<WelcomeToast balance={137} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(window.localStorage.getItem('ps_welcome_seen')).toBe('1')
  })
})
```

- [ ] Run it and see it fail (component missing):

```
npx vitest run components/dashboard/WelcomeToast.test.tsx
```

Expected:

```
 FAIL  components/dashboard/WelcomeToast.test.tsx [ components/dashboard/WelcomeToast.test.tsx ]
Error: Failed to resolve import "@/components/dashboard/WelcomeToast"
```

- [ ] Implement `apps/web/components/dashboard/WelcomeToast.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const SEEN_KEY = 'ps_welcome_seen'

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false // degrade: show, don't persist
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // degrade: show, don't persist
  }
}

export function WelcomeToast({ balance }: { balance: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!readSeen()) setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    markSeen()
    setVisible(false)
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-sm font-medium">
        Welcome — you’ve got {balance} demo credits. Try a sample run.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Link href="/demo" className="text-sm font-semibold text-indigo-600 hover:underline">
          Watch the live demo
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
```

- [ ] Run it and see it pass:

```
npx vitest run components/dashboard/WelcomeToast.test.tsx
```

Expected:

```
 ✓ components/dashboard/WelcomeToast.test.tsx (4 tests) 55ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] Commit:

```
git add apps/web/components/dashboard/WelcomeToast.tsx apps/web/components/dashboard/WelcomeToast.test.tsx
git commit -m "feat: add one-time WelcomeToast reading actual balance"
```

---

### Task 4.9 - Mount `WelcomeToast` on the dashboard

Render the toast with the balance the dashboard already loads.

**Files**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`

**Interfaces**
- Consumes: `WelcomeToast(props: { balance: number })` from `@/components/dashboard/WelcomeToast`; the dashboard's already-loaded wallet balance value.
- Produces: no new exports (renders `<WelcomeToast>`).

**Steps**
- [ ] Locate the balance the credits card already reads. From `apps/web`:

```
npx rg -n "balance|wallet|credit" "app/(app)/dashboard/page.tsx"
```

Expected: the value the credits card renders (referred to below as `wallet.balance`). Note the actual accessor.

- [ ] Add the import at the top of `apps/web/app/(app)/dashboard/page.tsx`:

```tsx
import { WelcomeToast } from '@/components/dashboard/WelcomeToast'
```

- [ ] Render it near the top of the returned JSX (it is `position: fixed`, so placement is not visually load-bearing). `WelcomeToast` is a client component and renders cleanly from this server component. Replace `wallet.balance` with the actual accessor found above:

```tsx
<WelcomeToast balance={wallet.balance} />
```

- [ ] Verify it typechecks (from `apps/web`):

```
npx tsc --noEmit
```

Expected: no errors (exit code 0). If `tsc` reports the balance identifier is unknown, replace `wallet.balance` with the dashboard's actual balance value and re-run.

- [ ] Verify by driving the app. Use the run skill:

```
Skill: run
```

In the browser devtools console run `localStorage.removeItem('ps_welcome_seen')`, then load `/dashboard`.
Pass criteria (all must hold): the toast's "…demo credits" number exactly equals the balance shown in the topbar/credits card; clicking "Dismiss" removes the toast; reloading `/dashboard` does NOT show it again.
Fail: the toast shows a number different from the real balance, or reappears after dismissal+reload.

- [ ] Commit:

```
git add "apps/web/app/(app)/dashboard/page.tsx"
git commit -m "feat: show one-time welcome toast on the dashboard"
```

---

### Task 4.10 - `HeroCtas` component (dominant "Watch live", secondary "Run your own")

The landing hero CTAs: a dominant no-signup demo link and a secondary run-your-own link. No hardcoded persona/panel counts ("60-second" is a duration, allowed).

**Files**
- Create: `apps/web/components/HeroCtas.tsx`
- Test: `apps/web/components/HeroCtas.test.tsx` (Create)

**Interfaces**
- Consumes: `next/link`.
- Produces: `export function HeroCtas(): JSX.Element`. Primary link → `/demo`; secondary link → `/storm/new`.

**Steps**
- [ ] Write the failing test. Create `apps/web/components/HeroCtas.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroCtas } from '@/components/HeroCtas'

describe('HeroCtas', () => {
  it('links the dominant CTA to the no-signup demo', () => {
    render(<HeroCtas />)
    const primary = screen.getByTestId('demo-cta')
    expect(primary).toHaveAttribute('href', '/demo')
    expect(primary).toHaveTextContent(/watch a 60-second live simulation/i)
    expect(primary).toHaveTextContent(/no signup/i)
  })

  it('offers a secondary run-your-own path', () => {
    render(<HeroCtas />)
    const secondary = screen.getByTestId('own-cta')
    expect(secondary).toHaveAttribute('href', '/storm/new')
    expect(secondary).toHaveTextContent(/run your own/i)
  })
})
```

- [ ] Run it and see it fail (component missing):

```
npx vitest run components/HeroCtas.test.tsx
```

Expected:

```
 FAIL  components/HeroCtas.test.tsx [ components/HeroCtas.test.tsx ]
Error: Failed to resolve import "@/components/HeroCtas"
```

- [ ] Implement `apps/web/components/HeroCtas.tsx`:

```tsx
import Link from 'next/link'

export function HeroCtas() {
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Link
        href="/demo"
        data-testid="demo-cta"
        className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Watch a 60-second live simulation — no signup
      </Link>
      <Link
        href="/storm/new"
        data-testid="own-cta"
        className="rounded-lg border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Run your own
      </Link>
    </div>
  )
}
```

- [ ] Run it and see it pass:

```
npx vitest run components/HeroCtas.test.tsx
```

Expected:

```
 ✓ components/HeroCtas.test.tsx (2 tests) 42ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit:

```
git add apps/web/components/HeroCtas.tsx apps/web/components/HeroCtas.test.tsx
git commit -m "feat: add landing HeroCtas with dominant no-signup demo link"
```

---

### Task 4.11 - `DemoUnavailableBanner` component (completes R1 fallback)

The landing-page notice that surfaces when Phase 3 Task 3.5 redirects to `/?demo=unavailable` (i.e. `getStormMeta(DEMO_STORM_ID)` returned null). Presentational and boolean-driven so it is unit-testable without rendering the async page.

**Files**
- Create: `apps/web/components/DemoUnavailableBanner.tsx`
- Test: `apps/web/components/DemoUnavailableBanner.test.tsx` (Create)

**Interfaces**
- Consumes: `show: boolean` prop; `next/link`.
- Produces: `export function DemoUnavailableBanner(props: { show: boolean }): JSX.Element | null`. Renders a `role="alert"` notice with a "Run your own" link → `/storm/new` when `show`; renders `null` otherwise.

**Steps**
- [ ] Write the failing test. Create `apps/web/components/DemoUnavailableBanner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoUnavailableBanner } from '@/components/DemoUnavailableBanner'

describe('DemoUnavailableBanner', () => {
  it('renders the fallback notice with a run-your-own link when show is true', () => {
    render(<DemoUnavailableBanner show={true} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/demo unavailable/i)
    expect(screen.getByRole('link', { name: /run your own/i })).toHaveAttribute(
      'href',
      '/storm/new',
    )
  })

  it('renders nothing when show is false', () => {
    render(<DemoUnavailableBanner show={false} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
```

- [ ] Run it and see it fail (component missing):

```
npx vitest run components/DemoUnavailableBanner.test.tsx
```

Expected:

```
 FAIL  components/DemoUnavailableBanner.test.tsx [ components/DemoUnavailableBanner.test.tsx ]
Error: Failed to resolve import "@/components/DemoUnavailableBanner"
```

- [ ] Implement `apps/web/components/DemoUnavailableBanner.tsx`:

```tsx
import Link from 'next/link'

export function DemoUnavailableBanner({ show }: { show: boolean }) {
  if (!show) return null

  return (
    <div
      role="alert"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      Demo unavailable right now —{' '}
      <Link href="/storm/new" className="font-semibold underline">
        run your own
      </Link>{' '}
      instead.
    </div>
  )
}
```

- [ ] Run it and see it pass:

```
npx vitest run components/DemoUnavailableBanner.test.tsx
```

Expected:

```
 ✓ components/DemoUnavailableBanner.test.tsx (2 tests) 30ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit:

```
git add apps/web/components/DemoUnavailableBanner.tsx apps/web/components/DemoUnavailableBanner.test.tsx
git commit -m "feat: add DemoUnavailableBanner for the R1 fallback notice"
```

---

### Task 4.12 - Mount `HeroCtas` + `DemoUnavailableBanner` on the landing page

Render the CTA pair in the hero and wire the `?demo=unavailable` notice by reading `searchParams` (completing R1 alongside Phase 3 Task 3.5's redirect).

**Files**
- Modify: `apps/web/app/page.tsx`

**Interfaces**
- Consumes: `HeroCtas()` from `@/components/HeroCtas`; `DemoUnavailableBanner(props: { show: boolean })` from `@/components/DemoUnavailableBanner`; Next.js page `searchParams` prop.
- Produces: no new exports (renders `<DemoUnavailableBanner>` and `<HeroCtas>`).

**Steps**
- [ ] Locate the existing hero CTA so the replacement is precise. From `apps/web`:

```
npx rg -n "Link|href|<a " app/page.tsx
```

Expected: the current single hero CTA `<Link href="...">` (or `<a>`). Note its surrounding element so you replace only that CTA and keep the hero headline/subcopy.

- [ ] Add the imports at the top of `apps/web/app/page.tsx`:

```tsx
import { HeroCtas } from '@/components/HeroCtas'
import { DemoUnavailableBanner } from '@/components/DemoUnavailableBanner'
```

- [ ] Give the page a `searchParams` prop and derive the flag. Change the default export signature to:

```tsx
export default function Page({
  searchParams,
}: {
  searchParams: { demo?: string }
}) {
  const demoUnavailable = searchParams?.demo === 'unavailable'
```

(If the page is currently `export default function Home() {...}`, keep its name but add the same typed `searchParams` parameter and `demoUnavailable` line.)

- [ ] Render the banner at the very top of the hero (above the headline) and replace the existing single hero CTA button with `<HeroCtas />` (keep surrounding hero copy):

```tsx
<DemoUnavailableBanner show={demoUnavailable} />
```

```tsx
<HeroCtas />
```

- [ ] Verify it typechecks (from `apps/web`):

```
npx tsc --noEmit
```

Expected: no errors (exit code 0).

- [ ] Verify by driving the app. Use the run skill:

```
Skill: run
```

As an anonymous visitor:
Pass criteria (all must hold): on `/`, the dominant "Watch a 60-second live simulation — no signup" button routes to `/demo` and the secondary "Run your own" routes to `/storm/new`; on `/?demo=unavailable`, a "Demo unavailable" alert renders above the hero with a "run your own" link to `/storm/new`; on plain `/`, that alert is absent.
Fail: any route target is wrong, or the alert shows on plain `/`, or is missing on `/?demo=unavailable`.

- [ ] Run the full Phase 4 Vitest suite to confirm nothing regressed (from `apps/web`):

```
npx vitest run lib/server/demo.credits.test.ts lib/server/demo.signup-credits.test.ts lib/server/stimulusSignals.test.ts app/api/stimulus/inspect/route.test.ts lib/useStimulusInspect.test.ts components/storm/StimulusHelper.test.tsx components/dashboard/WelcomeToast.test.tsx components/HeroCtas.test.tsx components/DemoUnavailableBanner.test.tsx
```

Expected (9 files: 2 + 1 + 5 + 4 + 3 + 2 + 4 + 2 + 2 = 25 tests):

```
 Test Files  9 passed (9)
      Tests  25 passed (25)
```

- [ ] Commit:

```
git add apps/web/app/page.tsx
git commit -m "feat: add Watch-live CTA and demo-unavailable notice to the landing page"
```

---

The `apps/web` source tree doesn't exist yet in this repo (it's a greenfield plan written against the spec), so I can't harvest real class names. Per review issue 17 I'll convert the fabricated-identifier edits into discovery-command + concrete-attribute steps instead. Here is the fully corrected Phase 5.

---

## Phase 5 - Guided tour + polish

This phase adds the driver.js guided tour, the always-visible grid legend, the dismissible "how it works" panel, the Topbar relaunch control, and the final polish pass (self-explaining copy, "Reconnecting…" state, report skeletons, reduced-motion-aware smooth-scroll). All work is UX-layer, additive, and client-only. It never deletes existing depth, changes any engine number, or touches `apps/api`.

**Phase prerequisites (delivered by earlier phases):**
- **Phase 0** configured Vitest: `apps/web/vitest.config.ts` (jsdom env, the `@/*` alias mirroring `tsconfig.json` `paths`, a v8 `coverage` block, and `apps/web/vitest.setup.ts` registering `@testing-library/jest-dom`) and added the `test` script (`vitest run`) to `apps/web/package.json`. **Phase 2** extended that config (jsdom + report fixture) without overwriting the `coverage` block or the `@/*` alias, so `@/…` imports resolve everywhere in this phase.
- **Phase 2** created `components/report/VerdictBanner.tsx` (carries `data-tour="verdict-banner"`, Task 2.2) and `components/report/TopActions.tsx` (carries `data-tour="top-actions"`, Task 2.4), and restructured `app/(app)/storm/[id]/report/page.tsx` verdict-first (Task 2.7) with the `#full-diagnostics` divider — which already carries **both** `id="full-diagnostics"` and `data-tour="full-diagnostics"` from Task 2.7.
- **Phase 2** also created the collapsed tier-3 `CriteriaBreakdown` wrapper (`AnchorCollapsible`, Task 2.6). Per the reconciled auto-expand contract (R5): `AnchorCollapsible` expands on receipt of the `EXPAND_CRITERIA_EVENT` window event and does **not** scroll on its own. Scrolling to any `#anchor` (including `#criteria`) is owned **solely** by this phase's `AnchorScrollManager` (Task 5.11), so there is exactly one scroll owner and one expand consumer — no double-scroll.

**Phase constraints & conventions (inherited by every task below):**
- Node 18.17+, Next.js 14 App Router, TypeScript, Tailwind. New dependency this phase: `driver.js` only.
- Imports use the `@/*` path alias (established in Phase 0: `apps/web/tsconfig.json` `paths` + the matching alias in `apps/web/vitest.config.ts`). All new client components start with `'use client'`.
- Naming: PascalCase components/types, camelCase functions/vars, UPPER_SNAKE_CASE constants, `use`-prefixed hooks.
- User-facing copy contains **no** hardcoded persona counts ("1000 personas") or panel counts ("20 panels"): bind numbers to `report.persona_count`; refer to "the full diagnostic breakdown (every panel)". There are 17 report components; never assert a panel count.
- Do **not** change engine numeric outputs, thresholds, `statusFor`, or the money flow. Do **not** touch `apps/api`.
- **All commands in this phase run via the Bash tool (POSIX sh / Git Bash on Windows), executed from `apps/web/`** (that is where `package.json`, `vitest.config.ts`, and the `@/*` alias root live). Test paths in commands are relative to `apps/web/`. Discovery commands use `rg` (ripgrep, available in the environment); if a matched line number differs from the sample, edit the element the match points at.

---

### Task 5.1 - Add the `driver.js` dependency

Adds the tour library (spotlight + popover, ~5kb, ships its own types). No code uses it yet; this task only lands the dependency so later tasks can import it.

**Files**
- Modify: `apps/web/package.json`

**Interfaces**
- Consumes: npm registry package `driver.js@^1.3.1` (exports `driver(config)` and CSS at `driver.js/dist/driver.css`).
- Produces: `driver.js` available under `dependencies`.

**Steps**

- [ ] Install the dependency (writes the version into `apps/web/package.json` `dependencies` and updates the lockfile):

```bash
npm install driver.js@^1.3.1
```

Expected output (last line):

```
added 1 package, and audited N packages in 2s
```

- [ ] Confirm the entry landed in `apps/web/package.json`:

```bash
node -e "console.log(require('./package.json').dependencies['driver.js'])"
```

Expected output:

```
^1.3.1
```

- [ ] Commit:

```bash
git add package.json package-lock.json
git commit -m "chore: add driver.js dependency for guided tour"
```

---

### Task 5.2 - SSR-safe `localStorage` flag helper

A single throw-free wrapper used by the Tour gating, the HowItWorks dismiss state, and any future onboarding flag. Degrades to "show, don't persist" when storage is unavailable (private mode / quota).

**Files**
- Create: `apps/web/lib/browser/safeStorage.ts`
- Test: `apps/web/lib/browser/safeStorage.test.ts`

**Interfaces**
- Consumes: `window.localStorage` (guarded).
- Produces:
  - `readFlag(key: string): boolean`
  - `writeFlag(key: string, value: boolean): void`

**Steps**

- [ ] Write the failing test at `apps/web/lib/browser/safeStorage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFlag, writeFlag } from '@/lib/browser/safeStorage';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('safeStorage', () => {
  it('returns false for an unset flag', () => {
    expect(readFlag('ps_missing')).toBe(false);
  });

  it('round-trips a written flag', () => {
    writeFlag('ps_seen', true);
    expect(readFlag('ps_seen')).toBe(true);
  });

  it('never throws when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => writeFlag('ps_seen', true)).not.toThrow();
  });

  it('returns false when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readFlag('ps_seen')).toBe(false);
  });
});
```

- [ ] Run it and see it fail (module does not exist yet):

```bash
npx vitest run lib/browser/safeStorage.test.ts
```

Expected output (abridged):

```
 FAIL  lib/browser/safeStorage.test.ts [ lib/browser/safeStorage.test.ts ]
Error: Failed to load url @/lib/browser/safeStorage ... Does the file exist?
```

- [ ] Create `apps/web/lib/browser/safeStorage.ts`:

```ts
const TRUE = 'true';

export function readFlag(key: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(key) === TRUE;
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value ? TRUE : 'false');
  } catch {
    // localStorage unavailable (private mode / quota) -> degrade to "show, don't persist"
  }
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run lib/browser/safeStorage.test.ts
```

Expected output (abridged):

```
 ✓ lib/browser/safeStorage.test.ts (4 tests) 10ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] Commit:

```bash
git add lib/browser/safeStorage.ts lib/browser/safeStorage.test.ts
git commit -m "feat: add SSR-safe localStorage flag helper"
```

---

### Task 5.3 - `prefersReducedMotion` helper

A guarded read of the `prefers-reduced-motion` media query used by the tour and by anchor scrolling. Returns `false` when `matchMedia` is missing (jsdom / old browsers) so motion is only disabled when explicitly requested.

**Files**
- Create: `apps/web/lib/browser/prefersReducedMotion.ts`
- Test: `apps/web/lib/browser/prefersReducedMotion.test.ts`

**Interfaces**
- Consumes: `window.matchMedia` (guarded).
- Produces: `prefersReducedMotion(): boolean`

**Steps**

- [ ] Write the failing test at `apps/web/lib/browser/prefersReducedMotion.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from '@/lib/browser/prefersReducedMotion';

afterEach(() => {
  // jsdom has no matchMedia; remove any stub we set
  // @ts-expect-error cleanup jsdom stub
  delete window.matchMedia;
});

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is unavailable', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when the user prefers reduced motion', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the user does not prefer reduced motion', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run lib/browser/prefersReducedMotion.test.ts
```

Expected output (abridged):

```
 FAIL  lib/browser/prefersReducedMotion.test.ts
Error: Failed to load url @/lib/browser/prefersReducedMotion ... Does the file exist?
```

- [ ] Create `apps/web/lib/browser/prefersReducedMotion.ts`:

```ts
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run lib/browser/prefersReducedMotion.test.ts
```

Expected output (abridged):

```
 ✓ lib/browser/prefersReducedMotion.test.ts (3 tests) 8ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] Commit:

```bash
git add lib/browser/prefersReducedMotion.ts lib/browser/prefersReducedMotion.test.ts
git commit -m "feat: add prefers-reduced-motion helper"
```

---

### Task 5.4 - Tour event constants and step data

Two tiny, dependency-free modules. `events.ts` holds the custom-event names shared across Tour, TourButton, the anchor scroller, and Phase 2's `AnchorCollapsible` (kept out of `Tour.tsx` so `TourButton` never pulls in `driver.js`). `steps.ts` declares the tour steps as data: 3 live steps (grid / score / collapse meter), 4 report steps (verdict / actions / full-diagnostics / JSON download), capped at 4 per page, with count-free copy.

**Files**
- Create: `apps/web/lib/tour/events.ts`
- Create: `apps/web/lib/tour/steps.ts`
- Test: `apps/web/lib/tour/steps.test.ts`

**Interfaces**
- Consumes: nothing.
- Produces:
  - `events.ts`: `TOUR_RELAUNCH_EVENT = 'ps:tour:relaunch'`, `EXPAND_CRITERIA_EVENT = 'ps:expand-criteria'`
  - `steps.ts`: `interface TourStep { selector: string; title: string; description: string }`, `LIVE_TOUR_STEPS: TourStep[]` (3), `REPORT_TOUR_STEPS: TourStep[]` (4)

> Note: `EXPAND_CRITERIA_EVENT` is consumed by both `scrollToAnchor` (dispatcher, Task 5.11) and Phase 2's `AnchorCollapsible` (listener/expander, Task 2.6). Declaring it here — not in `Tour.tsx` — keeps the constant importable by non-tour code without dragging in `driver.js`.

**Steps**

- [ ] Write the failing test at `apps/web/lib/tour/steps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LIVE_TOUR_STEPS, REPORT_TOUR_STEPS, type TourStep } from '@/lib/tour/steps';

const allSteps: TourStep[] = [...LIVE_TOUR_STEPS, ...REPORT_TOUR_STEPS];

describe('tour steps', () => {
  it('has 3 live steps and 4 report steps (cap 4 per page)', () => {
    expect(LIVE_TOUR_STEPS).toHaveLength(3);
    expect(REPORT_TOUR_STEPS).toHaveLength(4);
    expect(LIVE_TOUR_STEPS.length).toBeLessThanOrEqual(4);
    expect(REPORT_TOUR_STEPS.length).toBeLessThanOrEqual(4);
  });

  it('anchors every step to a data-tour attribute selector with non-empty copy', () => {
    for (const step of allSteps) {
      expect(step.selector).toMatch(/^\[data-tour="[a-z-]+"\]$/);
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('asserts no hardcoded persona or panel counts in copy', () => {
    for (const step of allSteps) {
      const copy = `${step.title} ${step.description}`;
      expect(copy).not.toMatch(/\d{3,}/); // no 1000 / 1200
      expect(copy).not.toMatch(/\d+\s*panels?/i); // no "20 panels"
    }
  });

  it('covers the live grid, score, and collapse meter in order', () => {
    expect(LIVE_TOUR_STEPS.map((s) => s.selector)).toEqual([
      '[data-tour="persona-grid"]',
      '[data-tour="market-fit-score"]',
      '[data-tour="collapse-meter"]',
    ]);
  });

  it('covers verdict, actions, full-diagnostics, and JSON download in order', () => {
    expect(REPORT_TOUR_STEPS.map((s) => s.selector)).toEqual([
      '[data-tour="verdict-banner"]',
      '[data-tour="top-actions"]',
      '[data-tour="full-diagnostics"]',
      '[data-tour="json-download"]',
    ]);
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run lib/tour/steps.test.ts
```

Expected output (abridged):

```
 FAIL  lib/tour/steps.test.ts
Error: Failed to load url @/lib/tour/steps ... Does the file exist?
```

- [ ] Create `apps/web/lib/tour/events.ts`:

```ts
export const TOUR_RELAUNCH_EVENT = 'ps:tour:relaunch';
export const EXPAND_CRITERIA_EVENT = 'ps:expand-criteria';
```

- [ ] Create `apps/web/lib/tour/steps.ts`:

```ts
export interface TourStep {
  selector: string;
  title: string;
  description: string;
}

export const LIVE_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="persona-grid"]',
    title: 'Every cell is one persona',
    description:
      'Green means they would buy, yellow means they need more proof, red means they rejected it.',
  },
  {
    selector: '[data-tour="market-fit-score"]',
    title: 'Live market-fit score',
    description:
      'Computed by the system from every persona reaction as they stream in - the AI never invents this number.',
  },
  {
    selector: '[data-tour="collapse-meter"]',
    title: 'Collapse-risk meter',
    description:
      'Flags when the panel is converging on one voice instead of a diverse market. Low means healthy diversity.',
  },
];

export const REPORT_TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="verdict-banner"]',
    title: 'Your answer, up top',
    description:
      'A plain-language verdict - build it, fix these first, or not yet - with the evidence behind it.',
  },
  {
    selector: '[data-tour="top-actions"]',
    title: 'What to fix first',
    description:
      'The highest-impact actions, each backed by a real number from the run and linked to the detail below.',
  },
  {
    selector: '[data-tour="full-diagnostics"]',
    title: 'The full diagnostic breakdown',
    description:
      'Every panel of the analysis lives below this divider. Scroll to see the complete breakdown.',
  },
  {
    selector: '[data-tour="json-download"]',
    title: 'Export everything',
    description:
      'Download the complete report as JSON, including the verdict and the recommended actions.',
  },
];
```

- [ ] Run it and see it pass:

```bash
npx vitest run lib/tour/steps.test.ts
```

Expected output (abridged):

```
 ✓ lib/tour/steps.test.ts (5 tests) 11ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

- [ ] Commit:

```bash
git add lib/tour/events.ts lib/tour/steps.ts lib/tour/steps.test.ts
git commit -m "feat: add tour event constants and step data"
```

---

### Task 5.5 - `Tour` component (SSR-safe, gated, relaunchable)

A thin client component that, per page, auto-runs the tour on first visit (gated by `ps_tour_live_seen` / `ps_tour_report_seen`), filters steps to selectors actually present in the DOM, disables animation under reduced motion, and re-runs on the `ps:tour:relaunch` event regardless of the seen flag. Renders nothing.

**Files**
- Create: `apps/web/components/Tour.tsx`
- Test: `apps/web/components/Tour.test.tsx`

**Interfaces**
- Consumes: `driver` from `driver.js`; `LIVE_TOUR_STEPS`/`REPORT_TOUR_STEPS`/`TourStep` from `@/lib/tour/steps`; `TOUR_RELAUNCH_EVENT` from `@/lib/tour/events`; `readFlag`/`writeFlag` from `@/lib/browser/safeStorage`; `prefersReducedMotion` from `@/lib/browser/prefersReducedMotion`.
- Produces: `type TourPage = 'live' | 'report'`; `interface TourProps { page: TourPage }`; `Tour(props: TourProps): JSX.Element | null`.

**Steps**

- [ ] Write the failing behaviour test at `apps/web/components/Tour.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Tour } from '@/components/Tour';
import { TOUR_RELAUNCH_EVENT } from '@/lib/tour/events';

const driveMock = vi.fn();
const driverMock = vi.fn(() => ({ drive: driveMock }));

vi.mock('driver.js', () => ({ driver: (...args: unknown[]) => driverMock(...args) }));
vi.mock('driver.js/dist/driver.css', () => ({}));

beforeEach(() => {
  driveMock.mockClear();
  driverMock.mockClear();
  window.localStorage.clear();
  document.body.innerHTML = `
    <div data-tour="persona-grid"></div>
    <div data-tour="market-fit-score"></div>
    <div data-tour="collapse-meter"></div>
  `;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('Tour gating', () => {
  it('auto-runs on first visit and records the seen flag', () => {
    render(<Tour page="live" />);
    expect(driveMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ps_tour_live_seen')).toBe('true');
  });

  it('does not auto-run when the page was already seen', () => {
    window.localStorage.setItem('ps_tour_live_seen', 'true');
    render(<Tour page="live" />);
    expect(driveMock).not.toHaveBeenCalled();
  });

  it('relaunches on the relaunch event even after being seen', () => {
    window.localStorage.setItem('ps_tour_live_seen', 'true');
    render(<Tour page="live" />);
    expect(driveMock).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent(TOUR_RELAUNCH_EVENT));
    expect(driveMock).toHaveBeenCalledTimes(1);
  });

  it('does not run when no anchors are present in the DOM', () => {
    document.body.innerHTML = '';
    render(<Tour page="live" />);
    expect(driveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run components/Tour.test.tsx
```

Expected output (abridged):

```
 FAIL  components/Tour.test.tsx
Error: Failed to load url @/components/Tour ... Does the file exist?
```

- [ ] Create `apps/web/components/Tour.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { LIVE_TOUR_STEPS, REPORT_TOUR_STEPS, type TourStep } from '@/lib/tour/steps';
import { TOUR_RELAUNCH_EVENT } from '@/lib/tour/events';
import { readFlag, writeFlag } from '@/lib/browser/safeStorage';
import { prefersReducedMotion } from '@/lib/browser/prefersReducedMotion';

export type TourPage = 'live' | 'report';

export interface TourProps {
  page: TourPage;
}

const SEEN_KEY: Record<TourPage, string> = {
  live: 'ps_tour_live_seen',
  report: 'ps_tour_report_seen',
};

const STEPS: Record<TourPage, TourStep[]> = {
  live: LIVE_TOUR_STEPS,
  report: REPORT_TOUR_STEPS,
};

function presentSteps(steps: TourStep[]): TourStep[] {
  if (typeof document === 'undefined') return [];
  return steps.filter((step) => document.querySelector(step.selector) !== null);
}

function runTour(page: TourPage): void {
  const steps = presentSteps(STEPS[page]);
  if (steps.length === 0) return;

  const instance = driver({
    showProgress: true,
    animate: !prefersReducedMotion(),
    steps: steps.map((step) => ({
      element: step.selector,
      popover: { title: step.title, description: step.description },
    })),
  });
  instance.drive();
}

export function Tour({ page }: TourProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!readFlag(SEEN_KEY[page])) {
      writeFlag(SEEN_KEY[page], true);
      runTour(page);
    }

    const onRelaunch = () => runTour(page);
    window.addEventListener(TOUR_RELAUNCH_EVENT, onRelaunch);
    return () => window.removeEventListener(TOUR_RELAUNCH_EVENT, onRelaunch);
  }, [page]);

  return null;
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run components/Tour.test.tsx
```

Expected output (abridged):

```
 ✓ components/Tour.test.tsx (4 tests) 42ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] Commit:

```bash
git add components/Tour.tsx components/Tour.test.tsx
git commit -m "feat: add SSR-safe, gated, relaunchable guided tour component"
```

---

### Task 5.6 - Add `data-tour` anchors and aria to the live-view elements

Adds the anchor attributes the live tour targets (never CSS classes or DOM structure) plus accessibility labels. These are additive attribute edits on existing components. Each edit is preceded by a discovery command so the target element is located precisely; only the listed attributes are added — the existing `className` and children are left untouched.

**Files**
- Modify: `apps/web/components/storm/PersonaGrid.tsx`
- Modify: `apps/web/components/storm/LiveCounters.tsx`

**Interfaces**
- Consumes: nothing new (attribute-only edits).
- Produces: DOM anchors `[data-tour="persona-grid"]`, `[data-tour="market-fit-score"]`, `[data-tour="collapse-meter"]` for `LIVE_TOUR_STEPS`.

**Steps**

- [ ] Locate the persona-grid container element:

```bash
rg -n "return|<div|grid" components/storm/PersonaGrid.tsx
```

Expected output (line numbers will vary): the `return (` of the component followed by the outermost `<div …>` — the container whose children map over the persona cells. That opening `<div>` is the target.

- [ ] On that located outer `<div>` opening tag, add exactly these three attributes (leave its existing `className` and all children unchanged):

```tsx
data-tour="persona-grid"
role="grid"
aria-label="Persona reactions - each cell is one persona (green: would buy, yellow: needs proof, red: rejected)"
```

- [ ] Locate the market-fit score readout and the collapse-risk meter inside `LiveCounters`:

```bash
rg -n "market|fit|score|collapse|risk|meter" components/storm/LiveCounters.tsx
```

Expected output (line numbers will vary): one element rendering the live market-fit score value, and one element rendering the collapse-risk meter. Those two elements are the targets.

- [ ] On the market-fit score element's opening tag, add (leave existing markup and classes unchanged):

```tsx
data-tour="market-fit-score"
aria-label="Live market-fit score"
```

- [ ] On the collapse-risk meter element's opening tag, add (leave existing markup and classes unchanged):

```tsx
data-tour="collapse-meter"
role="meter"
aria-label="Collapse-risk meter"
```

- [ ] Verify all three anchors now exist in source:

```bash
rg -n "data-tour=\"(persona-grid|market-fit-score|collapse-meter)\"" components/storm/PersonaGrid.tsx components/storm/LiveCounters.tsx
```

Expected output: three matching lines, one per anchor.

- [ ] Typecheck the edits:

```bash
npx tsc --noEmit
```

Expected output (no errors):

```
(no output)
```

- [ ] Commit:

```bash
git add components/storm/PersonaGrid.tsx components/storm/LiveCounters.tsx
git commit -m "feat: add data-tour anchors and aria to live persona grid and counters"
```

---

### Task 5.7 - `GridLegend` component (always-visible status legend)

A static, always-present green/yellow/red legend so grid comprehension never depends on the tour. Uses Tailwind tokens and an accessible group label.

**Files**
- Create: `apps/web/components/storm/GridLegend.tsx`
- Test: `apps/web/components/storm/GridLegend.test.tsx`

**Interfaces**
- Consumes: nothing.
- Produces: `GridLegend(): JSX.Element` (no props).

**Steps**

- [ ] Write the failing test at `apps/web/components/storm/GridLegend.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GridLegend } from '@/components/storm/GridLegend';

afterEach(cleanup);

describe('GridLegend', () => {
  it('always renders the three status labels', () => {
    render(<GridLegend />);
    expect(screen.getByText('Would buy')).toBeInTheDocument();
    expect(screen.getByText('Needs proof')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('exposes an accessible group label', () => {
    render(<GridLegend />);
    expect(
      screen.getByRole('group', { name: 'Persona grid legend' }),
    ).toBeInTheDocument();
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run components/storm/GridLegend.test.tsx
```

Expected output (abridged):

```
 FAIL  components/storm/GridLegend.test.tsx
Error: Failed to load url @/components/storm/GridLegend ... Does the file exist?
```

- [ ] Create `apps/web/components/storm/GridLegend.tsx`:

```tsx
const LEGEND_ITEMS = [
  { key: 'green', label: 'Would buy', dot: 'bg-emerald-500' },
  { key: 'yellow', label: 'Needs proof', dot: 'bg-amber-500' },
  { key: 'red', label: 'Rejected', dot: 'bg-rose-500' },
] as const;

export function GridLegend() {
  return (
    <div
      role="group"
      aria-label="Persona grid legend"
      className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      {LEGEND_ITEMS.map((item) => (
        <span key={item.key} className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-sm ${item.dot}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run components/storm/GridLegend.test.tsx
```

Expected output (abridged):

```
 ✓ components/storm/GridLegend.test.tsx (2 tests) 30ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

- [ ] Commit:

```bash
git add components/storm/GridLegend.tsx components/storm/GridLegend.test.tsx
git commit -m "feat: add always-visible persona grid legend"
```

---

### Task 5.8 - Mount `GridLegend` and `Tour` on the live-storm page

Adds the legend above the grid and mounts the live tour. Both are additive insertions; nothing existing is removed. A discovery command pins the insertion point.

**Files**
- Modify: `apps/web/app/(app)/storm/[id]/page.tsx`

**Interfaces**
- Consumes: `GridLegend` from `@/components/storm/GridLegend`; `Tour` from `@/components/Tour`.
- Produces: rendered `<GridLegend />` and `<Tour page="live" />` in the live view.

**Steps**

- [ ] Locate the persona-grid render site and the import block:

```bash
rg -n "PersonaGrid|^import|return \(" "app/(app)/storm/[id]/page.tsx"
```

Expected output (line numbers will vary): the existing `import` lines at the top, and the `<PersonaGrid … />` render line inside the returned JSX. The line above `<PersonaGrid` is where `<GridLegend />` goes; the end of the returned JSX is where `<Tour page="live" />` goes.

- [ ] Add the imports alongside the other component imports at the top of the file:

```tsx
import { GridLegend } from '@/components/storm/GridLegend';
import { Tour } from '@/components/Tour';
```

- [ ] Render `<GridLegend />` directly above the `<PersonaGrid … />` render line, and mount `<Tour page="live" />` as the last child of the live view's returned JSX (keep all existing markup unchanged):

```tsx
{/* directly above the existing <PersonaGrid … /> */}
<GridLegend />

{/* ...existing PersonaGrid + LiveCounters + QuoteFeed... */}

{/* as the last child of the returned live-view JSX */}
<Tour page="live" />
```

- [ ] Typecheck:

```bash
npx tsc --noEmit
```

Expected output:

```
(no output)
```

- [ ] Commit:

```bash
git add "app/(app)/storm/[id]/page.tsx"
git commit -m "feat: mount grid legend and live tour on the storm live page"
```

---

### Task 5.9 - `TourButton` and Topbar "?" relaunch control

A persistent "?" control that dispatches `ps:tour:relaunch`, re-running whichever page's `Tour` is mounted regardless of the seen flag. Extracted as its own client component so `Topbar.tsx` need not become a client component and never imports `driver.js`.

**Files**
- Create: `apps/web/components/dashboard/TourButton.tsx`
- Modify: `apps/web/components/dashboard/Topbar.tsx`
- Test: `apps/web/components/dashboard/TourButton.test.tsx`

**Interfaces**
- Consumes: `TOUR_RELAUNCH_EVENT` from `@/lib/tour/events`.
- Produces: `TourButton(): JSX.Element` (no props). `Topbar` renders `<TourButton />`.

**Steps**

- [ ] Write the failing test at `apps/web/components/dashboard/TourButton.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TourButton } from '@/components/dashboard/TourButton';
import { TOUR_RELAUNCH_EVENT } from '@/lib/tour/events';

afterEach(cleanup);

describe('TourButton', () => {
  it('dispatches the relaunch event on click', () => {
    const listener = vi.fn();
    window.addEventListener(TOUR_RELAUNCH_EVENT, listener);

    render(<TourButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Replay the guided tour' }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(TOUR_RELAUNCH_EVENT, listener);
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run components/dashboard/TourButton.test.tsx
```

Expected output (abridged):

```
 FAIL  components/dashboard/TourButton.test.tsx
Error: Failed to load url @/components/dashboard/TourButton ... Does the file exist?
```

- [ ] Create `apps/web/components/dashboard/TourButton.tsx`:

```tsx
'use client';

import { TOUR_RELAUNCH_EVENT } from '@/lib/tour/events';

export function TourButton() {
  const handleClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TOUR_RELAUNCH_EVENT));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Replay the guided tour"
      title="Replay the guided tour"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run components/dashboard/TourButton.test.tsx
```

Expected output (abridged):

```
 ✓ components/dashboard/TourButton.test.tsx (1 test) 26ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- [ ] Locate the Topbar right-hand actions cluster (where the credit pill / avatar render):

```bash
rg -n "CreditPill|avatar|Avatar|^import|actions" components/dashboard/Topbar.tsx
```

Expected output (line numbers will vary): the import block and the JSX cluster holding the right-side actions (credit pill / avatar). `<TourButton />` goes inside that cluster.

- [ ] Add the import and render `<TourButton />` inside that right-hand actions cluster, keeping all existing markup:

```tsx
import { TourButton } from '@/components/dashboard/TourButton';

// within the Topbar's right-side actions cluster, next to the credit pill / avatar:
<TourButton />
```

- [ ] Typecheck:

```bash
npx tsc --noEmit
```

Expected output:

```
(no output)
```

- [ ] Commit:

```bash
git add components/dashboard/TourButton.tsx components/dashboard/TourButton.test.tsx components/dashboard/Topbar.tsx
git commit -m "feat: add persistent Topbar button to relaunch the guided tour"
```

---

### Task 5.10 - `HowItWorks` dismissible panel

A persistent, dismissible panel that elevates the report `disclaimer` into plain language and binds its number to `report.persona_count` (never a hardcoded "1000", never a panel count). Dismiss state persists via `safeStorage`.

**Files**
- Create: `apps/web/components/HowItWorks.tsx`
- Test: `apps/web/components/HowItWorks.test.tsx`

**Interfaces**
- Consumes: `readFlag`/`writeFlag` from `@/lib/browser/safeStorage`.
- Produces: `interface HowItWorksProps { personaCount: number; disclaimer?: string }`; `HowItWorks(props: HowItWorksProps): JSX.Element | null`.

**Steps**

- [ ] Write the failing test at `apps/web/components/HowItWorks.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HowItWorks } from '@/components/HowItWorks';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('HowItWorks', () => {
  it('renders the dynamic persona count and never a hardcoded panel count', () => {
    render(<HowItWorks personaCount={1000} />);
    expect(screen.getByText(/1,000 AI personas/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*panels?/i)).toBeNull();
  });

  it('dismisses and persists the dismissal', () => {
    render(<HowItWorks personaCount={500} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss how it works' }));
    expect(screen.queryByText(/AI personas/)).toBeNull();
    expect(window.localStorage.getItem('ps_howitworks_dismissed')).toBe('true');
  });

  it('stays dismissed on remount when the flag is already set', () => {
    window.localStorage.setItem('ps_howitworks_dismissed', 'true');
    render(<HowItWorks personaCount={250} />);
    expect(screen.queryByText(/AI personas/)).toBeNull();
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run components/HowItWorks.test.tsx
```

Expected output (abridged):

```
 FAIL  components/HowItWorks.test.tsx
Error: Failed to load url @/components/HowItWorks ... Does the file exist?
```

- [ ] Create `apps/web/components/HowItWorks.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { readFlag, writeFlag } from '@/lib/browser/safeStorage';

const DISMISS_KEY = 'ps_howitworks_dismissed';

export interface HowItWorksProps {
  personaCount: number;
  disclaimer?: string;
}

export function HowItWorks({ personaCount, disclaimer }: HowItWorksProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (readFlag(DISMISS_KEY)) {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    writeFlag(DISMISS_KEY, true);
    setDismissed(true);
  };

  return (
    <aside
      aria-label="How PersonaStorm works"
      className="relative rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss how it works"
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-100"
      >
        <span aria-hidden="true">×</span>
      </button>
      <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">How this works</h2>
      <p>
        PersonaStorm simulated {personaCount.toLocaleString()} AI personas reacting to your
        stimulus. Every score is computed by the system from those reactions - the AI never
        invents the numbers. Treat this as directional signal, not a replacement for human
        research.
      </p>
      {disclaimer ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{disclaimer}</p>
      ) : null}
    </aside>
  );
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run components/HowItWorks.test.tsx
```

Expected output (abridged):

```
 ✓ components/HowItWorks.test.tsx (3 tests) 34ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- [ ] Commit:

```bash
git add components/HowItWorks.tsx components/HowItWorks.test.tsx
git commit -m "feat: add dismissible how-it-works panel bound to persona_count"
```

---

### Task 5.11 - Smooth-scroll anchor helper and `AnchorScrollManager`

The polish glue for anchor navigation and the R5 auto-expand contract. `scrollToAnchor` scrolls to a `#id`, uses `behavior: 'auto'` under reduced motion, and (for `#criteria`) **dispatches `EXPAND_CRITERIA_EVENT` first** so Phase 2's collapsed tier-3 `CriteriaBreakdown` (`AnchorCollapsible`, Task 2.6) expands **before** the scroll happens. `AnchorScrollManager` wires it to `hashchange` and to the hash present on load, so `TopActions` scroll-links and tour navigation resolve smoothly.

**Single-owner scroll contract (R5):** `AnchorScrollManager` (this task) is the **only** component that scrolls in response to hash navigation. Phase 2's `AnchorCollapsible` listens for `EXPAND_CRITERIA_EVENT` and only **expands** — it must not scroll — so a `#criteria` navigation expands then scrolls exactly once, with no double-scroll. Because `scrollToAnchor` dispatches the event synchronously before calling `scrollIntoView`, both the driver.js tour (which navigates to `#criteria` by setting the hash) and a `TopActions` `<a href="#criteria">` click resolve through the same path.

**Files**
- Create: `apps/web/lib/browser/scrollToAnchor.ts`
- Create: `apps/web/components/report/AnchorScrollManager.tsx`
- Test: `apps/web/lib/browser/scrollToAnchor.test.ts`
- Test: `apps/web/components/report/AnchorScrollManager.test.tsx`

**Interfaces**
- Consumes: `EXPAND_CRITERIA_EVENT` from `@/lib/tour/events`; `prefersReducedMotion` from `@/lib/browser/prefersReducedMotion`.
- Produces:
  - `CRITERIA_ANCHOR = '#criteria'`
  - `scrollToAnchor(anchorId: string): void`
  - `AnchorScrollManager(): JSX.Element | null` (no props)

**Steps**

- [ ] Write the failing helper test at `apps/web/lib/browser/scrollToAnchor.test.ts` (the `#criteria` case asserts the expand event fires **before** the scroll — R5 ordering):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToAnchor } from '@/lib/browser/scrollToAnchor';
import { EXPAND_CRITERIA_EVENT } from '@/lib/tour/events';

afterEach(() => {
  document.body.innerHTML = '';
  // @ts-expect-error cleanup jsdom stub
  delete window.matchMedia;
});

describe('scrollToAnchor', () => {
  it('smooth-scrolls to the target by default', () => {
    const el = document.createElement('div');
    el.id = 'objections';
    const scrollSpy = vi.fn();
    el.scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    scrollToAnchor('#objections');

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('uses instant scroll when reduced motion is preferred', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const el = document.createElement('div');
    el.id = 'pricing';
    const scrollSpy = vi.fn();
    el.scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    scrollToAnchor('#pricing');

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('dispatches the expand event before scrolling to #criteria (R5 ordering)', () => {
    const order: string[] = [];
    const el = document.createElement('div');
    el.id = 'criteria';
    el.scrollIntoView = vi.fn(() => {
      order.push('scroll');
    }) as unknown as typeof el.scrollIntoView;
    document.body.appendChild(el);

    const listener = vi.fn(() => {
      order.push('expand');
    });
    window.addEventListener(EXPAND_CRITERIA_EVENT, listener);

    scrollToAnchor('#criteria');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['expand', 'scroll']);
    window.removeEventListener(EXPAND_CRITERIA_EVENT, listener);
  });

  it('does nothing and never throws when the target is missing', () => {
    expect(() => scrollToAnchor('#nope')).not.toThrow();
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run lib/browser/scrollToAnchor.test.ts
```

Expected output (abridged):

```
 FAIL  lib/browser/scrollToAnchor.test.ts
Error: Failed to load url @/lib/browser/scrollToAnchor ... Does the file exist?
```

- [ ] Create `apps/web/lib/browser/scrollToAnchor.ts`:

```ts
import { EXPAND_CRITERIA_EVENT } from '@/lib/tour/events';
import { prefersReducedMotion } from '@/lib/browser/prefersReducedMotion';

export const CRITERIA_ANCHOR = '#criteria';

export function scrollToAnchor(anchorId: string): void {
  if (typeof document === 'undefined' || !anchorId.startsWith('#')) return;

  if (anchorId === CRITERIA_ANCHOR && typeof window !== 'undefined') {
    // Ask the collapsed tier-3 CriteriaBreakdown (AnchorCollapsible) to expand
    // BEFORE scrolling. AnchorCollapsible only expands on this event; it never
    // scrolls, so AnchorScrollManager remains the single scroll owner (R5).
    window.dispatchEvent(new CustomEvent(EXPAND_CRITERIA_EVENT));
  }

  const target = document.querySelector(anchorId);
  if (!(target instanceof HTMLElement)) return;

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run lib/browser/scrollToAnchor.test.ts
```

Expected output (abridged):

```
 ✓ lib/browser/scrollToAnchor.test.ts (4 tests) 14ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] Write the failing manager test at `apps/web/components/report/AnchorScrollManager.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AnchorScrollManager } from '@/components/report/AnchorScrollManager';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.location.hash = '';
});

describe('AnchorScrollManager', () => {
  it('scrolls to a hash target when the hash changes', () => {
    const el = document.createElement('div');
    el.id = 'segments';
    const scrollSpy = vi.fn();
    el.scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    render(<AnchorScrollManager />);
    window.location.hash = '#segments';
    window.dispatchEvent(new Event('hashchange'));

    expect(scrollSpy).toHaveBeenCalled();
  });
});
```

- [ ] Run it and see it fail:

```bash
npx vitest run components/report/AnchorScrollManager.test.tsx
```

Expected output (abridged):

```
 FAIL  components/report/AnchorScrollManager.test.tsx
Error: Failed to load url @/components/report/AnchorScrollManager ... Does the file exist?
```

- [ ] Create `apps/web/components/report/AnchorScrollManager.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { scrollToAnchor } from '@/lib/browser/scrollToAnchor';

export function AnchorScrollManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHashChange = () => {
      if (window.location.hash) scrollToAnchor(window.location.hash);
    };

    // Honor a hash already present when the report loads.
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return null;
}
```

- [ ] Run it and see it pass:

```bash
npx vitest run components/report/AnchorScrollManager.test.tsx
```

Expected output (abridged):

```
 ✓ components/report/AnchorScrollManager.test.tsx (1 test) 28ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

- [ ] Confirm Phase 2's `AnchorCollapsible` consumes the expand event and does not itself scroll (the single-owner contract). This is a read-only verification of the Phase 2 artifact:

```bash
rg -n "EXPAND_CRITERIA_EVENT|scrollIntoView" components/report/AnchorCollapsible.tsx
```

Expected output: a line adding an `EXPAND_CRITERIA_EVENT` listener and **no** `scrollIntoView` call. If `AnchorCollapsible` still scrolls on `hashchange`, remove that scroll (scrolling is owned by `AnchorScrollManager`); if it does not yet listen for `EXPAND_CRITERIA_EVENT`, add the listener so a `#criteria` navigation expands the table. (Phase 2 Task 2.6 should already satisfy both; this step guards against drift.)

- [ ] Commit:

```bash
git add lib/browser/scrollToAnchor.ts lib/browser/scrollToAnchor.test.ts components/report/AnchorScrollManager.tsx components/report/AnchorScrollManager.test.tsx
git commit -m "feat: add reduced-motion-aware smooth-scroll anchor navigation with single-owner criteria expand"
```

---

### Task 5.12 - Report skeletons and report-page polish wiring

Adds verdict + KPI skeletons for the report loading state, and wires the report page: mounts `AnchorScrollManager`, `HowItWorks`, and the report `Tour`, confirms the `data-tour="full-diagnostics"` anchor is present (added by Phase 2 Task 2.7), and adds `data-tour="json-download"` to the existing JSON download control. Each edit to existing markup is preceded by a discovery command; only the listed attribute is added — existing `href`/`download`/handler/classes are left untouched.

**Files**
- Create: `apps/web/components/report/ReportSkeletons.tsx`
- Modify: `apps/web/app/(app)/storm/[id]/report/loading.tsx`
- Modify: `apps/web/app/(app)/storm/[id]/report/page.tsx`

**Interfaces**
- Consumes: `VerdictBannerSkeleton`/`AtAGlanceSkeleton` from `@/components/report/ReportSkeletons`; `AnchorScrollManager` from `@/components/report/AnchorScrollManager`; `HowItWorks` from `@/components/HowItWorks`; `Tour` from `@/components/Tour`. Report fields `report.persona_count`, `report.disclaimer` (from `report.schema.json`).
- Produces: `VerdictBannerSkeleton(): JSX.Element`; `AtAGlanceSkeleton(): JSX.Element`; report DOM anchor `[data-tour="json-download"]` (the `[data-tour="full-diagnostics"]` anchor already exists from Phase 2 Task 2.7).

**Steps**

- [ ] Create `apps/web/components/report/ReportSkeletons.tsx`:

```tsx
export function VerdictBannerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-xl border border-slate-200 bg-slate-100 p-6 dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="mb-3 h-6 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

export function AtAGlanceSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] In `apps/web/app/(app)/storm/[id]/report/loading.tsx`, render the skeletons (replace the existing loading placeholder body, keeping any existing page shell/layout):

```tsx
import { VerdictBannerSkeleton, AtAGlanceSkeleton } from '@/components/report/ReportSkeletons';

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <VerdictBannerSkeleton />
      <AtAGlanceSkeleton />
    </div>
  );
}
```

- [ ] Locate the report-page import block and the verdict-first content head:

```bash
rg -n "^import|VerdictBanner|AtAGlance|TopActions" "app/(app)/storm/[id]/report/page.tsx"
```

Expected output (line numbers will vary): the import block, and the `<VerdictBanner … />` render line at the top of the verdict-first content (Phase 2 Task 2.7).

- [ ] Add the imports:

```tsx
import { AnchorScrollManager } from '@/components/report/AnchorScrollManager';
import { HowItWorks } from '@/components/HowItWorks';
import { Tour } from '@/components/Tour';
```

- [ ] Mount `AnchorScrollManager` and `HowItWorks` at the top of the report content (directly above the existing `<VerdictBanner … />`), and `<Tour page="report" />` as the last child of the report content (keep the existing verdict-first layout and the 6 tiers unchanged):

```tsx
<AnchorScrollManager />
<HowItWorks personaCount={report.persona_count} disclaimer={report.disclaimer} />

{/* ...existing VerdictBanner / AtAGlance / TopActions... */}
{/* ...existing "Full diagnostics" divider + 6 tiers... */}

<Tour page="report" />
```

- [ ] Confirm the "Full diagnostics" divider already carries both `id` and `data-tour` (added in Phase 2 Task 2.7 — no re-add needed):

```bash
rg -n "full-diagnostics" "app/(app)/storm/[id]/report/page.tsx"
```

Expected output: a single divider element line carrying both `id="full-diagnostics"` and `data-tour="full-diagnostics"`. If `data-tour="full-diagnostics"` is missing, add it to that element; otherwise leave it unchanged.

- [ ] Locate the JSON download control and add the `data-tour="json-download"` anchor to it:

```bash
rg -n "download|\.json|Download JSON|application/json" "app/(app)/storm/[id]/report/page.tsx"
```

Expected output (line numbers will vary): the `<a>` (or `<button>`) that triggers the JSON export. Add `data-tour="json-download"` to that element's opening tag, leaving its existing `href`/`download`/handler/classes unchanged:

```tsx
data-tour="json-download"
```

- [ ] Verify the report anchor now exists:

```bash
rg -n "data-tour=\"json-download\"" "app/(app)/storm/[id]/report/page.tsx"
```

Expected output: one matching line.

- [ ] Typecheck:

```bash
npx tsc --noEmit
```

Expected output:

```
(no output)
```

- [ ] Commit:

```bash
git add components/report/ReportSkeletons.tsx "app/(app)/storm/[id]/report/loading.tsx" "app/(app)/storm/[id]/report/page.tsx"
git commit -m "feat: add report skeletons and wire tour, anchor nav, and how-it-works into report page"
```

---

### Task 5.13 - "Reconnecting…" state and self-explaining live copy

Turns the transient `connectionError` (3 failed connects before `init`) into a soft "Reconnecting…" status rather than a hard failure, and adds one-line "what is this?" copy on the live grid. Uses the `connectionError` value already returned by `useStormStream`.

**Files**
- Modify: `apps/web/app/(app)/storm/[id]/page.tsx`

**Interfaces**
- Consumes: `connectionError: boolean` (from the existing `useStormStream` return value used on this page).
- Produces: a `role="status"` "Reconnecting…" banner; one-line grid caption copy.

**Steps**

- [ ] Locate where the stream state (including `connectionError`) is consumed and where the grid renders:

```bash
rg -n "connectionError|useStormStream|GridLegend|PersonaGrid" "app/(app)/storm/[id]/page.tsx"
```

Expected output (line numbers will vary): the `useStormStream(...)` call destructuring `connectionError`, the `<GridLegend />` mounted in Task 5.8, and the `<PersonaGrid … />` render. The banner goes above the grid; the caption goes directly under `<GridLegend />`.

- [ ] Render a soft reconnecting banner when `connectionError` is true (place it above the grid; keep all existing stream/grid rendering):

```tsx
{connectionError ? (
  <div
    role="status"
    aria-live="polite"
    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
  >
    Reconnecting…
  </div>
) : null}
```

- [ ] Add a one-line self-explaining caption directly under the `<GridLegend />` mounted in Task 5.8 (no hardcoded persona count - refer to the personas generically):

```tsx
<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
  Each cell is one AI persona reacting live to your stimulus.
</p>
```

- [ ] Typecheck:

```bash
npx tsc --noEmit
```

Expected output:

```
(no output)
```

- [ ] Commit:

```bash
git add "app/(app)/storm/[id]/page.tsx"
git commit -m "feat: soften stream connectionError to Reconnecting state with self-explaining grid copy"
```

---

### Task 5.14 - Phase verification: full unit suite green

Runs the whole Vitest suite to confirm the phase's components and helpers pass together and nothing regressed.

**Files**
- (verification only)

**Interfaces**
- Consumes: all Phase 5 test files.
- Produces: a green unit run.

**Phase 5 test inventory (exact counts):** this phase adds **9 test files / 27 tests**:

| Test file | Tests |
|---|---|
| `lib/browser/safeStorage.test.ts` | 4 |
| `lib/browser/prefersReducedMotion.test.ts` | 3 |
| `lib/tour/steps.test.ts` | 5 |
| `components/Tour.test.tsx` | 4 |
| `components/storm/GridLegend.test.tsx` | 2 |
| `components/dashboard/TourButton.test.tsx` | 1 |
| `components/HowItWorks.test.tsx` | 3 |
| `lib/browser/scrollToAnchor.test.ts` | 4 |
| `components/report/AnchorScrollManager.test.tsx` | 1 |
| **Phase 5 subtotal** | **27** |

**Steps**

- [ ] Run only this phase's suites to confirm the exact Phase 5 totals:

```bash
npx vitest run lib/browser/safeStorage.test.ts lib/browser/prefersReducedMotion.test.ts lib/tour/steps.test.ts components/Tour.test.tsx components/storm/GridLegend.test.tsx components/dashboard/TourButton.test.tsx components/HowItWorks.test.tsx lib/browser/scrollToAnchor.test.ts components/report/AnchorScrollManager.test.tsx
```

Expected output (abridged):

```
 ✓ lib/browser/safeStorage.test.ts (4 tests)
 ✓ lib/browser/prefersReducedMotion.test.ts (3 tests)
 ✓ lib/tour/steps.test.ts (5 tests)
 ✓ components/Tour.test.tsx (4 tests)
 ✓ components/storm/GridLegend.test.tsx (2 tests)
 ✓ components/dashboard/TourButton.test.tsx (1 test)
 ✓ components/HowItWorks.test.tsx (3 tests)
 ✓ lib/browser/scrollToAnchor.test.ts (4 tests)
 ✓ components/report/AnchorScrollManager.test.tsx (1 test)

 Test Files  9 passed (9)
      Tests  27 passed (27)
```

- [ ] Run the full unit suite to confirm no regression across earlier phases (the run also includes the Phase 0-4 suites; the 9 files / 27 tests above are Phase 5's contribution to that total):

```bash
npx vitest run
```

Expected output (abridged - Phase 5's suites appear alongside the Phase 0-4 suites, all green):

```
 ✓ lib/browser/safeStorage.test.ts (4 tests)
 ✓ lib/browser/prefersReducedMotion.test.ts (3 tests)
 ✓ lib/tour/steps.test.ts (5 tests)
 ✓ components/Tour.test.tsx (4 tests)
 ✓ components/storm/GridLegend.test.tsx (2 tests)
 ✓ components/dashboard/TourButton.test.tsx (1 test)
 ✓ components/HowItWorks.test.tsx (3 tests)
 ✓ lib/browser/scrollToAnchor.test.ts (4 tests)
 ✓ components/report/AnchorScrollManager.test.tsx (1 test)
 ... (Phase 0-4 suites, all passing)

 Test Files  <all> passed
      Tests  <all> passed
```

- [ ] Confirm no `console.log`/debug statements were introduced in this phase's new files (`rg` exits non-zero with no output when there are no matches):

```bash
rg -n "console\.log" components/Tour.tsx components/HowItWorks.tsx components/storm/GridLegend.tsx components/dashboard/TourButton.tsx components/report/AnchorScrollManager.tsx components/report/ReportSkeletons.tsx lib/tour lib/browser
```

Expected output (no matches):

```
(no output)
```

- [ ] Commit (docs/chore marker for the completed phase, if your plan tracks phase completion; otherwise skip):

```bash
git commit --allow-empty -m "chore: complete phase 5 - guided tour and polish"
```

---

## Phase 6 - E2E smoke + final verification

**Prerequisites (must be green before starting this phase):** Phases 0-5 are merged. In particular:
- **Phase 0** — `apps/web/lib/server/demo.ts` (`DEMO_STORM_ID = "demo-personapilot"`), the single `apps/web/vitest.config.ts` with its `coverage.include=['lib/server/engine/verdict.ts']` + 100% branch/function/line/statement thresholds, the `test`/`test:watch`/`test:coverage` npm scripts, and the `verdict`/`top_actions` fields in `packages/schemas/report.schema.json`.
- **Phase 1** — the `deriveVerdict`/`selectTopActions` core in `apps/web/lib/server/engine/verdict.ts` with passing Vitest unit tests at 100% branch coverage.
- **Phase 2** — the `VerdictBanner`, `TopActions`, and `AtAGlance` report components and the verdict-first `app/(app)/storm/[id]/report/page.tsx` restructure (with the `#full-diagnostics` divider and auto-expanding `#criteria` table).
- **Phase 3** — the `is_demo` migration + anon RLS policy on both the runs and events tables, `apps/web/scripts/seed_demo_storm.ts` (idempotent seed, Task 3.4), the `/demo` redirect route, and the `is_demo` retrieval bypass in `stormStore` + the anon-client fallback in the stream route.
- **Phase 4** — the landing **"Watch a 60-second live simulation"** CTA in `app/page.tsx`, plus the `DEMO_SIGNUP_CREDITS` grant and welcome toast.
- **Phase 5** — the tour/polish `data-tour="..."` attributes (`persona-grid` on `PersonaGrid`, `verdict-banner` on `VerdictBanner`), `GridLegend`, `HowItWorks`, and `apps/web/lib/tour/steps.ts`.

This phase adds Playwright and the final cross-suite verification only — it writes **no product code**.

**Inherited constraints (every task):** Node 18.17+; Next.js 14 App Router; TypeScript; all work is UX/test-layer in `apps/web` and ADDITIVE. Do NOT touch `apps/api`, engine numeric outputs, or any pricing surface. `verdict.ts` stays the only isomorphic engine module. No hardcoded persona/panel counts in copy. Selectors below must match the `data-tour` tokens set in earlier phases (the report components created in **Phase 2**, and the tour/polish edits in **Phase 5**) — where a task names a token, verify it against `apps/web/lib/tour/steps.ts` and the target component, and adjust the selector string if that phase chose a different token (do not invent a new attribute).

**Shell note (Windows/PowerShell host):** every fenced command in this phase invokes only cross-platform CLIs (`npm`, `npx`, `git`, `rg`, `python`) and uses no bash-only constructs — no `&&`-chaining, no inline `VAR=...` prefixes, no `$VAR`, no `/dev/null`, no pipes to `head`. Each block therefore runs verbatim in **either** the Bash tool (Git Bash / POSIX sh) or PowerShell. Where a step says "From `apps/web`", set the working directory with a **separate** `cd apps/web` statement first (PowerShell: `Set-Location apps/web`) — do not `&&`-chain it. Prefer the repo-root `npm --prefix apps/web ...` form shown below, which needs no directory change.

**Environment note:** the E2E `globalSetup` runs the idempotent demo seed, so `apps/web/.env.local` must carry the same Supabase URL / service-role + anon keys the app uses. The seed upserts `DEMO_STORM_ID`, so re-running is safe.

---

### Task 6.1 - Add Playwright to apps/web (dependency + scripts)

**Files**
- Modify: `apps/web/package.json` (devDependency `@playwright/test`; `test:e2e` + `test:e2e:report` scripts)

**Interfaces**
- Consumes: existing `apps/web/package.json` `scripts` object (from Phase 0 Task 0.1).
- Produces: npm scripts `test:e2e` → `playwright test`, `test:e2e:report` → `playwright show-report`. No exported code.

**Steps**

- [ ] Add the Playwright test runner as a dev dependency (this writes the pinned version into `apps/web/package.json` automatically). From repo root:

  ```bash
  npm --prefix apps/web install -D @playwright/test@^1.48.0
  ```

  Expected output (version/counts vary):

  ```
  added 3 packages, and audited 812 packages in 6s
  found 0 vulnerabilities
  ```

- [ ] Open `apps/web/package.json`, locate the `"scripts"` object, and add these two keys (keep existing keys such as `"dev"`, `"build"`, `"start"`, `"test"`, `"test:coverage"` untouched — these two are additive):

  ```json
    "test:e2e": "playwright test",
    "test:e2e:report": "playwright show-report"
  ```

- [ ] Confirm the script is wired and the CLI resolves (no browsers needed yet):

  ```bash
  npm --prefix apps/web run test:e2e -- --version
  ```

  Expected output:

  ```
  Version 1.48.0
  ```

- [ ] Commit:

  ```bash
  git add apps/web/package.json apps/web/package-lock.json
  git commit -m "chore: add @playwright/test and e2e scripts to apps/web"
  ```

---

### Task 6.2 - Playwright config + demo-seed global setup

**Files**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/global-setup.ts`

**Interfaces**
- Consumes: `apps/web/scripts/seed_demo_storm.ts` (CLI entry, idempotent, from Phase 3 Task 3.4); `apps/web` `dev`/`start` npm scripts; env vars in `apps/web/.env.local`.
- Produces: default-exported Playwright `defineConfig` object (testDir `./e2e`, baseURL `http://localhost:3000`, `webServer`, `globalSetup`); `globalSetup(): Promise<void>`.

**Steps**

- [ ] Create the config. It runs one Chromium project, anonymously (no `storageState` — the demo path must never need a session), auto-starts the Next.js dev server, and reuses an already-running local server:

  ```ts
  // apps/web/playwright.config.ts
  import { defineConfig, devices } from '@playwright/test'

  const PORT = 3000
  const BASE_URL = `http://localhost:${PORT}`

  export default defineConfig({
    testDir: './e2e',
    // SSE replay of a 1000-cell run needs headroom; smoke is presence/flow only.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    // Seeds the idempotent demo storm before any test runs.
    globalSetup: './e2e/global-setup.ts',
    use: {
      baseURL: BASE_URL,
      // No storageState: the whole point of the demo is anonymous access.
      trace: 'on-first-retry',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
      command: `npm run dev -- --port ${PORT}`,
      url: BASE_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  })
  ```

- [ ] Create the global setup. It shells out to the idempotent seed so `DEMO_STORM_ID` exists before the anonymous flow streams it. `cwd` is `apps/web` (Playwright runs from the config directory), so the relative script path resolves to `apps/web/scripts/seed_demo_storm.ts`:

  ```ts
  // apps/web/e2e/global-setup.ts
  import { execSync } from 'node:child_process'

  /**
   * The public golden path streams the pre-baked demo run. The seed script is
   * idempotent (upserts DEMO_STORM_ID), so running it every time is safe and
   * guarantees the fixture exists in a fresh environment.
   * Requires apps/web/.env.local to carry the Supabase keys the app uses.
   */
  async function globalSetup(): Promise<void> {
    execSync('npx tsx scripts/seed_demo_storm.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  }

  export default globalSetup
  ```

- [ ] Verify the seed runs standalone (so a setup failure is diagnosed separately from a test failure). From `apps/web` (set the working directory first with a separate `cd apps/web` / `Set-Location apps/web` statement):

  ```bash
  npx tsx scripts/seed_demo_storm.ts
  ```

  Expected output — the Phase 3 Task 3.4 script logs progress lines and a final `done` line; the key assertion is that final line (event count `<N>` varies with the seeded fixture):

  ```
  [seed] running...
  [seed] upserting...
  [seed] replacing...
  [seed] done: demo-personapilot (<N> events).
  ```

- [ ] Commit:

  ```bash
  git add apps/web/playwright.config.ts apps/web/e2e/global-setup.ts
  git commit -m "test: add playwright config and demo-seed global setup"
  ```

---

### Task 6.3 - Demo smoke, step 1: landing + CTA (RED → GREEN via browser install)

**Files**
- Create: `apps/web/e2e/demo.spec.ts`

**Interfaces**
- Consumes: landing route `/`; landing CTA accessible name `Watch a 60-second live simulation` (from **Phase 4** `app/page.tsx`).
- Produces: Playwright test `anonymous evaluator: landing loads and exposes Watch-live CTA`.

**Steps**

- [ ] Write the first, minimal assertion of the golden path — the landing loads and the demo CTA is present and points at `/demo`:

  ```ts
  // apps/web/e2e/demo.spec.ts
  import { test, expect } from '@playwright/test'

  test('anonymous evaluator: landing loads and exposes Watch-live CTA', async ({ page }) => {
    // No login, no storageState — this navigation is fully anonymous.
    await page.goto('/')

    const watchLive = page.getByRole('link', {
      name: /watch a 60-second live simulation/i,
    })
    await expect(watchLive).toBeVisible()
    await expect(watchLive).toHaveAttribute('href', /\/demo$/)
  })
  ```

- [ ] Run it and watch it FAIL because the Chromium binary is not installed yet (this is the genuine red step):

  ```bash
  npm --prefix apps/web run test:e2e
  ```

  Expected failure output (paths vary):

  ```
  Error: browserType.launch: Executable doesn't exist at
  ...\ms-playwright\chromium-1140\chrome-win\chrome.exe
  ╔══════════════════════════════════════════════════════╗
  ║ Looks like Playwright Test or Playwright was just     ║
  ║ installed or updated.                                 ║
  ║ Please run the following command to download          ║
  ║ new browsers:                                         ║
  ║     npx playwright install                            ║
  ╚══════════════════════════════════════════════════════╝
  ```

- [ ] Install the Chromium browser binary. From `apps/web` (separate `cd apps/web` / `Set-Location apps/web` statement first):

  ```bash
  npx playwright install chromium
  ```

  Expected output:

  ```
  Downloading Chromium 114.0 (playwright build v1140) ...
  Chromium 114.0 (playwright build v1140) downloaded to ...\ms-playwright\chromium-1140
  ```

- [ ] Run again and watch it PASS (Playwright auto-starts the dev server via `webServer`, then runs the anonymous landing check):

  ```bash
  npm --prefix apps/web run test:e2e
  ```

  Expected output:

  ```
  Running 1 test using 1 worker
    ✓  1 [chromium] › demo.spec.ts:4:1 › anonymous evaluator: landing loads and exposes Watch-live CTA (2.1s)
    1 passed (14s)
  ```

- [ ] Commit:

  ```bash
  git add apps/web/e2e/demo.spec.ts
  git commit -m "test: add public demo smoke covering landing Watch-live CTA"
  ```

---

### Task 6.4 - Demo smoke, step 2: full golden path to verdict

**Files**
- Modify: `apps/web/e2e/demo.spec.ts` (extend to the full anonymous flow)

**Interfaces**
- Consumes: `/demo` redirect → `/storm/demo-personapilot`; `data-tour="persona-grid"` on `PersonaGrid`; report route `/storm/demo-personapilot/report`; `data-tour="verdict-banner"` on `VerdictBanner`; the three canonical verdict headlines (`Strong signal - worth building` / `Promising - fix these first` / `Weak signal - not yet`).
- Produces: Playwright test `anonymous evaluator: landing -> Watch live -> streaming grid -> report verdict`.

**Steps**

- [ ] Replace the file body with the complete golden-path test. It drives landing → CTA click → `/demo` redirect → streaming grid → report, asserts the `VerdictBanner` renders a canonical headline, and asserts the visitor was never bounced to an auth page (the anonymous guarantee, Success Criterion 1):

  ```ts
  // apps/web/e2e/demo.spec.ts
  import { test, expect } from '@playwright/test'

  const DEMO_STORM_ID = 'demo-personapilot'

  test('anonymous evaluator: landing -> Watch live -> streaming grid -> report verdict', async ({
    page,
  }) => {
    // 1. Landing loads (fully anonymous — no login, no storageState).
    await page.goto('/')

    // 2. Primary demo CTA present; click it.
    const watchLive = page.getByRole('link', {
      name: /watch a 60-second live simulation/i,
    })
    await expect(watchLive).toBeVisible()
    await watchLive.click()

    // 3. /demo redirects to the live storm page.
    await expect(page).toHaveURL(new RegExp(`/storm/${DEMO_STORM_ID}(/)?$`))

    // 4. The persona grid streams via SSE (anon-client + RLS, no token).
    const grid = page.locator('[data-tour="persona-grid"]')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    // Streaming proof: cells populate from the replay events.
    await expect(grid.locator(':scope > *').first()).toBeVisible({ timeout: 30_000 })

    // Anonymous guarantee: no auth redirect happened anywhere in the live flow.
    await expect(page).not.toHaveURL(/\/(login|signin|auth)/)

    // 5. Navigate to the report (reused route via the is_demo retrieval bypass).
    await page.goto(`/storm/${DEMO_STORM_ID}/report`)

    // 6. Verdict-first: the banner is visible above the fold with a canonical headline.
    const verdict = page.locator('[data-tour="verdict-banner"]')
    await expect(verdict).toBeVisible({ timeout: 20_000 })
    await expect(verdict).toContainText(
      /(Strong signal - worth building|Promising - fix these first|Weak signal - not yet)/,
    )

    // Still anonymous on the report; never redirected to auth.
    await expect(page).toHaveURL(new RegExp(`/storm/${DEMO_STORM_ID}/report(/)?$`))
    await expect(page).not.toHaveURL(/\/(login|signin|auth)/)
  })
  ```

- [ ] Run the full smoke and watch it PASS end-to-end:

  ```bash
  npm --prefix apps/web run test:e2e
  ```

  Expected output:

  ```
  Running 1 test using 1 worker
    ✓  1 [chromium] › demo.spec.ts:8:1 › anonymous evaluator: landing -> Watch live -> streaming grid -> report verdict (11.4s)
    1 passed (27s)
  ```

- [ ] If it fails on a selector (grid or verdict), confirm the token strings against `apps/web/lib/tour/steps.ts` and the components (Phase 2 `VerdictBanner`, Phase 5 storm-page/`PersonaGrid` edits), then update the `[data-tour="..."]` string here to match — do not add new attributes to the components. Re-run until green.

- [ ] Commit:

  ```bash
  git add apps/web/e2e/demo.spec.ts
  git commit -m "test: extend demo smoke to full anonymous landing->grid->verdict path"
  ```

---

### Task 6.5 - Final cross-suite verification + manual QA checklist

**Files**
- Create: none (verification only — this task runs suites and records a sign-off; write results into the PR description, not a repo file).

**Interfaces**
- Consumes: `apps/web` `test:coverage` script (Vitest, from Phase 0 Task 0.1, `= vitest run --coverage`); `apps/web` `test:e2e` script; `apps/api` pytest suite; ripgrep for the no-hardcoded-counts scan.
- Produces: a pass/fail verdict on all five success criteria (recorded in the PR body). No exported code.

**Steps**

- [ ] **Unit + branch coverage on the derivation core.** Run Vitest with coverage from repo root (this is the canonical script from Phase 0 Task 0.1; it honors the Phase 0 `coverage.include` + 100% per-file thresholds):

  ```bash
  npm --prefix apps/web run test:coverage
  ```

  Expected — the FULL Vitest suite (every `*.test.ts(x)` added across Phases 0-5) runs, and because Phase 0's `coverage.include` limits the report to the gated module, the coverage table shows exactly one row, `verdict.ts` at 100% on all four axes:

  ```
   ✓ lib/server/engine/verdict.test.ts (...)
   ✓ lib/server/engine/topActions.test.ts (...)
   ✓ components/report/VerdictBanner.test.tsx (...)
   ✓ components/report/TopActions.test.tsx (...)
   ✓ components/report/AtAGlance.test.tsx (...)
   ... (all remaining suites from Phases 0-5) ...

   % Coverage report from v8
  --------------|---------|----------|---------|---------|
  File          | % Stmts | % Branch | % Funcs | % Lines |
  --------------|---------|----------|---------|---------|
  verdict.ts    |     100 |      100 |     100 |     100 |
  --------------|---------|----------|---------|---------|
  ```

  **Concrete gate (record the actual figures in the PR body):** the run must print **`Test Files N passed (N)`** with **0 failed** and **`Tests M passed (M)`** with **0 failed, 0 skipped**, where `N` is the cumulative count of every test file added across Phases 0-5 (at minimum: `demo.test.ts`, `reportSchema.test.ts`, `verdict.test.ts`, `topActions.test.ts`, `VerdictBanner.test.tsx`, `TopActions.test.tsx`, `AtAGlance.test.tsx`, the Phase 2 anchor/collapsible test, the Phase 3 `route.test.ts` files, the Phase 4 credits/toast/CTA tests, and the Phase 5 tour/legend/storage tests). Copy the exact `N`/`M` the run prints into the PR — do not compare against a hardcoded guess; the pass/fail gate is **0 failed, 0 skipped, and `verdict.ts` at 100% Branch**. If Branch on `verdict.ts` is **below 100**, the per-file threshold from Phase 0 forces a non-zero exit — that is a regression in the verdict phase (Phase 1); stop and add the missing-branch case there, do not "fix" it in this phase. If the run errors that the coverage provider is missing, install it once (`npm --prefix apps/web install -D @vitest/coverage-v8`) and re-run.

- [ ] **Public demo smoke (Playwright).** Confirm the marquee path is green — this suite is exactly **1 test** (`demo.spec.ts`):

  ```bash
  npm --prefix apps/web run test:e2e
  ```

  Expected:

  ```
    ✓  1 [chromium] › demo.spec.ts › anonymous evaluator: landing -> Watch live -> streaming grid -> report verdict (…)
    1 passed (…)
  ```

- [ ] **Python suite unchanged (no engine numbers moved).** Because `apps/api` is untouched, its pass count must not move. First capture the baseline on a clean checkout of the pre-change base branch, then run again on this branch and confirm the identical count. From repo root:

  ```bash
  python -m pytest apps/api/tests -q
  ```

  Expected — **0 failed** and the **same** total as the recorded baseline (engine outputs are read-only, so the number must not change). Record both the baseline and post-change totals in the PR:

  ```
  ................................................
  <baseline-count> passed in X.XXs
  ```

- [ ] **No hardcoded persona/panel counts in copy (Success Criterion 4 / R18).** Scan the user-facing surfaces with ripgrep (runs identically in Bash and PowerShell):

  ```bash
  rg -n -i "[0-9]{3,4}\s+personas|[0-9]+\s+panels" apps/web/app apps/web/components
  ```

  Expected: **no matches** (ripgrep prints nothing and exits non-zero). Any hit is a copy fix in the owning component before sign-off.

- [ ] **Manual QA checklist — map each success criterion to a concrete check.** Walk these against the running dev server (`npm --prefix apps/web run dev`) in a fresh anonymous browser profile (no cookies), recording PASS/FAIL for each:

  - [ ] **SC1 — Zero-friction wow.** Open `/` incognito → click "Watch a 60-second live simulation" → observe the grid stream → open the report. Confirm: no signup prompt, no credit spend, URL never touches `/login` or `/signin`. Confirm the DB boundary by opening the report of a **non-demo** id while anonymous → expect **404** (ids never leak).
  - [ ] **SC2 — Verdict in one glance.** On `/storm/demo-personapilot/report`, confirm the top-of-page order is `VerdictBanner` → `AtAGlance` (4 KPI tiles) → `TopActions` (up to 3 rows), all **above** the "Full diagnostics" divider (`id="full-diagnostics"`). If confidence is low or collapse risk is non-low, confirm the "Directional only" caveat pill renders with an amber accent layered over (not replacing) the level color.
  - [ ] **SC3 — Depth preserved.** Below the divider, confirm all six tiers render **expanded** (T1 Overview+Trust, T2 Adoption, T3 Criteria, T4 Deep-dives, T5 Evidence, T6 Next steps) and every panel is present. Confirm only the tier-3 `CriteriaBreakdown` raw table is collapsed by default, and that clicking a Top-action or tour step whose `anchorId` is `#criteria` **auto-expands** that table before smooth-scrolling to it.
  - [ ] **SC4 — Self-explaining, guided, polished.** On a first anonymous visit confirm the tour fires (≤3 steps on the live page, ≤4 on the report), is skippable via Esc, and re-launches from the Topbar "?" button. Confirm the `GridLegend` is visible without the tour and the `HowItWorks` panel is present and dismissible. Confirm no tour/panel copy asserts a persona or panel count (cross-check with the ripgrep result above).
  - [ ] **SC5 — Credible and intact.** Confirm the three suite runs above are green: Vitest at 100% branch on `verdict.ts` with 0 failed/0 skipped, the Playwright smoke passes (1/1), and `apps/api` pytest passes at the unchanged baseline count. Download the report JSON from the report page and confirm it contains the persisted `verdict` and `top_actions` fields (validates the seed + build-time persistence end-to-end).

- [ ] **Record the sign-off.** Paste the four command outputs (with the concrete `N`/`M`/baseline figures filled in) and the SC1-SC5 PASS/FAIL grid into the PR description under a "Phase 6 verification" heading. No repo file is created for this.

- [ ] Commit any incidental fixes surfaced during QA (e.g. a copy edit from the ripgrep scan) with a scoped message, for example:

  ```bash
  git add apps/web/components apps/web/app
  git commit -m "fix: remove hardcoded persona count from live-grid copy"
  ```

  If QA surfaced no fixes, there is nothing to commit — the verification result lives in the PR body.
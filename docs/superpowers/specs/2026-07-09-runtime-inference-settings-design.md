---
title: PersonaStorm - Runtime Inference Settings (apps/web admin panel)
date: 2026-07-09
status: draft
approach: "Supabase-backed admin-editable settings, mirroring the Pricing pattern"
---

# PersonaStorm - Runtime Inference Settings (apps/web admin panel)

Make the inference/analyst model configuration editable at **runtime** from the existing `apps/web` admin panel — stored in Supabase, read by the TypeScript engine per-storm — so an admin can change the provider/model without a redeploy. The **only** deployment secret that remains is the API key (`NVIDIA_API_KEY`, plus the endpoint `NVIDIA_BASE_URL`); every other inference knob becomes an admin-editable setting.

## 1. Summary & Goals

**Summary.** PersonaStorm is a synthetic market-research SaaS. The production app is the Next.js full-stack app `apps/web` (Vercel + Supabase): it runs storms **in-process** on its own TypeScript engine (`lib/server/stormEngine.ts` → `runStorm`, which builds `getProvider(cfg)`/`getAnalyst(cfg)` from a `ServerConfig`), and it already has an admin panel (`app/(app)/admin/page.tsx`) plus admin API route handlers that read/write shared Supabase tables (e.g. Pricing). Today, inference config comes only from environment variables read by `getConfig()` in `lib/server/env.ts`; changing the provider or model requires editing env vars and redeploying. This project moves that config into a Supabase-backed, admin-editable settings record.

**Motivation.** The team wants to switch the model/provider from inside the app, not by re-deploying, and wants the API key to be the only real secret. Because Vercel is serverless (no persistent process), in-memory config is not durable — the settings must live in the database, exactly like the existing Pricing rule.

**Scope note — this is sub-project 1 of 2.** The companion sub-project (separate spec) **ports the nemotron reasoning support to the `apps/web` TypeScript engine** (reasoning params, 3-way structured output, retry/backoff, drop-cap — already built in the Python `apps/api` engine). This spec ships on the **current** TS engine (mock + `z-ai/glm-5.2`); once the port lands, `nvidia/nemotron-3-ultra-550b-a55b` and its knobs are added to this same settings table + UI. This spec is deliberately buildable and valuable on its own.

**Chosen approach — Supabase settings table, mirroring Pricing.** A single active `inference_settings` row, edited by the admin panel through a new admin route handler, resolved over the env `ServerConfig`, and read by `runStorm` per-storm. It reuses the app's established `pricing_rules` pattern end to end (migration + RLS, `Gateway` methods, `*FromRow` defaults, admin route, admin UI). Rejected alternatives: a generic untyped `app_settings` key/value table (loses typing/validation — YAGNI), and env-only hot-reload (meaningless on Vercel serverless — no persistent process to hold state).

**Hard constraints.**

- **Only the API key (and endpoint URL) stay secret/env.** `NVIDIA_API_KEY` and `NVIDIA_BASE_URL` are read **only** from server env, never stored in the DB, never sent to the browser. Every other inference knob is a DB setting.
- **The key never reaches the browser.** The admin GET returns a read-only `nvidia_api_key_configured: boolean` (derived from env presence) — never the key value.
- **Off-by-default / backward compatible.** With no settings row, resolution yields exactly today's env-driven `ServerConfig`; existing behavior is unchanged.
- **Admin-only.** Both read and write of the settings go through `requireAdmin`, like Pricing.
- **`apps/api` is untouched** (it has its own settings story; out of scope here).

**Success criteria** (checkable):

1. **Editable in the panel.** An admin opens the admin page, sees the current inference config pre-filled, changes the provider/model/token knobs, clicks Save, and the values persist to Supabase (survive a redeploy/cold start).
2. **Takes effect without redeploy.** A storm created **after** a Save uses the new provider/model — because `runStorm` receives a config resolved from the DB at create time.
3. **Key stays server-side.** The admin GET response never contains `NVIDIA_API_KEY`; it contains only `nvidia_api_key_configured` (bool) and `nvidia_base_url` (for display). `NVIDIA_API_KEY`/`NVIDIA_BASE_URL` remain Vercel env; nothing else needs to be.
4. **Safe defaults.** With no `inference_settings` row present, the resolved config equals today's env config field-for-field, and every existing test stays green.
5. **Guarded.** Non-admins are rejected from GET/POST; invalid writes (bad provider enum, out-of-range token counts) return 400 and change no row.
6. **Covered.** New logic ships with Vitest tests: gateway get/update (in-memory), resolver precedence, admin route auth + validation, `runStorm` honoring the resolved config, and the key never being serialized.

## 2. Context: how apps/web works today

`apps/web` is a Vercel full-stack Next.js app; the "backend" is Route Handlers under `app/api/*` on the same origin, plus a self-contained engine in `lib/server/engine`. It shares a Supabase project (auth + Postgres) with the parallel `apps/api` reference service but does not call it.

- **Config:** `getConfig()` in `lib/server/env.ts` reads `process.env` into a typed `ServerConfig` (fields include `inferenceProvider`, `analystProvider`, `nvidiaApiKey`, `nvidiaBaseUrl`, `nvidiaModel`, `nvidiaMaxTokens`, `analystMaxTokens`, `personaSeed`, stream pacing, Supabase keys). `InferenceProvider`/`AnalystProvider` are `"mock" | "nvidia"`.
- **Engine:** `runStorm(input, cfg = getConfig())` (`lib/server/stormEngine.ts`) builds `getProvider(cfg)` (`engine/providers/index.ts`) and `getAnalyst(cfg)` (`engine/analyst/index.ts`) **per storm**. So config is already a per-call parameter — the ideal seam.
- **Storm entry:** `createAndRunStorm(...)` in `lib/server/stormStore.ts` authenticates, prices/charges via the gateway, records the run, calls `runStorm`, persists, refunds on failure. A `Gateway` (from `buildGateway()`) is already in scope here.
- **Admin + gateway config pattern (the template to mirror):** `lib/server/pricing.ts` defines `PricingRule`, `pricingRuleFromRow(row)` (returns defaults when `row` is null), and `getPricingRule(gateway)` → `gateway.getActivePricing()`. The `Gateway` interface has `getActivePricing()` / `updateActivePricing(...)`, implemented by both `HttpGateway` (Supabase REST against `pricing_rules`) and `InMemoryGateway` (dev/test). `app/api/admin/pricing/route.ts` exposes `GET`/`POST` behind `requireAdmin(request, gateway)`, validating and writing via the gateway. The admin page renders the pricing controls.

## 3. Design

### 3.1 Storage — `inference_settings` table

New migration `supabase/migrations/<timestamp>_inference_settings.sql`, mirroring `pricing_rules`:

- Table `inference_settings` with one active row: `id uuid pk`, `is_active boolean`, `updated_at timestamptz`, and one column per editable knob (§3.2) — no columns for the API key or base URL. A single-active-row invariant is enforced the same way `pricing_rules` does it (confirm the exact mechanism against that migration during implementation).
- **RLS mirrors `pricing_rules`:** writes restricted to admins via the existing `is_admin()` helper (see `20260705150000_harden_is_admin.sql`); the engine and route handler read/write through the **service role** (server-side), which bypasses RLS. No anon/public access.
- A default active row may be seeded by the migration (all columns = the current code defaults), or left empty and defaulted in code — see §3.3. **Chosen: leave empty; default in code** (so a fresh DB and a DB with no row behave identically, and defaults live in one place).

### 3.2 What is editable vs. env-only

**DB-editable (this sub-project — honored by today's TS engine):**
`inference_provider` (`mock`|`nvidia`), `analyst_provider` (`mock`|`nvidia`), `nvidia_model` (string), `analyst_model` (string, optional; falls back to `nvidia_model`), `nvidia_max_tokens` (int), `analyst_max_tokens` (int).

**Env-only, never in the DB or the browser:** `NVIDIA_API_KEY` (secret) and `NVIDIA_BASE_URL` (endpoint — kept env-only so an admin cannot repoint the endpoint the API key is sent to).

**Deferred to sub-project 2** (added to this table + UI when the TS engine can honor them): `nvidia_structured_output`, `nvidia_enable_thinking`, `nvidia_reasoning_budget`, `nvidia_max_retries`, `swarm_max_drop_fraction`, `storm_max_concurrency`, and the `nvidia/nemotron-3-ultra-550b-a55b` model option. Not shown now, to avoid dead controls.

`analyst_model` is a new field the current TS `ServerConfig` does not yet have; this project adds it (defaulting to `nvidia_model`).

### 3.3 Model + resolution

New `lib/server/inferenceSettings.ts`, shaped like `pricing.ts`:

- `interface InferenceSettings` — the six editable fields + `id: string | null`.
- `inferenceSettingsFromRow(row, env): InferenceSettings` — returns each field from `row`, falling back to the env `ServerConfig` value, then the code default. `row === null` → all env/code defaults.
- `getInferenceSettings(gateway, env): Promise<InferenceSettings>` → `gateway.getActiveInferenceSettings()` then `inferenceSettingsFromRow(...)`.
- `resolveEffectiveConfig(gateway, env = getConfig()): Promise<ServerConfig>` — returns a `ServerConfig` copy with the six editable fields overridden by the resolved settings, and `nvidiaApiKey` + `nvidiaBaseUrl` **always** taken from `env`. This is the single object handed to `runStorm`.

**Precedence:** DB row → env var → code default. The secret and base URL bypass the DB entirely.

### 3.4 Gateway methods

Add to the `Gateway` interface and both implementations (`lib/server/gateway.ts`):

- `getActiveInferenceSettings(): Promise<Record<string, any> | null>` — `HttpGateway`: select the active `inference_settings` row via Supabase REST; `InMemoryGateway`: return an internal dict (seeded empty → null, or from defaults).
- `updateActiveInferenceSettings(patch): Promise<Record<string, any>>` — `HttpGateway`: PATCH the active row or POST a new active row (exactly like `updateActivePricing`); `InMemoryGateway`: merge into the dict and return it.

### 3.5 Engine wiring (small)

In `lib/server/stormStore.ts` `createAndRunStorm`, replace the implicit `runStorm(input)` (which defaults `cfg` to `getConfig()`) with `runStorm(input, await resolveEffectiveConfig(gateway))`, using the gateway already in scope. Nothing else in the engine changes — `runStorm` already builds the provider/analyst per-storm from `cfg`. The existing construction-time validation in the providers still applies.

### 3.6 Admin API — `app/api/admin/inference-settings/route.ts`

Mirror `app/api/admin/pricing/route.ts` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `runRoute`, `requireAdmin(request, gateway)`):

- **GET** → `{ inference_provider, analyst_provider, nvidia_model, analyst_model, nvidia_max_tokens, analyst_max_tokens, nvidia_base_url, nvidia_api_key_configured }`. `nvidia_api_key_configured = Boolean(env.nvidiaApiKey)`; `nvidia_base_url` for display. **Never** the key.
- **POST** → validates: `inference_provider`/`analyst_provider` ∈ {`mock`,`nvidia`}; `nvidia_model` non-empty string; `analyst_model` string (may be empty → treated as unset); `nvidia_max_tokens`/`analyst_max_tokens` integers in a sane range (e.g. `[1, 200000]`). On success, `gateway.updateActiveInferenceSettings(...)` and return the same shape as GET. On bad input, `HttpError(400, ...)` (no row change).

### 3.7 Admin UI — `app/(app)/admin/page.tsx`

Add an "Inference" section next to the existing Pricing controls: selects for provider/analyst-provider, a text field (later a dropdown) for the model, an optional analyst-model field, number inputs for the token budgets, a Save button that POSTs to the route, and a small badge reading **"API key: configured"** / **"API key: not set"** driven by `nvidia_api_key_configured`. On load it GETs and pre-fills. Follows the page's existing form/fetch conventions.

### 3.8 Error handling & security

- The API key is never serialized to the client; only a boolean and the base URL are.
- Enabling `nvidia` while `nvidia_api_key_configured` is false is **allowed** (so an admin can stage config) but the badge warns; at run, `getAnalyst` still falls back to mock and the swarm surfaces a failure — unchanged behavior. The badge prevents the mistake.
- Invalid writes → 400. Missing row → env defaults. Non-admins → the `requireAdmin` rejection (401/403) used by Pricing.
- RLS keeps the table admin-only at the database layer as defense-in-depth.

## 4. Data flow

```
Admin page (Inference form)  --GET-->  /api/admin/inference-settings  --requireAdmin--> gateway.getActiveInferenceSettings()  -->  Supabase
Admin page (Save)            --POST->  /api/admin/inference-settings  --validate--> gateway.updateActiveInferenceSettings()   -->  Supabase

Create storm --> createAndRunStorm --> resolveEffectiveConfig(gateway, env)  [DB row over env; key+base_url from env]
                                    --> runStorm(input, effectiveCfg) --> getProvider(cfg)/getAnalyst(cfg)  [per storm]
```

## 5. Testing (Vitest; config file must be `.mts`)

- **Gateway (InMemory):** `getActiveInferenceSettings` returns null when unset; `updateActiveInferenceSettings` merges + persists; round-trips.
- **Resolver precedence:** row present → editable fields from row; row null → env defaults; `nvidiaApiKey`/`nvidiaBaseUrl` always from env even if a (malicious) row tries to set them (resolver must ignore any such keys).
- **`inferenceSettingsFromRow`:** null row → env/code defaults; partial row → per-field fallback; `analyst_model` empty → falls back to `nvidia_model`.
- **Admin route:** non-admin → rejected; GET shape includes `nvidia_api_key_configured` and **excludes** the key (assert no property holds the key value); POST validates enums/ranges (400 on bad); POST persists via gateway.
- **Engine:** `createAndRunStorm` passes the resolved cfg into `runStorm` — assert the provider chosen reflects the DB setting (e.g. a row with `inference_provider=mock` yields `MockPersonaProvider`).
- **Regression:** with no row, resolved cfg deep-equals `getConfig()`; existing engine/report tests stay green.

## 6. Out of scope (non-goals)

- The nemotron TS engine port and its knobs/model (sub-project 2).
- Per-user or per-storm model selection (this is admin-global).
- Making `NVIDIA_BASE_URL` editable (deliberately env-only).
- Any change to `apps/api`.
- A settings history/audit trail (single active row, like Pricing).

## 7. File-change map

- `supabase/migrations/<timestamp>_inference_settings.sql` — new table + RLS (mirror `pricing_rules`).
- `apps/web/lib/server/inferenceSettings.ts` — new: `InferenceSettings`, `inferenceSettingsFromRow`, `getInferenceSettings`, `resolveEffectiveConfig`.
- `apps/web/lib/server/gateway.ts` — add `getActiveInferenceSettings` / `updateActiveInferenceSettings` to the interface + `HttpGateway` + `InMemoryGateway`.
- `apps/web/lib/server/stormStore.ts` — resolve effective config and pass it to `runStorm`.
- `apps/web/app/api/admin/inference-settings/route.ts` — new GET/POST admin route.
- `apps/web/app/(app)/admin/page.tsx` — new "Inference" section (+ a small component if the page is large).
- `apps/web/**/__tests__` (or alongside) — Vitest coverage per §5.

## 8. Notes for implementation

- Work in the isolated worktree `C:\Users\Admin\Downloads\amd\PersonaStorm-cx` on branch `feat/runtime-inference-settings` — never the shared `PersonaStorm` checkout (a concurrent session uses it).
- The two Supabase migrations here are untestable without a live Supabase; dev/CI use the in-memory gateway (as the app already does), so all tests run against `InMemoryGateway`.
- This is `apps/web` (Node/npm/Vitest), not `apps/api` — the Vitest config must be `.mts`.

# Runtime Inference Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin change the inference/analyst provider and model at runtime from the `apps/web` admin panel — stored in Supabase, read by the TypeScript engine per-storm — with only `NVIDIA_API_KEY`/`NVIDIA_BASE_URL` remaining server env.

**Architecture:** Mirror the app's existing Pricing pattern end to end: an `inference_settings` Supabase table (single active row), `Gateway` get/update methods (interface + `InMemoryGateway` + `HttpGateway`), a typed `InferenceSettings` model with an env-defaulting `fromRow`, a `resolveEffectiveConfig(gateway, env)` that layers the DB row over the env `ServerConfig` (the key + base URL always from env), wired into `createAndRunStorm` which already passes a `cfg` into `runStorm`. A new `GET`/`POST /api/admin/inference-settings` route (behind `requireAdmin`) and an "Inference" tab on the admin page provide the editing surface.

**Tech Stack:** Next.js (App Router) + TypeScript, Supabase, Vitest (config is `vitest.config.mts`; tests are `*.test.ts` under `lib/`, globals on, jsdom).

## Global Constraints

Every task's requirements implicitly include these (verbatim from the spec):

- **Only `NVIDIA_API_KEY` and `NVIDIA_BASE_URL` stay env-only.** They are NEVER stored in the DB and NEVER sent to the browser. Every other inference knob is a DB setting.
- **The key never reaches the browser.** The admin GET returns a read-only `nvidia_api_key_configured: boolean` (from env presence) and `nvidia_base_url` — never the key value.
- **Off by default / backward compatible.** With no `inference_settings` row, `resolveEffectiveConfig` yields exactly today's env `ServerConfig`; existing behavior and tests are unchanged.
- **Admin-only.** Both GET and POST go through `requireAdmin(request, gateway)`.
- **Editable knobs (this sub-project):** `inference_provider` (`mock`|`nvidia`), `analyst_provider` (`mock`|`nvidia`), `nvidia_model`, `analyst_model`, `nvidia_max_tokens`, `analyst_max_tokens`.
- **Do NOT touch `apps/api`.** The nemotron TS engine port and its extra knobs/model are a SEPARATE later spec — out of scope.
- **Follow existing patterns:** mirror `pricing.ts` / `getActivePricing` / `app/api/admin/pricing/route.ts` / the admin page's Pricing tab. No `any` in app code; explicit types on exports; no `console.log` (use `console.warn`/`console.error` as the codebase does).
- **Commit after every task.** Commit prefixes: `feat` / `test` / `docs`. No attribution trailer.

**Environment (Windows):** the Bash tool is broken — use the **PowerShell** tool. `apps/web` uses Node/npm (healthy: node 24, npm 11). Run all commands from `apps/web`. Test a file: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run <path> ; Pop-Location`. Type-check: `npx tsc --noEmit`. git from the worktree root `C:\Users\Admin\Downloads\amd\PersonaStorm-cx`; add only the files a task names; never `git add -A`.

---

### Task 1: Settings model + `analystModel` config field

**Files:**
- Modify: `apps/web/lib/server/env.ts` (add `analystModel` to `ServerConfig` + `getConfig`)
- Create: `apps/web/lib/server/inferenceSettings.ts`
- Test: `apps/web/lib/server/inferenceSettings.test.ts`

**Interfaces:**
- Consumes: `ServerConfig`, `InferenceProvider`, `AnalystProvider` from `./env`.
- Produces: `interface InferenceSettings { inferenceProvider; analystProvider; nvidiaModel; analystModel; nvidiaMaxTokens; analystMaxTokens; id: string | null }`; `inferenceSettingsFromRow(row: Record<string, any> | null, env: ServerConfig): InferenceSettings`. Also adds `analystModel: string` to `ServerConfig`.

- [ ] **Step 1: Add `analystModel` to `ServerConfig` and `getConfig`**

In `apps/web/lib/server/env.ts`, add `analystModel: string;` to the `ServerConfig` interface (next to `nvidiaModel`), and in the `getConfig()` return object add:

```typescript
    analystModel: trimmed(process.env.ANALYST_MODEL),
```

(`trimmed(...)` is the existing helper; default is `""`.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/server/inferenceSettings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getConfig } from "./env";
import { inferenceSettingsFromRow } from "./inferenceSettings";

const env = getConfig();

describe("inferenceSettingsFromRow", () => {
  it("returns env/code defaults when the row is null", () => {
    const s = inferenceSettingsFromRow(null, env);
    expect(s.inferenceProvider).toBe(env.inferenceProvider);
    expect(s.analystProvider).toBe(env.analystProvider);
    expect(s.nvidiaModel).toBe(env.nvidiaModel);
    expect(s.nvidiaMaxTokens).toBe(env.nvidiaMaxTokens);
    expect(s.analystMaxTokens).toBe(env.analystMaxTokens);
    expect(s.id).toBeNull();
  });

  it("takes editable fields from the row when present", () => {
    const s = inferenceSettingsFromRow(
      { id: "row1", inference_provider: "nvidia", analyst_provider: "nvidia", nvidia_model: "some/model", nvidia_max_tokens: 8192, analyst_max_tokens: 8192 },
      env,
    );
    expect(s.inferenceProvider).toBe("nvidia");
    expect(s.analystProvider).toBe("nvidia");
    expect(s.nvidiaModel).toBe("some/model");
    expect(s.nvidiaMaxTokens).toBe(8192);
    expect(s.analystMaxTokens).toBe(8192);
    expect(s.id).toBe("row1");
  });

  it("coerces an invalid provider back to the env default", () => {
    const s = inferenceSettingsFromRow({ inference_provider: "bogus" }, env);
    expect(s.inferenceProvider).toBe(env.inferenceProvider);
  });

  it("falls back analyst_model to nvidia_model when unset", () => {
    const s = inferenceSettingsFromRow({ nvidia_model: "m/x", analyst_model: "" }, env);
    expect(s.analystModel).toBe("m/x");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/inferenceSettings.test.ts ; Pop-Location`
Expected: FAIL — cannot find module `./inferenceSettings`.

- [ ] **Step 4: Create the model**

Create `apps/web/lib/server/inferenceSettings.ts`:

```typescript
import "./only";

import { getConfig, type AnalystProvider, type InferenceProvider, type ServerConfig } from "./env";

export interface InferenceSettings {
  inferenceProvider: InferenceProvider;
  analystProvider: AnalystProvider;
  nvidiaModel: string;
  analystModel: string;
  nvidiaMaxTokens: number;
  analystMaxTokens: number;
  id: string | null;
}

/** Coerce an untrusted value to a valid provider, else the given fallback. */
function coerceProvider(v: unknown, fallback: "mock" | "nvidia"): "mock" | "nvidia" {
  return v === "mock" || v === "nvidia" ? v : fallback;
}

function posInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Build typed settings from a DB row, defaulting each field to the env config.
 * `row === null` (no active row) yields exactly the env-driven config.
 */
export function inferenceSettingsFromRow(
  row: Record<string, any> | null,
  env: ServerConfig,
): InferenceSettings {
  const r = row ?? {};
  const nvidiaModel =
    typeof r.nvidia_model === "string" && r.nvidia_model.trim() ? r.nvidia_model.trim() : env.nvidiaModel;
  const analystModel =
    typeof r.analyst_model === "string" && r.analyst_model.trim()
      ? r.analyst_model.trim()
      : env.analystModel || nvidiaModel;
  return {
    inferenceProvider: coerceProvider(r.inference_provider, env.inferenceProvider),
    analystProvider: coerceProvider(r.analyst_provider, env.analystProvider),
    nvidiaModel,
    analystModel,
    nvidiaMaxTokens: posInt(r.nvidia_max_tokens, env.nvidiaMaxTokens),
    analystMaxTokens: posInt(r.analyst_max_tokens, env.analystMaxTokens),
    id: r.id ?? null,
  };
}

export async function getInferenceSettings(
  gateway: { getActiveInferenceSettings(): Promise<Record<string, any> | null> },
  env: ServerConfig = getConfig(),
): Promise<InferenceSettings> {
  const row = await gateway.getActiveInferenceSettings();
  return inferenceSettingsFromRow(row, env);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/inferenceSettings.test.ts ; Pop-Location`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add apps/web/lib/server/env.ts apps/web/lib/server/inferenceSettings.ts apps/web/lib/server/inferenceSettings.test.ts
git commit -m "feat: inference settings model + analystModel config field"
```

---

### Task 2: Gateway `inference_settings` methods

**Files:**
- Modify: `apps/web/lib/server/gateway.ts` (interface + `InMemoryGateway` + `HttpGateway`)
- Test: `apps/web/lib/server/gateway.test.ts`

**Interfaces:**
- Produces on `Gateway`: `getActiveInferenceSettings(): Promise<Row | null>` and `updateActiveInferenceSettings(input: InferenceSettingsPatch): Promise<Row>` where `InferenceSettingsPatch = { inference_provider: string; analyst_provider: string; nvidia_model: string; analyst_model: string; nvidia_max_tokens: number; analyst_max_tokens: number }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/server/gateway.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildGateway } from "./gateway";
import { getConfig } from "./env";

// With no Supabase env vars, buildGateway() returns the in-memory gateway.
const PATCH = {
  inference_provider: "nvidia",
  analyst_provider: "nvidia",
  nvidia_model: "some/model",
  analyst_model: "some/analyst",
  nvidia_max_tokens: 8192,
  analyst_max_tokens: 8192,
};

describe("gateway inference settings (in-memory)", () => {
  it("returns null before anything is saved", async () => {
    const gw = buildGateway(getConfig());
    expect(await gw.getActiveInferenceSettings()).toBeNull();
  });

  it("persists and round-trips an update", async () => {
    const gw = buildGateway(getConfig());
    const saved = await gw.updateActiveInferenceSettings(PATCH);
    expect(saved.inference_provider).toBe("nvidia");
    expect(saved.nvidia_model).toBe("some/model");
    const read = await gw.getActiveInferenceSettings();
    expect(read?.nvidia_model).toBe("some/model");
    expect(read?.analyst_max_tokens).toBe(8192);
    expect(read?.id).toBeTruthy();
  });
});
```

Note: `buildGateway` returns a process-level in-memory singleton, so the second test sees the first's writes — the assertions above hold regardless of order.

- [ ] **Step 2: Run test to verify it fails**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/gateway.test.ts ; Pop-Location`
Expected: FAIL — `getActiveInferenceSettings` is not a function.

- [ ] **Step 3: Add the methods to the `Gateway` interface**

In `apps/web/lib/server/gateway.ts`, add to the `Gateway` interface (after the `updateActivePricing` line):

```typescript
  getActiveInferenceSettings(): Promise<Row | null>;
  updateActiveInferenceSettings(input: {
    inference_provider: string;
    analyst_provider: string;
    nvidia_model: string;
    analyst_model: string;
    nvidia_max_tokens: number;
    analyst_max_tokens: number;
  }): Promise<Row>;
```

- [ ] **Step 4: Implement in `InMemoryGateway`**

Add a field next to `private pricing: Row = {...}`:

```typescript
  private inferenceSettings: Row | null = null;
```

And add these methods (after `updateActivePricing`):

```typescript
  async getActiveInferenceSettings(): Promise<Row | null> {
    return this.inferenceSettings ? { ...this.inferenceSettings } : null;
  }

  async updateActiveInferenceSettings(input: {
    inference_provider: string; analyst_provider: string; nvidia_model: string;
    analyst_model: string; nvidia_max_tokens: number; analyst_max_tokens: number;
  }): Promise<Row> {
    const id = this.inferenceSettings?.id ?? cryptoRandom();
    this.inferenceSettings = { ...(this.inferenceSettings ?? {}), id, is_active: true, ...input, updated_at: nowIso() };
    return { ...this.inferenceSettings };
  }
```

- [ ] **Step 5: Implement in `HttpGateway`**

Add (after `updateActivePricing`), mirroring the pricing methods exactly:

```typescript
  async getActiveInferenceSettings(): Promise<Row | null> {
    const rows = await this.admin.get("inference_settings", { is_active: "eq.true", select: "*", order: "updated_at.desc", limit: "1" });
    return rows[0] ?? null;
  }

  async updateActiveInferenceSettings(input: {
    inference_provider: string; analyst_provider: string; nvidia_model: string;
    analyst_model: string; nvidia_max_tokens: number; analyst_max_tokens: number;
  }): Promise<Row> {
    const current = await this.getActiveInferenceSettings();
    if (current) {
      const rows = await this.admin.mutate("PATCH", "inference_settings", { params: { id: `eq.${current.id}` }, json: input });
      return rows[0] ?? { ...input, is_active: true };
    }
    const rows = await this.admin.mutate("POST", "inference_settings", { json: { ...input, is_active: true } });
    return rows[0] ?? { ...input, is_active: true };
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/gateway.test.ts ; Pop-Location`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add apps/web/lib/server/gateway.ts apps/web/lib/server/gateway.test.ts
git commit -m "feat: gateway getActiveInferenceSettings/updateActiveInferenceSettings"
```

---

### Task 3: Resolver + engine wiring + analyst model

**Files:**
- Modify: `apps/web/lib/server/inferenceSettings.ts` (add `resolveEffectiveConfig`)
- Modify: `apps/web/lib/server/stormStore.ts` (resolve + pass into `runStorm`)
- Modify: `apps/web/lib/server/engine/analyst/index.ts` (use `analystModel`)
- Test: `apps/web/lib/server/inferenceSettings.test.ts` (extend)

**Interfaces:**
- Consumes: `getInferenceSettings` (Task 1), `Gateway.getActiveInferenceSettings` (Task 2).
- Produces: `resolveEffectiveConfig(gateway: Gateway, env?: ServerConfig): Promise<ServerConfig>` — a `ServerConfig` with the six editable fields from the resolved settings and `nvidiaApiKey`/`nvidiaBaseUrl` always from `env`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/server/inferenceSettings.test.ts`:

```typescript
import { resolveEffectiveConfig } from "./inferenceSettings";
import { buildGateway } from "./gateway";

describe("resolveEffectiveConfig", () => {
  it("with no row equals the env config for the editable fields", async () => {
    const gw = { async getActiveInferenceSettings() { return null; } } as any;
    const eff = await resolveEffectiveConfig(gw, env);
    expect(eff.inferenceProvider).toBe(env.inferenceProvider);
    expect(eff.nvidiaModel).toBe(env.nvidiaModel);
  });

  it("overrides editable fields from the row but keeps key + base_url from env", async () => {
    const gw = {
      async getActiveInferenceSettings() {
        return {
          inference_provider: "nvidia", analyst_provider: "nvidia", nvidia_model: "x/y",
          analyst_model: "a/b", nvidia_max_tokens: 8192, analyst_max_tokens: 8192,
          // a malicious row trying to smuggle secrets must be ignored:
          nvidia_api_key: "nvapi-HACK", nvidia_base_url: "https://evil.example",
        };
      },
    } as any;
    const eff = await resolveEffectiveConfig(gw, env);
    expect(eff.inferenceProvider).toBe("nvidia");
    expect(eff.nvidiaModel).toBe("x/y");
    expect(eff.analystModel).toBe("a/b");
    expect(eff.nvidiaApiKey).toBe(env.nvidiaApiKey);       // NOT the row's key
    expect(eff.nvidiaBaseUrl).toBe(env.nvidiaBaseUrl);     // NOT the row's url
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/inferenceSettings.test.ts ; Pop-Location`
Expected: FAIL — `resolveEffectiveConfig` is not exported.

- [ ] **Step 3: Add `resolveEffectiveConfig`**

Append to `apps/web/lib/server/inferenceSettings.ts` (and add `import type { Gateway } from "./gateway";` at the top):

```typescript
/**
 * Effective server config = DB settings layered over env, per-storm. The API
 * key and base URL are ALWAYS taken from env — never from the DB row — so a
 * settings row can never repoint the endpoint or smuggle a key.
 */
export async function resolveEffectiveConfig(
  gateway: Gateway,
  env: ServerConfig = getConfig(),
): Promise<ServerConfig> {
  const s = await getInferenceSettings(gateway, env);
  return {
    ...env,
    inferenceProvider: s.inferenceProvider,
    analystProvider: s.analystProvider,
    nvidiaModel: s.nvidiaModel,
    analystModel: s.analystModel,
    nvidiaMaxTokens: s.nvidiaMaxTokens,
    analystMaxTokens: s.analystMaxTokens,
    // nvidiaApiKey + nvidiaBaseUrl deliberately left as `...env`.
  };
}
```

Update `getInferenceSettings`'s first parameter type from the inline shape to `Gateway` for consistency (it already only calls `getActiveInferenceSettings`).

- [ ] **Step 4: Wire `createAndRunStorm` to use the resolved config**

In `apps/web/lib/server/stormStore.ts`, add the import:

```typescript
import { resolveEffectiveConfig } from "./inferenceSettings";
```

Then in `createAndRunStorm`, replace the `runStorm(...)` call's config argument. Change:

```typescript
    const result = await runStorm(
      { /* ...input fields... */ },
      cfg,
    );
```

to resolve first and pass the effective config:

```typescript
    const effectiveCfg = await resolveEffectiveConfig(gateway, cfg);
    const result = await runStorm(
      { /* ...input fields unchanged... */ },
      effectiveCfg,
    );
```

(Keep the input object exactly as-is; only the second argument changes from `cfg` to `effectiveCfg`.)

- [ ] **Step 5: Use `analystModel` in `getAnalyst`**

In `apps/web/lib/server/engine/analyst/index.ts`, change the `NvidiaAnalyst` construction (currently `new NvidiaAnalyst(cfg.nvidiaApiKey, cfg.nvidiaBaseUrl, cfg.nvidiaModel, cfg.analystMaxTokens)`) to:

```typescript
    return new NvidiaAnalyst(cfg.nvidiaApiKey, cfg.nvidiaBaseUrl, cfg.analystModel || cfg.nvidiaModel, cfg.analystMaxTokens);
```

- [ ] **Step 6: Run tests + type-check to verify**

Run:
```
Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"
npx vitest run lib/server/inferenceSettings.test.ts
npx tsc --noEmit
Pop-Location
```
Expected: vitest PASS (6 tests total in the file); `tsc` reports no errors (confirms the `stormStore.ts`/`analyst` wiring type-checks).

- [ ] **Step 7: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add apps/web/lib/server/inferenceSettings.ts apps/web/lib/server/inferenceSettings.test.ts apps/web/lib/server/stormStore.ts apps/web/lib/server/engine/analyst/index.ts
git commit -m "feat: resolve effective inference config per-storm; analyst honors analystModel"
```

---

### Task 4: Admin route + validation/view helpers

**Files:**
- Modify: `apps/web/lib/server/inferenceSettings.ts` (add `validateInferenceSettingsBody`, `toInferenceSettingsView`)
- Create: `apps/web/app/api/admin/inference-settings/route.ts`
- Test: `apps/web/lib/server/inferenceSettings.test.ts` (extend)

**Interfaces:**
- Consumes: `HttpError` from `./errors`, `InferenceSettings` (Task 1), `ServerConfig`.
- Produces: `validateInferenceSettingsBody(body: unknown): InferenceSettingsInput` (throws `HttpError(400)` on bad input) and `toInferenceSettingsView(s: InferenceSettings, env: ServerConfig): InferenceSettingsView` (adds `nvidia_base_url` + `nvidia_api_key_configured`, never the key).

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/server/inferenceSettings.test.ts`:

```typescript
import { validateInferenceSettingsBody, toInferenceSettingsView, inferenceSettingsFromRow as fromRow } from "./inferenceSettings";

describe("validateInferenceSettingsBody", () => {
  const ok = {
    inference_provider: "nvidia", analyst_provider: "mock", nvidia_model: "x/y",
    analyst_model: "", nvidia_max_tokens: 8192, analyst_max_tokens: 8192,
  };
  it("accepts a valid body", () => {
    expect(validateInferenceSettingsBody(ok).nvidia_model).toBe("x/y");
  });
  it("rejects a bad provider", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, inference_provider: "bogus" })).toThrow();
  });
  it("rejects an empty model", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, nvidia_model: "  " })).toThrow();
  });
  it("rejects non-integer / out-of-range tokens", () => {
    expect(() => validateInferenceSettingsBody({ ...ok, nvidia_max_tokens: 0 })).toThrow();
    expect(() => validateInferenceSettingsBody({ ...ok, analyst_max_tokens: 9_999_999 })).toThrow();
  });
});

describe("toInferenceSettingsView", () => {
  it("exposes the key-configured boolean but NEVER the key", () => {
    const settings = fromRow(null, env);
    const view = toInferenceSettingsView(settings, { ...env, nvidiaApiKey: "nvapi-SECRET", nvidiaBaseUrl: "https://x/v1" });
    expect(view.nvidia_api_key_configured).toBe(true);
    expect(view.nvidia_base_url).toBe("https://x/v1");
    expect(JSON.stringify(view)).not.toContain("nvapi-SECRET");
  });
  it("reports not-configured when the env key is empty", () => {
    const view = toInferenceSettingsView(fromRow(null, env), { ...env, nvidiaApiKey: "" });
    expect(view.nvidia_api_key_configured).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/inferenceSettings.test.ts ; Pop-Location`
Expected: FAIL — `validateInferenceSettingsBody`/`toInferenceSettingsView` not exported.

- [ ] **Step 3: Add the helpers**

Append to `apps/web/lib/server/inferenceSettings.ts` (add `import { HttpError } from "./errors";` at the top):

```typescript
const MIN_TOKENS = 1;
const MAX_TOKENS = 200_000;

export interface InferenceSettingsInput {
  inference_provider: "mock" | "nvidia";
  analyst_provider: "mock" | "nvidia";
  nvidia_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
}

function providerField(v: unknown, label: string): "mock" | "nvidia" {
  if (v === "mock" || v === "nvidia") return v;
  throw new HttpError(400, `${label} must be 'mock' or 'nvidia'.`);
}

function tokensField(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < MIN_TOKENS || n > MAX_TOKENS) {
    throw new HttpError(400, `${label} must be an integer in [${MIN_TOKENS}, ${MAX_TOKENS}].`);
  }
  return n;
}

export function validateInferenceSettingsBody(body: unknown): InferenceSettingsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const nvidia_model =
    typeof b.nvidia_model === "string" && b.nvidia_model.trim() ? b.nvidia_model.trim().slice(0, 200) : "";
  if (!nvidia_model) throw new HttpError(400, "nvidia_model must be a non-empty string.");
  const analyst_model = typeof b.analyst_model === "string" ? b.analyst_model.trim().slice(0, 200) : "";
  return {
    inference_provider: providerField(b.inference_provider, "inference_provider"),
    analyst_provider: providerField(b.analyst_provider, "analyst_provider"),
    nvidia_model,
    analyst_model,
    nvidia_max_tokens: tokensField(b.nvidia_max_tokens, "nvidia_max_tokens"),
    analyst_max_tokens: tokensField(b.analyst_max_tokens, "analyst_max_tokens"),
  };
}

export interface InferenceSettingsView extends InferenceSettingsInput {
  nvidia_base_url: string;
  nvidia_api_key_configured: boolean;
}

/** Client-facing view. NEVER includes the API key — only a boolean + base URL. */
export function toInferenceSettingsView(s: InferenceSettings, env: ServerConfig): InferenceSettingsView {
  return {
    inference_provider: s.inferenceProvider,
    analyst_provider: s.analystProvider,
    nvidia_model: s.nvidiaModel,
    analyst_model: s.analystModel,
    nvidia_max_tokens: s.nvidiaMaxTokens,
    analyst_max_tokens: s.analystMaxTokens,
    nvidia_base_url: env.nvidiaBaseUrl,
    nvidia_api_key_configured: Boolean(env.nvidiaApiKey),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run lib/server/inferenceSettings.test.ts ; Pop-Location`
Expected: PASS (all inferenceSettings tests).

- [ ] **Step 5: Create the route handler**

Create `apps/web/app/api/admin/inference-settings/route.ts`, mirroring `app/api/admin/pricing/route.ts`:

```typescript
import { requireAdmin } from "@/lib/server/auth";
import { buildGateway } from "@/lib/server/gateway";
import { getConfig } from "@/lib/server/env";
import { jsonResponse, readJson, runRoute } from "@/lib/server/http";
import {
  getInferenceSettings,
  toInferenceSettingsView,
  validateInferenceSettingsBody,
} from "@/lib/server/inferenceSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const env = getConfig();
    const settings = await getInferenceSettings(gateway, env);
    return jsonResponse(toInferenceSettingsView(settings, env));
  });
}

export async function POST(request: Request) {
  return runRoute(async () => {
    const gateway = buildGateway();
    await requireAdmin(request, gateway);
    const env = getConfig();
    const input = validateInferenceSettingsBody(await readJson(request));
    await gateway.updateActiveInferenceSettings(input);
    const settings = await getInferenceSettings(gateway, env);
    return jsonResponse(toInferenceSettingsView(settings, env));
  });
}
```

- [ ] **Step 6: Type-check the route**

Run: `Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx tsc --noEmit ; Pop-Location`
Expected: no errors (confirms imports/signatures match `pricing/route.ts`'s helpers).

- [ ] **Step 7: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add apps/web/lib/server/inferenceSettings.ts apps/web/lib/server/inferenceSettings.test.ts apps/web/app/api/admin/inference-settings/route.ts
git commit -m "feat: admin inference-settings route + validation/view helpers"
```

---

### Task 5: Admin UI — API client + type + admin page tab

**Files:**
- Modify: `apps/web/lib/api.ts` (add `adminGetInferenceSettings` / `adminUpdateInferenceSettings`)
- Modify: `apps/web/lib/types.ts` (add `InferenceSettings` type)
- Modify: `apps/web/app/(app)/admin/page.tsx` (add an "Inference" tab + form)

**Interfaces:**
- Consumes: the `GET`/`POST /api/admin/inference-settings` route (Task 4).
- Produces: `adminGetInferenceSettings(): Promise<InferenceSettings>` and `adminUpdateInferenceSettings(body): Promise<InferenceSettings>` in `lib/api.ts`; an `InferenceSettings` type in `lib/types.ts`.

This is UI wiring; verification is `tsc` + `npm run build` (the app has no route/page unit tests — the logic is already covered in Tasks 1–4).

- [ ] **Step 1: Add the type**

In `apps/web/lib/types.ts`, add:

```typescript
export interface InferenceSettings {
  inference_provider: "mock" | "nvidia";
  analyst_provider: "mock" | "nvidia";
  nvidia_model: string;
  analyst_model: string;
  nvidia_max_tokens: number;
  analyst_max_tokens: number;
  nvidia_base_url: string;
  nvidia_api_key_configured: boolean;
}
```

- [ ] **Step 2: Add the API client functions**

Open `apps/web/lib/api.ts`, find the existing `adminGetPricing` and `adminUpdatePricing` functions, and add two mirroring functions **using the same request/auth wrapper they use** (do not invent a new fetch path — copy their exact style, changing only the URL, body, and return type). They must call `GET`/`POST /api/admin/inference-settings` and return `InferenceSettings` (import the type from `./types`). Example shape (adapt to the file's actual wrapper):

```typescript
export async function adminGetInferenceSettings(): Promise<InferenceSettings> {
  // mirror adminGetPricing exactly, GET "/api/admin/inference-settings"
}

export async function adminUpdateInferenceSettings(body: {
  inference_provider: string; analyst_provider: string; nvidia_model: string;
  analyst_model: string; nvidia_max_tokens: number; analyst_max_tokens: number;
}): Promise<InferenceSettings> {
  // mirror adminUpdatePricing exactly, POST "/api/admin/inference-settings" with `body`
}
```

- [ ] **Step 3: Add the "Inference" tab to the admin page**

In `apps/web/app/(app)/admin/page.tsx`:
1. Add `"inference"` to the `Tab` type and the `TABS` array (label `"Inference"`), and to `AdminErrorKind`/`ERROR_TITLES` (title `"Couldn't load inference settings"`).
2. Add state: `const [inference, setInference] = useState<InferenceSettings | null>(null);` (import the type from `@/lib/types`, and the two api functions from `@/lib/api`).
3. In the existing `useEffect(..., [isAdmin, loadUsers])`, also fetch it: `adminGetInferenceSettings().then(setInference).catch((e) => setError({ kind: "inference", message: e instanceof Error ? e.message : "Failed to load inference settings." }));`
4. Render an inference tab panel using the same `Card`/`CardHeader`/`Label`/`Input`/`Button` components the Pricing tab uses. Provide: two selects (`inference_provider`, `analyst_provider` → `mock`|`nvidia`), text inputs for `nvidia_model` and `analyst_model`, number inputs for `nvidia_max_tokens`/`analyst_max_tokens`, a `StatusBadge` reading **"API key: configured"** (green) / **"API key: not set"** (warn) from `inference.nvidia_api_key_configured`, a read-only display of `inference.nvidia_base_url`, and a **Save** button that calls `adminUpdateInferenceSettings(...)` with the edited values and updates state from the response. Mirror the Pricing tab's save/error handling (`setError({ kind: "action", ... })` on failure).

Keep the panel's markup and styling consistent with the existing Pricing tab in this same file.

- [ ] **Step 4: Verify type-check + build**

Run:
```
Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"
npx tsc --noEmit
npm run build
Pop-Location
```
Expected: `tsc` clean; `npm run build` succeeds (Next.js compiles the new route + page).

- [ ] **Step 5: Verify in the browser (preview)**

Start the app and confirm the Inference tab loads current settings, saving persists (reload shows the new values), and the "API key" badge reflects env. Use the preview tooling; do not ask the user to check manually.

- [ ] **Step 6: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add apps/web/lib/api.ts apps/web/lib/types.ts "apps/web/app/(app)/admin/page.tsx"
git commit -m "feat: admin panel Inference settings tab"
```

---

### Task 6: Supabase migration — `inference_settings` table

**Files:**
- Create: `supabase/migrations/<timestamp>_inference_settings.sql`

Pick `<timestamp>` greater than the latest existing migration (e.g. `20260709120000`). This has no automated test (no live Supabase in dev/CI — the suite runs against `InMemoryGateway`); verification is SQL review against the existing `pricing_rules` migrations.

- [ ] **Step 1: Confirm the pattern to mirror**

Read `supabase/migrations/20260704090000_saas_core.sql` (the `pricing_rules` table + its RLS) and `supabase/migrations/20260705150000_harden_is_admin.sql` (the `public.is_admin()` helper) and `supabase/migrations/20260705160000_pricing_rules_select_active.sql`. Match their conventions (schema-qualified names, `is_admin()` policy, single-active-row mechanism).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<timestamp>_inference_settings.sql`:

```sql
-- Runtime-editable inference settings (single active row), admin-edited via the
-- admin panel and read by the engine per-storm. Mirrors pricing_rules.
-- SECURITY: the API key and base URL are NEVER stored here — they stay in env.

create table if not exists public.inference_settings (
  id                 uuid primary key default gen_random_uuid(),
  is_active          boolean not null default true,
  inference_provider text not null default 'mock',
  analyst_provider   text not null default 'mock',
  nvidia_model       text not null default 'z-ai/glm-5.2',
  analyst_model      text not null default '',
  nvidia_max_tokens  integer not null default 2048,
  analyst_max_tokens integer not null default 4096,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint inference_provider_valid check (inference_provider in ('mock', 'nvidia')),
  constraint analyst_provider_valid   check (analyst_provider in ('mock', 'nvidia'))
);

-- At most one active row.
create unique index if not exists inference_settings_single_active
  on public.inference_settings (is_active) where is_active;

alter table public.inference_settings enable row level security;

-- Admin-only read + write. The server uses the service role, which bypasses RLS;
-- this policy governs any direct (anon/authenticated) access.
drop policy if exists inference_settings_admin_all on public.inference_settings;
create policy inference_settings_admin_all on public.inference_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

If `pricing_rules` enforces its single-active-row differently (e.g. a different index predicate) or `is_admin()` has a different signature, match that instead — the goal is parity with `pricing_rules`.

- [ ] **Step 3: Verify (review + suite unaffected)**

The migration does not affect the in-memory test suite. Confirm the whole suite is still green:
```
Push-Location "C:\Users\Admin\Downloads\amd\PersonaStorm-cx\apps\web"; npx vitest run ; Pop-Location
```
Expected: all tests pass (Tasks 1–4's tests + all pre-existing tests). Confirm the SQL matches the `pricing_rules` conventions by inspection.

- [ ] **Step 4: Commit**

```bash
git -C "C:\Users\Admin\Downloads\amd\PersonaStorm-cx" add supabase/migrations/
git commit -m "feat: inference_settings Supabase migration"
```

---

## Self-Review

**1. Spec coverage:**

- §3.1 storage table + RLS → Task 6; §3.4 gateway methods → Task 2. ✓
- §3.2 editable vs env-only (key/base_url never in DB/browser) → enforced in Task 3 (resolver keeps key/base_url from env, tested) + Task 4 (view excludes key, tested). ✓
- §3.3 model + `fromRow` defaults + resolution precedence → Tasks 1 & 3. ✓
- §3.5 engine wiring (resolve + pass to `runStorm`; `analystModel`) → Task 3. ✓
- §3.6 admin route GET/POST behind `requireAdmin`, `nvidia_api_key_configured` → Task 4. ✓
- §3.7 admin UI section + badge → Task 5. ✓
- §3.8 security/errors (key never serialized, bad writes 400, missing row → env defaults) → Tasks 1/3/4 (tested). ✓
- §5 testing (gateway, resolver precedence, fromRow, route helpers, key-never-serialized) → Tasks 1–4. ✓ (The `createAndRunStorm` wiring is covered by the resolver tests + `tsc`; a full end-to-end storm test is intentionally omitted as heavy and low-marginal-value — the seam is a single argument change.)

**2. Placeholder scan:** No "TBD/handle appropriately". The two intentionally-parameterized spots — the migration `<timestamp>` and "mirror `adminGetPricing`'s wrapper" — each carry an exact instruction and the concrete surrounding code. The admin-page tab (Task 5 Step 3) is specified field-by-field with the exact components and endpoints; it references the in-file Pricing tab for styling parity, which is following an existing pattern, not a deferred detail.

**3. Type consistency:** `InferenceSettings` (camelCase engine type, Task 1) vs `InferenceSettingsInput`/`InferenceSettingsView`/the `lib/types.ts` `InferenceSettings` (snake_case client/API shapes) are distinct by design (DB/HTTP is snake_case, config is camelCase) — the boundary is `toInferenceSettingsView`/`validateInferenceSettingsBody` in Task 4 and the gateway patch in Task 2, and the field names line up across them (`inference_provider`↔`inferenceProvider`, etc.). `resolveEffectiveConfig(gateway, env)` and `getInferenceSettings(gateway, env)` signatures match their call sites in Tasks 3–4. `updateActiveInferenceSettings`'s patch shape matches `InferenceSettingsInput` field-for-field.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task with a spec+quality review between each (uses superpowers:subagent-driven-development).
2. **Inline** — execute tasks in this session with checkpoints (uses superpowers:executing-plans).

Which approach?

# Deployment: GitHub Actions → Supabase + Vercel

This repo now includes `.github/workflows/deploy.yml` to run CI and deploy from GitHub Actions.

The workflow is designed for the current monorepo layout:

- `apps/web` → Next.js frontend deployed to Vercel
- `apps/api` → FastAPI backend tested in CI, but **not deployed by this workflow**
- `supabase/migrations/*.sql` → Supabase database migrations pushed with the Supabase CLI, when migration files exist

> Important: the production Vercel frontend still needs `BACKEND_API_BASE` (a
> **server-side**, non-`NEXT_PUBLIC_` variable) set to a deployed FastAPI
> backend URL. Deploy the API separately to Render, Railway, Fly.io, a VPS, or
> another container host, then set that URL in Vercel. See "Frontend API
> routing" below — the browser never calls the backend directly, so this can
> be set at any time without a frontend rebuild.

---

## Frontend API routing: same-origin proxy (BFF), not a direct browser call

The browser **never** calls the FastAPI backend directly. Every frontend data
call goes to a same-origin Next.js route:

```text
Browser
  → GET/POST /api/backend/<path>              (same origin — no CORS, no exposed backend URL)
  → apps/web/app/api/backend/[...path]/route.ts  (runs on the Next.js SERVER)
  → ${BACKEND_API_BASE}/api/<path>               (the real FastAPI backend)
```

Why: an earlier version read `NEXT_PUBLIC_API_BASE` in the browser, which
meant (a) the backend's real address was baked into the public bundle, (b) a
missing value broke the entire frontend build/UX with a raw "Failed to
fetch — is the API running on port 8000?", and (c) you couldn't deploy the
frontend before knowing the backend's URL. The proxy fixes all three:

- `BACKEND_API_BASE` is read **only** in `route.ts`, server-side, at request
  time — never inlined into the browser bundle, never `NEXT_PUBLIC_*`.
- **Local dev**: if `BACKEND_API_BASE` is unset, the proxy falls back to
  `http://localhost:8000` (matching `uvicorn app.main:app --reload --port
  8000`), so `npm run dev` + a local FastAPI just works with zero config.
- **Production**: if `BACKEND_API_BASE` is missing, the app does **not**
  crash — login, signup, and the dashboard shell (all Supabase-backed) keep
  working. Only storm/billing/admin calls hit the proxy's `/api/backend/*`
  route, which returns a clear `503` JSON body: `{"detail": "PersonaStorm
  backend is not configured. Set BACKEND_API_BASE in Vercel or deploy the
  FastAPI backend."}` — never the old raw fetch error.
- The live storm stream (SSE) is proxied too, at `/api/backend/storm/{id}/stream`
  — the route streams the backend's response through unbuffered. See
  "Streaming (SSE) limitation" below for the one real tradeoff this implies.
- Because the backend is now called server-to-server (Next.js server →
  FastAPI), **CORS no longer applies** to the official frontend at all — it's
  same-origin all the way from the browser's point of view. `CORS_ORIGINS` on
  the backend still matters if you call the API directly (curl, another
  client, the `/docs` page), just not for this frontend anymore.

---

## SaaS layer: Supabase Auth, wallets, pricing & admin

PersonaStorm is a dashboard SaaS: users sign up, get a credit wallet, pay
credits per storm run, and admins manage users/wallets/pricing. This is backed
by Supabase Auth + Postgres.

### Data model (see `supabase/migrations/`)

| Table | Purpose |
|---|---|
| `profiles` | one row per auth user; `role` is `user` or `admin` |
| `wallets` | credit balance + lifetime spent, one per user |
| `wallet_transactions` | immutable audit log; every balance change writes a row |
| `storm_runs` | ownership + billing metadata per run (+ optional durable `report_json`) |
| `pricing_rules` | the credit pricing formula, editable by admins |

Key database objects: `is_admin()`, an `updated_at` trigger, a `handle_new_user`
trigger that provisions `profiles` + `wallets` + **100 starter credits** on
signup, and `adjust_wallet_balance(...)` — the single atomic, row-locking entry
point for any balance change. **`EXECUTE` on `adjust_wallet_balance` is revoked
from `anon`/`authenticated`** so only the backend (service role) can move
credits; a browser client cannot credit itself.

Pricing formula (default rule 10 / 5 / 5, analyst report included):

```text
total_credits = base_run_credits
              + ceil(persona_count / 100) * credits_per_100_personas
              + analyst_report_credits
# 100 personas = 20, 250 = 30, 500 = 40, 1000 = 65
```

### One-time Supabase setup

1. Create a Supabase project.
2. Apply the migrations — either push from GitHub Actions (below) or locally:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Create the first admin (see "How to create the first admin" below).

### Backend environment variables (server-side only)

Set these where the FastAPI backend runs (Render/Railway/Fly.io/VPS):

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **secret** — bypasses RLS; server-side only, never in frontend env |
| `SUPABASE_JWT_SECRET` | yes | **secret** — HS256 secret to verify access tokens (Settings → API → JWT Secret) |
| `API_ENV` | recommended | set to `prod` so the API refuses unverified tokens |
| `CORS_ORIGINS` | yes | include your Vercel domain |

> If the Supabase backend variables are unset, the API falls back to an
> in-memory gateway and dev auth so it still boots and `pytest` runs — but
> real login, billing, and persistence require them in production.

### Frontend (Vercel) environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `BACKEND_API_BASE` | yes (production) | **Server-side only** — deployed FastAPI backend origin. Read by the `/api/backend` proxy route; NOT prefixed with `NEXT_PUBLIC_`, so it never reaches the browser. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (browser auth client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase **anon** key (never the service role key) |

### How to create the first admin

After migrations are applied, run the bootstrap script against your project
using the **service role** key (server-side, in a trusted shell):

```bash
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service role key>
export ADMIN_EMAIL=you@example.com
export ADMIN_PASSWORD=<strong password>
export ADMIN_FULL_NAME="PersonaStorm Admin"
python scripts/create_admin_user.py
```

It creates the auth user (email pre-confirmed), sets `role = admin`, ensures a
wallet, and grants 10000 credits. It is idempotent and never prints secrets.

---

## What runs automatically

| Trigger | CI (API tests + web build) | Supabase migrations | Vercel |
|---|---|---|---|
| **Pull request** into `main` | ✅ | ❌ never | ✅ **Preview** deploy |
| **Push** to `main` | ✅ | ✅ if `supabase/migrations/*.sql` exists | ✅ **Production** deploy |
| **Manual dispatch** (`workflow_dispatch`) | ✅ | ✅ if `supabase/migrations/*.sql` exists | ✅ **Production** deploy |

### Pull request = CI + Vercel Preview

Every PR into `main` runs:

1. API tests (`apps/api`)
2. Next.js build (`apps/web`)
3. A Vercel **Preview** deployment (`vercel deploy`, no `--prod`) — reviewers get a live preview link in the job's step summary.

**Supabase migrations are intentionally skipped on PRs** to avoid mutating the
production database from unmerged code. A PR is proposed, not-yet-reviewed
code — letting it run `supabase db push` against the shared production
database would mean any branch (even before review) could alter production
schema. Migrations only ship once that code has actually landed on `main`, or
via an explicit manual dispatch.

### Push to `main` = CI + Supabase migrations + Vercel Production

1. API tests
2. Next.js build
3. Supabase migrations deploy (`supabase-deploy`), if `supabase/migrations/*.sql` exists
4. Vercel **Production** deployment (`vercel-production-deploy`)

The Supabase job runs before the production Vercel deploy (`vercel-production-deploy` `needs: [..., supabase-deploy]`) so the frontend goes live only after the database it depends on has already been migrated.

### Manual dispatch = Supabase migrations + Vercel Production

Running the workflow manually (`Actions → CI and Deploy → Run workflow`) follows the exact same path as a push to `main`: CI, then Supabase migrations (if any), then a production Vercel deploy. Use this to redeploy without a new commit (e.g. after only rotating a secret).

---

## Required GitHub repository secrets

Set these in:

`GitHub repo → Settings → Secrets and variables → Actions → New repository secret`

### Vercel secrets

| Secret | Required | Purpose |
|---|---:|---|
| `VERCEL_TOKEN` | yes | Vercel personal/team token used by the CLI |
| `VERCEL_ORG_ID` | yes | Vercel team/user ID |
| `VERCEL_PROJECT_ID` | yes | Vercel project ID |
| `VERCEL_SCOPE` | optional | Vercel team slug/name if deploying under a team scope |

How to get Vercel IDs:

```bash
cd apps/web
npx vercel login
npx vercel link
cat .vercel/project.json
```

The file contains `orgId` and `projectId`. Do not commit `.vercel/project.json`; use its values as GitHub secrets.

### Supabase secrets (CLI — migrations)

| Secret | Required when migrations exist | Purpose |
|---|---:|---|
| `SUPABASE_ACCESS_TOKEN` | yes | Supabase CLI access token |
| `SUPABASE_PROJECT_ID` | yes | Supabase project ref from the dashboard URL |
| `SUPABASE_DB_PASSWORD` | yes | Database password used by the CLI when linking/pushing |

Supabase project ref is visible in your dashboard URL:

```text
https://supabase.com/dashboard/project/<project-ref>
```

### Frontend routing & auth secrets

| Secret | Required | Purpose |
|---|---:|---|
| `BACKEND_API_BASE` | yes (production job fails without it) | Deployed FastAPI backend URL. Used by the CI verification step and documents what to also set in Vercel (Settings → Environment Variables) as a **plain**, non-`NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL, baked into the browser build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key, baked into the browser build (safe to expose — cannot bypass RLS) |

These three are **not** the same as the backend's own `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` (see "Backend environment
variables" above) — never set those on the frontend side.

---

## Required Vercel environment variables

Set these in:

`Vercel project → Settings → Environment Variables`

| Variable | Example | Required | Purpose |
|---|---|---:|---|
| `BACKEND_API_BASE` | `https://api.yourdomain.com` | **yes**, for storm/billing/admin to work | **Plain variable — do NOT prefix with `NEXT_PUBLIC_`.** Read server-side, at request time, by the `/api/backend` proxy route (`apps/web/app/api/backend/[...path]/route.ts`). Set for **Production** (and **Preview**, if you want preview deploys to reach a staging backend). |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | **yes** | Supabase project URL, inlined into the browser bundle at build time. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | **yes** | Supabase anon key, inlined into the browser bundle. Safe to expose — it cannot bypass Row Level Security. |

> **Why `BACKEND_API_BASE` is different from the old `NEXT_PUBLIC_API_BASE`.**
> It is **not** inlined into the browser bundle — it's read at request time by
> a server-side route handler. That means: (1) it never appears in browser
> devtools or the public JS bundle, (2) you can change it and it takes effect
> on the *next request*, no rebuild/redeploy needed, and (3) if it's missing,
> the app doesn't fail to build or show a blank page — login/signup/dashboard
> keep working, and only backend-dependent actions (starting a storm, viewing
> a report, wallet, admin) return a clear `503` until it's set.

Set it via the Vercel dashboard (`Settings → Environment Variables`) or the CLI:

```bash
cd apps/web
vercel env add BACKEND_API_BASE production
# paste: https://your-deployed-fastapi-backend.com

vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

The GitHub Action uses `vercel pull` to pull environment settings before building, then runs every Vercel step with `working-directory: apps/web` so the monorepo's frontend app is the Vercel project root.

---

## What Vercel does and does not host

- **Vercel hosts the Next.js frontend only** (`apps/web`), including the `/api/backend` proxy route (it runs as a Vercel serverless function, not a separate service).
- **The FastAPI backend (`apps/api`) is not hosted by Vercel** and is not deployed by this workflow. Deploy it separately (Render, Railway, Fly.io, a VPS, or any container host — an `apps/api/Dockerfile` is provided), then set that public URL as `BACKEND_API_BASE` in Vercel (a plain variable, **not** `NEXT_PUBLIC_BACKEND_API_BASE`).
- **Supabase only runs database migrations** here (via `supabase db push`). It does **not** host the FastAPI API server.

Run the backend anywhere that can serve HTTP:

```bash
cd apps/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`CORS_ORIGINS` on the backend is no longer required for the official
frontend — the Next.js *server* calls the backend now, not the browser, so
there's no cross-origin request to permit. It still matters if you call the
API directly from a browser (its own `/docs` page, a future separate client,
etc.):

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-vercel-domain.vercel.app
# Optional: allow all Vercel preview deploys of the project
CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

---

## Streaming (SSE) limitation

The live storm page streams reactions over SSE through the proxy
(`/api/backend/storm/{id}/stream`), which forwards the backend's response
unbuffered — bytes reach the browser as the backend emits them, nothing is
held in memory first.

The caveat: this executes as a Vercel serverless function, which has a
**maximum execution duration** per invocation (Hobby: capped at 60s regardless
of config; Pro: up to 300s by default, configurable up to 900s with Fluid
Compute; Enterprise: higher). The route sets `export const maxDuration = 300`,
but the effective cap is whatever your Vercel plan actually allows. A very
long-running real-provider storm (not the instant `mock` provider) could have
its stream cut off mid-run on a lower-tier plan. If you hit this:

- Increase `maxDuration` up to your plan's ceiling, and/or upgrade the plan.
- Or point the frontend directly at the backend for just this one endpoint
  (undoing the proxy for `/stream` only) if you need genuinely unbounded
  stream duration — document that tradeoff if you do, since it reintroduces a
  browser-visible backend URL for that one call.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Banner: **"PersonaStorm backend is not configured or unreachable"** (dashboard/storm-new) | `BACKEND_API_BASE` is unset, or the backend it points to isn't responding | Set `BACKEND_API_BASE` in Vercel (and, if you want CI to catch this earlier, as the `BACKEND_API_BASE` GitHub secret) to your deployed FastAPI backend URL — **no rebuild needed**, it takes effect on the next request. Verify the backend responds: `curl https://<backend>/api/health`. |
| Storm/billing/admin action fails with **HTTP 503** and `"PersonaStorm backend is not configured..."` | Same as above — the proxy route couldn't resolve `BACKEND_API_BASE` | Same fix. Login/signup/dashboard still work; only backend-dependent actions are affected. |
| Storm/billing/admin action fails with **HTTP 502** and `"Could not reach the PersonaStorm backend..."` | `BACKEND_API_BASE` is set but the backend didn't respond (down, wrong URL, network issue) | Verify the FastAPI backend is deployed and reachable at that exact URL (`curl https://<backend>/api/health`). Check for typos and that it uses `https://`. |
| **"Could not reach PersonaStorm. Check your connection and try again."** | The browser couldn't reach *this app's own server* (not the backend) — offline, or the Next.js deployment itself is down | Check your connection; check the Vercel deployment status for the frontend itself. |
| Live storm stuck on **"connecting"**, then "Can't connect to the storm stream" | The proxied SSE route can't reach the backend, your session expired, or the storm ID no longer exists | Same checks as the 503/502 rows above. Note storms are held in memory, so IDs are lost if the API restarts — run a new storm. See "Streaming (SSE) limitation" above if a long-running stream cuts off mid-run. |
| Browser console: **CORS blocked** | Something is calling the FastAPI backend directly from a browser (not through the proxy) | Add that origin to `CORS_ORIGINS` on the backend. The official frontend itself no longer needs this — it calls the backend server-to-server through `/api/backend`. |

---

## Supabase migrations

Supabase database changes should be committed as SQL migrations under:

```text
supabase/migrations/*.sql
```

When at least one migration exists, the workflow runs:

```bash
supabase link --project-ref "$SUPABASE_PROJECT_ID"
supabase db push
```

This follows Supabase's CLI migration model: local schema changes are captured as migration files and deployed to the linked remote project with `supabase db push`.

If there are no SQL migration files, the Supabase deploy job logs a skip message and succeeds without touching the remote database.

---

## Avoid duplicate Vercel deployments

If your Vercel project is already connected directly to GitHub, Vercel may auto-deploy on push while this GitHub Action also deploys via CLI. That creates duplicate deployments.

Recommended setup for this workflow:

1. Keep Vercel project linked for environment management if you want.
2. Disable automatic Git deployments in Vercel, or avoid connecting the repo directly.
3. Let GitHub Actions be the single deployment path.

---

## Manual run

You can trigger the workflow manually from:

`GitHub → Actions → CI and Deploy → Run workflow`

Manual runs follow the same deployment logic as `main` pushes (Supabase migrations, then Vercel production).

---

## A note on the `vercel-preview-deploy` job and secrets

`vercel-preview-deploy` does **not** declare `environment: production` (unlike
`supabase-deploy` and `vercel-production-deploy`) — a PR should get a preview
link immediately, without waiting on a production environment's manual
approval gate, if one is configured.

This only matters if your `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`
secrets are scoped to the **production** GitHub Environment specifically (Settings
→ Environments → production → Secrets) rather than added as plain repository
secrets (Settings → Secrets and variables → Actions). Environment-scoped
secrets are only visible to jobs that declare that environment, so:

- If your Vercel secrets are **repository secrets** (the common case, and what `docs/deployment.md` above assumes): no action needed, `vercel-preview-deploy` already sees them.
- If they are **Environment secrets** on `production` only: either duplicate them as repository secrets, or add a separate `preview` Environment (with no required reviewers) holding the same values and set `environment: preview` on `vercel-preview-deploy`.

---

## Backend deployment note

This workflow validates `apps/api` but does not deploy it. Until the backend
is deployed and `BACKEND_API_BASE` is set in Vercel, the frontend still loads
and login/signup/dashboard work — storm/billing/admin calls return a clear
`503` in the meantime.

For production, deploy `apps/api` separately using the existing Dockerfile or command:

```bash
cd apps/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then set Vercel's `BACKEND_API_BASE` (a plain, server-side variable — **not**
`NEXT_PUBLIC_BACKEND_API_BASE`) to that public backend URL.

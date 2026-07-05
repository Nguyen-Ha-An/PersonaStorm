# Deployment: GitHub Actions → Supabase + Vercel

PersonaStorm is a **Vercel full-stack Next.js app**. Production runs on exactly
two managed services:

```text
Browser
  → Vercel Next.js frontend
  → Next.js Route Handlers under apps/web/app/api/*   (the backend API)
  → Supabase Auth / Postgres (RLS, wallets, storm_runs, pricing_rules, reports)
  → NVIDIA or mock inference provider
```

There is **no separate backend to deploy** and **no backend URL to configure**.
The API is same-origin Route Handlers that run as Vercel serverless functions.
`BACKEND_API_BASE` and `NEXT_PUBLIC_API_BASE` are gone — if you have them set
anywhere, remove them.

> **Why Supabase never gave you a "backend URL".** Supabase is Auth + Postgres
> (+ RLS, RPCs, storage). It is **not** a host for the Python FastAPI app. The
> earlier architecture assumed a separately-deployed FastAPI service reachable
> at `BACKEND_API_BASE`, but that service was never deployed anywhere — hence
> the confusion. The backend logic now lives inside the Next.js app itself, so
> Vercel hosts both the frontend and the API.

The old FastAPI service in `apps/api` **remains for local development,
reference, and the offline test suite** — it is not part of the production
deployment and does not need to be deployed anywhere.

---

## What Vercel and Supabase each host

- **Vercel hosts the whole app**: the Next.js frontend **and** the API Route
  Handlers under `apps/web/app/api/*` (they run as serverless functions on the
  same origin — no CORS, no exposed backend address).
- **Supabase hosts Auth + Postgres only**. The GitHub Action also runs the
  database migrations here (`supabase db push`). Supabase does **not** run any
  Python/FastAPI server.

---

## The API routes

All implemented under `apps/web/app/api/`:

```text
GET  /api/health                         → { "status": "ok", "service": "personastorm-vercel-api" }
GET  /api/me                             → current user profile + wallet
GET  /api/wallet                         → wallet balance
GET  /api/wallet/transactions            → the caller's transaction history
GET  /api/pricing                        → active pricing rule
POST /api/billing/quote                  → price a run + affordability
POST /api/storm/create                   → price → charge → run engine → store report
GET  /api/storm/history                  → the caller's runs
GET  /api/storm/[id]                     → run status (owner/admin only)
GET  /api/storm/[id]/report              → final report (owner/admin only)
GET  /api/storm/[id]/stream              → SSE replay (owner/admin only; ?access_token=)
GET  /api/admin/users                    → list users (admin)
GET  /api/admin/users/[id]               → user detail (admin)
POST /api/admin/users/[id]/wallet-adjust → adjust a wallet (admin)
POST /api/admin/users/[id]/role          → change a role (admin)
GET  /api/admin/storm-runs               → all runs (admin)
GET  /api/admin/pricing                  → get pricing (admin)
POST /api/admin/pricing                  → edit pricing (admin)
```

Every route runs on the server, verifies the Supabase access token
(`Authorization: Bearer …`, or `?access_token=` for the SSE stream only), and
enforces ownership/roles. The browser only ever holds the Supabase **anon** key
and its access token.

### Streaming on serverless — how it works (and its one limitation)

A Vercel serverless function cannot hold in-memory storm state or run a
background task across invocations. So a run executes **synchronously at create
time**: `POST /api/storm/create` prices, charges the wallet atomically, runs the
full engine (personas → reactions → scoring → report), and stores both the
report and the per-persona reaction events. The live page's
`GET /api/storm/[id]/stream` then **replays** those stored events as staged
`init` / `reaction` / `progress` / `complete` SSE messages, paced so the persona
grid still animates like a live storm.

- **No double-charge**: charging happens only in `/storm/create`. The stream and
  report endpoints are read-only, so a refresh, reconnect, or report view never
  charges again.
- **Limitation**: with `INFERENCE_PROVIDER=mock` (the default) a 1,000-persona
  run computes in well under a second, so create returns quickly. With
  `INFERENCE_PROVIDER=nvidia`, 1,000 sequential hosted-LLM calls inside one
  serverless invocation can exceed the function's execution limit — keep
  `mock` on Vercel unless you have raised `maxDuration` and a rate-limit-friendly
  endpoint. The report/stream shapes are identical either way.

---

## SaaS data model (see `supabase/migrations/`)

| Table | Purpose |
|---|---|
| `profiles` | one row per auth user; `role` is `user` or `admin` |
| `wallets` | credit balance + lifetime spent, one per user |
| `wallet_transactions` | immutable audit log; every balance change writes a row |
| `storm_runs` | ownership + billing metadata + durable `report_json` + `reactions_json` (stream replay) |
| `pricing_rules` | the credit pricing formula, editable by admins |

Key objects: `is_admin()`, an `updated_at` trigger, a `handle_new_user` trigger
(provisions `profiles` + `wallets` + **100 starter credits** on signup), and
`adjust_wallet_balance(...)` — the single atomic, row-locking entry point for
any balance change. `EXECUTE` on `adjust_wallet_balance` is revoked from
`anon`/`authenticated`, so only the service role (the Route Handlers) can move
credits; a browser client can never credit itself.

Pricing formula (default rule 10 / 5 / 5, analyst report included):

```text
total_credits = base_run_credits
              + ceil(persona_count / 100) * credits_per_100_personas
              + analyst_report_credits
# 100 personas = 20, 250 = 30, 500 = 40, 1000 = 65
```

---

## Environment variables

### Frontend (public — safe to expose; inlined into the browser bundle)

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL — **only** `https://<ref>.supabase.co`, no `/rest/v1`, `/auth/v1`, `/storage/v1` path |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase **anon** key (never the service role key) |
| `NEXT_PUBLIC_SITE_URL` | yes (prod) | Canonical site URL used to build every auth redirect (`emailRedirectTo` / `redirectTo`). Production: `https://personastorm.nguyenhaan.id.vn`. If unset, falls back to `NEXT_PUBLIC_VERCEL_URL` → `window.location.origin` → `http://localhost:3000` (dev only). **Never localhost in production.** |

### Server-side (Vercel — read at request time by Route Handlers, never in the browser)

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | yes* | Project URL for server code. *If unset, falls back to `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **SECRET** — bypasses RLS; owns wallet mutations. Never `NEXT_PUBLIC_`. |
| `SUPABASE_JWT_SECRET` | recommended | **SECRET** — HS256 secret to verify access tokens offline. If unset, tokens are validated remotely via GoTrue. |
| `SUPABASE_ANON_KEY` | optional | server-side anon key for GoTrue token validation; falls back to the public one |
| `API_ENV` | recommended | set `prod` to refuse unverified tokens when the JWT secret is missing |
| `INFERENCE_PROVIDER` | optional | `mock` (default) \| `nvidia` |
| `ANALYST_PROVIDER` | optional | `mock` (default) \| `nvidia` |
| `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` / `NVIDIA_MODEL` | optional | **SECRET** key — only for the `nvidia` provider |

**No `NEXT_PUBLIC_` variable may ever contain the service role key, JWT secret,
admin password, or NVIDIA key.**

---

## Deployment flow

```text
GitHub Actions (push to main / manual dispatch)
  → API tests (apps/api, offline mock) + Next.js build
  → Supabase migrations (supabase db push)
  → sync safe env vars into Vercel (public NEXT_PUBLIC_* + server-side SUPABASE_*/NVIDIA_*)
  → deploy the Next.js full-stack app to Vercel (production)
```

- **Pull request** → CI (API tests + web build) + a Vercel **Preview** deploy.
  Supabase migrations are intentionally skipped on PRs (never mutate production
  schema from unmerged code).
- **Push to `main` / manual dispatch** → CI → Supabase migrations → Vercel
  **Production** deploy (the Vercel job `needs` the Supabase job so the DB is
  migrated before the new code goes live).

The workflow is the source of truth for Vercel's env: every deploy runs a
"Sync Vercel environment variables" step that pushes the values below from
GitHub secrets into Vercel via `vercel env add`. Values are only piped over
stdin (never echoed) and the step prints variable names only.

### GitHub secrets

Set in `GitHub repo → Settings → Secrets and variables → Actions`.

**Required:**

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL       # https://personastorm.nguyenhaan.id.vn — auth redirect base

SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET

SUPABASE_ACCESS_TOKEN     # Supabase CLI — migrations only, NOT synced to Vercel
SUPABASE_PROJECT_ID       # Supabase CLI — migrations only, NOT synced to Vercel
SUPABASE_DB_PASSWORD      # Supabase CLI — migrations only, NOT synced to Vercel
```

**Optional (only if using the NVIDIA provider):**

```text
NVIDIA_API_KEY
NVIDIA_BASE_URL
NVIDIA_MODEL
INFERENCE_PROVIDER
ANALYST_PROVIDER
```

**Synced into Vercel** (safe frontend + server-side): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_URL` (falls back
to the public URL), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
`INFERENCE_PROVIDER`, `ANALYST_PROVIDER`, `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`,
`NVIDIA_MODEL`.

The production deploy fails loud if `NEXT_PUBLIC_SITE_URL` is missing, not a valid
`https` URL, or points at `localhost`, and if `NEXT_PUBLIC_SUPABASE_URL` carries an
API path (`/rest/v1`, `/auth/v1`, `/storage/v1`) — see the "Validate auth redirect
+ Supabase URL format (production)" step in the workflow.

**NEVER synced into Vercel** (used only by the Supabase CLI / admin bootstrap):
`SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `ADMIN_PASSWORD`.

How to get the Vercel IDs:

```bash
cd apps/web
npx vercel login
npx vercel link
cat .vercel/project.json   # orgId + projectId — do not commit this file
```

---

## Supabase Auth: Site URL & redirect configuration (required)

Supabase Auth builds every confirmation / magic-link / password-reset link from
two things:

- the **Site URL** — the default redirect used when a request passes no explicit
  redirect; and
- the **Redirect URLs allow list** — the set of destinations `emailRedirectTo` /
  `redirectTo` are allowed to point at.

If the Site URL is left at the Supabase default (`http://localhost:3000`), every
confirmation email sends users back to localhost — which is exactly the
`http://localhost:3000/#error=access_denied&error_code=otp_expired…` symptom.
The app now always passes an explicit `emailRedirectTo`/`redirectTo` built from
`NEXT_PUBLIC_SITE_URL`, but you must **also** fix the dashboard so the Site URL
is production and the redirect targets are allow-listed.

Open **[Authentication → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)**
(`https://supabase.com/dashboard/project/_/auth/url-configuration`) and set:

**Site URL**

```text
https://personastorm.nguyenhaan.id.vn
```

**Redirect URLs** (add each; `/**` allow-lists every path under the origin)

```text
https://personastorm.nguyenhaan.id.vn/**
https://persona-storm.vercel.app/**
http://localhost:3000/**
```

For Vercel **preview** deployments (per-PR URLs), also add a wildcard for your
Vercel team/account slug:

```text
https://*-<your-vercel-team-or-account-slug>.vercel.app/**
```

### Optional: point the email button at the app domain (custom confirm route)

By default the confirmation button links to Supabase's `/auth/v1/verify` URL,
which then 302s to `emailRedirectTo`. If you'd rather the button link **directly**
at the PersonaStorm domain, edit **Authentication → Email Templates → Confirm
signup** and change the button to use the `token_hash` flow the app implements at
`/auth/confirm`:

```html
<a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
  Confirm email address
</a>
```

- `{{ .RedirectTo }}` is the redirect passed by `signUp` (i.e. built from
  `NEXT_PUBLIC_SITE_URL`), so the link lands on the production domain — **never
  hardcode localhost here**.
- `{{ .TokenHash }}` is the single-use token the `/auth/confirm` route exchanges
  with `verifyOtp`. On success it routes to `/dashboard`; on a stale/used link it
  routes to `/login?error=otp_expired`.

This step is optional — the default `{{ .ConfirmationURL }}` template works too,
because `emailRedirectTo` already returns users to `/auth/callback`.

### Why an old link still shows `otp_expired`

`otp_expired` means the link is **expired, already used, or was generated before
the URL configuration was fixed**. Existing emails may still point at localhost or
have expired. After changing the Site URL / redirect config, **request a fresh
confirmation email** and click the newest one — do not test with an old link.

---

## One-time Supabase setup

1. Create a Supabase project.
2. Apply the migrations — push from GitHub Actions (above) or locally:
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Create the first admin with the **service role** key in a trusted shell:
   ```bash
   export SUPABASE_URL=https://<project-ref>.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=<service role key>
   export ADMIN_EMAIL=you@example.com
   export ADMIN_PASSWORD=<strong password>
   export ADMIN_FULL_NAME="PersonaStorm Admin"
   python scripts/create_admin_user.py
   ```
   It creates the auth user (email pre-confirmed), sets `role = admin`, ensures a
   wallet, grants credits, is idempotent, and never prints secrets.

---

## Verify a deployment

Public health check (no auth):

```bash
curl https://personastorm.nguyenhaan.id.vn/api/health
# {"status":"ok","service":"personastorm-vercel-api"}
```

Protected routes require a Supabase access token. Log in via the app, copy the
token (Supabase stores it in the browser session), then:

```bash
TOKEN="<supabase access_token>"

# Price a run (returns total_credits + affordability against your wallet)
curl -X POST https://personastorm.nguyenhaan.id.vn/api/billing/quote \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"persona_count":1000,"include_analyst_report":true}'
# {"persona_count":1000,...,"total_credits":65,"wallet_balance":100,"balance_after":35,"has_enough_credits":true}

curl https://personastorm.nguyenhaan.id.vn/api/wallet -H "Authorization: Bearer $TOKEN"
```

Without a token, protected routes return `401 {"detail":"Missing authentication token."}`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/api/health` fails or the app can't load | The Vercel deployment itself is down or mis-deployed | Check the Vercel deployment status and function logs. |
| Actions return `401 {"detail":"Missing authentication token."}` | No/expired Supabase session | Log in again; the browser sends the access token automatically. |
| Actions return `500 … Check Vercel function logs and required environment variables` | A server env var is missing (e.g. `SUPABASE_SERVICE_ROLE_KEY`) | Set the required server-side secrets; they are synced into Vercel on the next deploy. |
| `502 … data backend is unavailable` | Supabase/PostgREST call failed | Verify the Supabase project is up and the service role key is correct. |
| Login/signup fail | `NEXT_PUBLIC_SUPABASE_*` missing or wrong | Set them from Supabase Settings → API (anon key only). |
| Confirmation email lands on `http://localhost:3000/#error=…otp_expired…` | Supabase **Site URL** is still localhost and/or the link is old | Set Site URL + Redirect URLs to the production domain (above), set `NEXT_PUBLIC_SITE_URL`, redeploy, then request a **fresh** email. |
| Email link shows `otp_expired` even after the fix | Link is expired, already used, or predates the URL-config fix | Request a new confirmation/reset email and click the newest one. Don't reuse old links. |
| Storm stream stuck "connecting" | Session expired or the storm ID doesn't exist / isn't yours | Log in again; start a new storm. Ownership is enforced (a non-owner gets 404). |

---

## Local development

```bash
# frontend + API (Route Handlers) — http://localhost:3000
cd apps/web
npm install
npm run dev
```

With no Supabase env vars set, the server uses an in-memory gateway + dev auth so
login/dashboard/storm all work offline within the running dev process (data is
not persisted across restarts — this is dev-only; production always uses
Supabase). The `apps/api` FastAPI service is still runnable for reference/testing
(`make api`, `make test`), but the Next.js app no longer depends on it.

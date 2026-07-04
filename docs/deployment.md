# Deployment: GitHub Actions → Supabase + Vercel

This repo now includes `.github/workflows/deploy.yml` to run CI and deploy from GitHub Actions.

The workflow is designed for the current monorepo layout:

- `apps/web` → Next.js frontend deployed to Vercel
- `apps/api` → FastAPI backend tested in CI, but **not deployed by this workflow**
- `supabase/migrations/*.sql` → Supabase database migrations pushed with the Supabase CLI, when migration files exist

> Important: the production Vercel frontend still needs `NEXT_PUBLIC_API_BASE` to point at a deployed FastAPI backend URL. Deploy the API separately to Render, Railway, Fly.io, a VPS, or another container host, then set that URL in Vercel.

---

## What runs automatically

### Pull requests into `main`

The workflow runs checks only:

1. API tests from `apps/api`
2. Next.js build from `apps/web`

It does not mutate Supabase and does not deploy production Vercel from PRs.

### Pushes to `main`

The workflow runs:

1. API tests
2. Next.js build
3. Supabase migrations deploy, if `supabase/migrations/*.sql` exists
4. Vercel production deployment from `apps/web`

The Supabase job runs before Vercel so the frontend deploy happens after database migrations are applied.

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

### Supabase secrets

| Secret | Required when migrations exist | Purpose |
|---|---:|---|
| `SUPABASE_ACCESS_TOKEN` | yes | Supabase CLI access token |
| `SUPABASE_PROJECT_ID` | yes | Supabase project ref from the dashboard URL |
| `SUPABASE_DB_PASSWORD` | yes | Database password used by the CLI when linking/pushing |

Supabase project ref is visible in your dashboard URL:

```text
https://supabase.com/dashboard/project/<project-ref>
```

---

## Required Vercel environment variables

Set these in:

`Vercel project → Settings → Environment Variables`

Minimum required for this repo:

| Variable | Example | Required | Purpose |
|---|---|---:|---|
| `NEXT_PUBLIC_API_BASE` | `https://api.yourdomain.com` | **yes** | Browser-accessible FastAPI backend origin. Set for the **Production** (and Preview) environments. |

> **Why this matters.** `NEXT_PUBLIC_API_BASE` is inlined into the browser bundle at build time. If it is missing in a production build, the frontend **does not** fall back to `http://localhost:8000` (that address means "the visitor's own machine" and can never work in the cloud). Instead it renders a clear banner telling you to set this variable. Set it in Vercel **before** the production deploy so the value is baked into the build.

Set it via the Vercel dashboard (`Settings → Environment Variables`) or the CLI:

```bash
cd apps/web
vercel env add NEXT_PUBLIC_API_BASE production
# paste: https://your-deployed-fastapi-backend.com
```

Optional, depending on future Supabase frontend usage:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous public key |

The GitHub Action uses `vercel pull` to pull production environment settings before building, then runs every Vercel step with `working-directory: apps/web` so the monorepo's frontend app is the Vercel project root.

---

## What Vercel does and does not host

- **Vercel hosts the Next.js frontend only** (`apps/web`).
- **The FastAPI backend (`apps/api`) is not hosted by Vercel** and is not deployed by this workflow. Deploy it separately (Render, Railway, Fly.io, a VPS, or any container host — an `apps/api/Dockerfile` is provided), then set that public URL as `NEXT_PUBLIC_API_BASE` in Vercel.
- **Supabase only runs database migrations** here (via `supabase db push`). It does **not** host the FastAPI API server.

Run the backend anywhere that can serve HTTP:

```bash
cd apps/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then, on the backend, allow your Vercel origin via `CORS_ORIGINS`:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://your-vercel-domain.vercel.app
# Optional: allow all Vercel preview deploys of the project
CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Banner: **"Backend API is not configured"** / error: *"Production API URL is not configured"* | `NEXT_PUBLIC_API_BASE` is unset in the Vercel production build | Set `NEXT_PUBLIC_API_BASE` in Vercel to your deployed FastAPI backend URL, then redeploy so it is baked into the bundle. |
| **"Could not reach PersonaStorm API"** (network error) | Backend is down/unreachable, or the URL is wrong | Verify the FastAPI backend is deployed and the URL responds (`curl https://<backend>/api/health`). Confirm `NEXT_PUBLIC_API_BASE` has no typo and uses `https://`. |
| Browser console: **CORS blocked** / "No 'Access-Control-Allow-Origin'" | The Vercel domain isn't in the backend's allow-list | Add your Vercel domain to `CORS_ORIGINS` on the backend (or set `CORS_ORIGIN_REGEX` for previews) and restart it. |
| Live storm stuck on **"connecting"**, then "Can't connect to the storm stream" | SSE stream can't reach the backend, or the storm ID no longer exists | Same checks as the two rows above. Note storms are held in memory, so IDs are lost if the API restarts — run a new storm. |

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

Manual runs follow the same deployment logic as `main` pushes.

---

## Backend deployment note

This workflow validates `apps/api` but does not deploy it. Production frontend calls will fail if `NEXT_PUBLIC_API_BASE` still points to localhost.

For production, deploy `apps/api` separately using the existing Dockerfile or command:

```bash
cd apps/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then set Vercel's `NEXT_PUBLIC_API_BASE` to that public backend URL.

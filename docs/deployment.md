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

| Variable | Example | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://api.yourdomain.com` | Browser-accessible FastAPI backend origin |

Optional, depending on future Supabase frontend usage:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous public key |

The GitHub Action uses `vercel pull` to pull production environment settings before building. Vercel CLI supports deploying from a project directory with `--cwd`, and this workflow uses `--cwd apps/web` so the Vercel project root is the frontend app.

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

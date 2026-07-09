# PersonaStorm API (reference / local dev only)

> **⚠️ Not used in production.** PersonaStorm is now a **Vercel full-stack app**:
> the production backend API runs as Next.js Route Handlers under
> `apps/web/app/api/*`, and the engine has been ported to TypeScript in
> `apps/web/lib/server/`. This FastAPI service is kept only as the reference
> implementation, for local experiments, and for the offline pytest suite. You
> do **not** need to deploy it, and there is no `BACKEND_API_BASE` — see
> [docs/deployment.md](../../docs/deployment.md). The Render/Railway instructions
> below are historical and no longer required.

FastAPI backend for PersonaStorm — the persona-swarm engine, SSE streaming,
Supabase-backed auth/billing/admin. See the [repo root README](../../README.md)
for the full product description and [docs/deployment.md](../../docs/deployment.md)
for the current (Vercel + Supabase) deployment guide.

## Run locally

```bash
cd apps/api
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

Runs fully offline with `INFERENCE_PROVIDER=mock` (the default) — no keys
needed. OpenAPI docs at `http://localhost:8000/docs`.

## Start command (any host)

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`$PORT` is injected by most PaaS hosts (Render, Railway, Fly.io). For a host
that doesn't set `$PORT`, default to `8000`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## Health check

```text
GET /api/health
```

```json
{
  "status": "ok",
  "service": "personastorm-api",
  "version": "0.1.0",
  "inference_provider": "mock",
  "active_storms": 0,
  "time": "2026-07-04T19:00:00+00:00"
}
```

Use this to verify a deployment before pointing the frontend's
`BACKEND_API_BASE` at it:

```bash
curl https://your-backend-domain.com/api/health
curl https://your-backend-domain.com/openapi.json
```

## Deploy to Render (preferred)

A `render.yaml` blueprint lives at the repo root. In the Render dashboard:
**New → Blueprint** → point at this repo → Render reads `render.yaml` and
creates the service with the root directory, build command, start command,
and health check path already configured.

Manual setup (if not using the blueprint):

| Setting | Value |
|---|---|
| Root directory | `apps/api` |
| Runtime | Python 3 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |

Either way, set the environment variables below in the Render dashboard
(**never** in a committed file — see `render.yaml`'s `sync: false` markers).

## Deploy to Railway (alternative)

Railway auto-detects Python via `requirements.txt`. Set:

| Setting | Value |
|---|---|
| Root directory | `apps/api` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Railway injects `PORT` automatically. Set the same environment variables as
below in the Railway dashboard.

## Deploy with Docker (any container host)

```bash
docker build -f apps/api/Dockerfile -t personastorm-api .
docker run -p 8000:8000 --env-file .env personastorm-api
```

The image's `CMD` reads `$PORT` (falls back to `8000`), so it works on
container hosts that inject `PORT` (e.g. Railway, Fly.io) without changes.

## Required environment variables

See [docs/deployment.md](../../docs/deployment.md) for the full reference.
Minimum for a working production deployment:

```env
# Runs fully in mock mode without these — set for real Supabase-backed auth/billing
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
API_ENV=prod

# Must include your Vercel frontend's origin (not strictly required once the
# Next.js proxy is in front — see docs/deployment.md — but keep it accurate
# for direct API access, e.g. the /docs page)
CORS_ORIGINS=https://your-frontend.vercel.app

# Optional — only if using a real LLM provider instead of the mock swarm
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=z-ai/glm-5.2
```

- Live nemotron reasoning inference (both roles): see the "live nemotron" block in `.env.example` and `docs/inference-roadmap.md`. Test at `persona_count=50`.

## After deploying

1. Verify: `curl https://your-backend-domain.com/api/health`
2. Copy that URL and set it as the `BACKEND_API_BASE` GitHub Actions secret
   (repo root → Settings → Secrets and variables → Actions) — the Next.js
   frontend's `/api/backend/*` proxy route forwards there. **Not**
   `NEXT_PUBLIC_API_BASE` — the browser never talks to this service directly.
3. Re-run (or trigger) the `vercel-production-deploy` job so Vercel picks up
   the new `BACKEND_API_BASE`.

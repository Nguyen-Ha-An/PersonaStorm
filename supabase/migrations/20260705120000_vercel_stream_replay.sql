-- ============================================================================
-- Vercel full-stack migration: stream replay column
--
-- PersonaStorm now runs its backend as Next.js Route Handlers on Vercel
-- (no separate FastAPI host). A storm run completes synchronously at create
-- time, so the per-persona reaction events must be persisted to let the SSE
-- stream endpoint (/api/storm/[id]/stream) replay a completed run as a
-- live-looking storm without holding any in-memory state between serverless
-- invocations.
--
-- `reactions_json` stores { reactions: ReactionEvent[], progress: ProgressEvent }
-- for exactly that replay. It is written only by the service role (server-side),
-- never by a client. RLS on storm_runs is unchanged: users still read only
-- their own rows (admins read all), and there is no client write path.
-- ============================================================================

alter table public.storm_runs
  add column if not exists reactions_json jsonb;

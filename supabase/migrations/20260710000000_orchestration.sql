-- ============================================================================
-- Nemotron-orchestrated Fireworks worker swarm.
--
-- Two additive changes, both backward compatible:
--   1. Orchestration knobs on inference_settings (runtime-tunable via the admin
--      panel). Like the existing model/provider columns, these change *which*
--      models are used and *how many* virtual agents pack into a shard — they
--      NEVER hold an API key or a base URL. The NVIDIA and Fireworks keys stay
--      in env (apps/web/lib/server/env.ts) and are layered on server-side.
--
--      SECURITY: max_physical_workers is a stored preference only. The engine
--      ALWAYS clamps it to the hard cap MAX_PHYSICAL_SWARM_WORKERS = 10
--      (apps/web/lib/server/engine/orchestration/caps.ts). No value stored here
--      — even a hand-edited row — can make PersonaStorm deploy more than 10
--      physical Fireworks workers per storm.
--
--   2. orchestration_json on storm_runs: the persisted orchestration record
--      (plan + worker shard outputs + final synthesis + server-computed
--      numerics + status/error). Written only by the service role; mirrors the
--      existing report_json / reactions_json pattern so a completed run's
--      orchestration survives a page reload. RLS on storm_runs is unchanged.
-- ============================================================================

alter table public.inference_settings
  add column if not exists orchestration_enabled           boolean not null default false,
  add column if not exists orchestrator_model              text    not null default 'nvidia/nemotron-3-ultra-550b-a55b',
  add column if not exists worker_model                    text    not null default '',
  add column if not exists max_physical_workers            integer not null default 10,
  add column if not exists virtual_agents_per_worker       integer not null default 5,
  add column if not exists worker_max_tokens               integer not null default 1024,
  add column if not exists orchestrator_max_tokens         integer not null default 4096,
  add column if not exists worker_temperature              double precision not null default 0.6,
  add column if not exists orchestrator_temperature        double precision not null default 0.4,
  add column if not exists enable_worker_web_research       boolean not null default false,
  add column if not exists worker_web_research_max_queries  integer not null default 3;

-- Defense in depth: even if a row is hand-edited, the stored physical-worker
-- count can never exceed the hard cap. The application clamps on read + write;
-- this CHECK stops a raw INSERT/UPDATE from persisting an out-of-range value.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inference_settings_max_physical_workers_cap'
  ) then
    alter table public.inference_settings
      add constraint inference_settings_max_physical_workers_cap
      check (max_physical_workers between 1 and 10);
  end if;
end $$;

alter table public.storm_runs
  add column if not exists orchestration_json jsonb;

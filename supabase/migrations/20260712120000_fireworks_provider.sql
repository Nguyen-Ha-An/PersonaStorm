-- ============================================================================
-- Fireworks as a first-class inference provider (AMD hackathon: the real
-- prototype's LLM inference runs on the Fireworks API).
--
-- Three additive, backward-compatible changes to inference_settings:
--   1. The inference_provider / analyst_provider CHECKs now also allow
--      'fireworks' — the classic persona swarm and the analyst can run on
--      Fireworks directly (INFERENCE_PROVIDER=fireworks etc.).
--   2. fireworks_model — the runtime-editable model for those paths. Empty
--      means "inherit FIREWORKS_MODEL from env". Like nvidia_model, it changes
--      *which* model is used, never *where* requests go: the Fireworks API key
--      and base URL stay in env (apps/web/lib/server/env.ts) and are always
--      layered on server-side (apps/web/lib/server/inferenceSettings.ts).
--   3. orchestrator_provider — which API hosts the orchestration "brain".
--      Empty means "inherit ORCHESTRATOR_PROVIDER from env" (fireworks by
--      default, so the whole swarm runs on one FIREWORKS_API_KEY; 'nvidia'
--      routes the brain to NVIDIA-hosted Nemotron).
-- ============================================================================

alter table public.inference_settings
  drop constraint if exists inference_settings_inference_provider_check;
alter table public.inference_settings
  add constraint inference_settings_inference_provider_check
  check (inference_provider in ('mock', 'nvidia', 'fireworks'));

alter table public.inference_settings
  drop constraint if exists inference_settings_analyst_provider_check;
alter table public.inference_settings
  add constraint inference_settings_analyst_provider_check
  check (analyst_provider in ('mock', 'nvidia', 'fireworks'));

alter table public.inference_settings
  add column if not exists fireworks_model       text not null default '',
  add column if not exists orchestrator_provider text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inference_settings_orchestrator_provider_check'
  ) then
    alter table public.inference_settings
      add constraint inference_settings_orchestrator_provider_check
      check (orchestrator_provider in ('', 'nvidia', 'fireworks'));
  end if;
end $$;

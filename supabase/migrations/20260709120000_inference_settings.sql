-- ============================================================================
-- inference_settings — runtime-editable inference config (single active row),
-- admin-edited via the admin panel and read by the engine per-storm. Mirrors
-- pricing_rules (see 20260704090000_saas_core.sql).
--
-- SECURITY: the NVIDIA API key and base URL are NEVER stored here — they stay
-- in env (see apps/web/lib/server/env.ts) and are always layered onto the
-- resolved config server-side (apps/web/lib/server/inferenceSettings.ts). A
-- row in this table can change *which* model/provider is used, never *where*
-- requests go or *what credential* authorizes them.
--
-- Single-active-row: like pricing_rules, this is enforced at the application
-- layer, not a DB constraint — updateActiveInferenceSettings() PATCHes the
-- existing active row by id when one exists and only POSTs a new row when
-- none does (apps/web/lib/server/gateway.ts). No row at all is a valid,
-- expected state: resolveEffectiveConfig() falls back entirely to env in that
-- case (apps/web/lib/server/inferenceSettings.ts), so this table is
-- intentionally left unseeded.
-- ============================================================================

create table if not exists public.inference_settings (
  id                 uuid primary key default gen_random_uuid(),
  is_active          boolean not null default true,
  inference_provider text not null default 'mock' check (inference_provider in ('mock', 'nvidia')),
  analyst_provider   text not null default 'mock' check (analyst_provider in ('mock', 'nvidia')),
  nvidia_model       text not null default 'z-ai/glm-5.2',
  analyst_model      text not null default '',
  nvidia_max_tokens  integer not null default 2048,
  analyst_max_tokens integer not null default 4096,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists inference_settings_set_updated_at on public.inference_settings;
create trigger inference_settings_set_updated_at
  before update on public.inference_settings
  for each row execute function public.set_updated_at();

alter table public.inference_settings enable row level security;

-- Admin-only read + write. The server always uses the service role (which
-- bypasses RLS) for both GET and POST /api/admin/inference-settings, gated by
-- requireAdmin() at the application layer — so this policy is defense-in-depth
-- for any direct (authenticated) PostgREST access, same role as pricing_rules'
-- RLS. Unlike pricing_rules (whose active rule is readable by any authenticated
-- user to price a quote), inference/model config has no legitimate non-admin
-- reader, so both read and write are scoped to admins here.
drop policy if exists inference_settings_admin_all on public.inference_settings;
create policy inference_settings_admin_all on public.inference_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

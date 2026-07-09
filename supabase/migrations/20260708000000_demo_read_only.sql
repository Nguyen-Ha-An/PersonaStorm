-- ============================================================================
-- Public demo storm — a single is_demo run readable by anyone, no signup.
--
-- The app serves the demo through the service-role gateway (which bypasses
-- RLS), so the anon policy below is defense-in-depth: it keeps the demo row
-- readable even if something ever reads storm_runs as the anon role, while all
-- non-demo rows stay owner-only.
-- ============================================================================

alter table public.storm_runs
  add column if not exists is_demo boolean not null default false;

-- Demo rows have no owner. Relax user_id to allow null, but keep integrity for
-- every real run via a check: only a demo row may omit its owner.
alter table public.storm_runs alter column user_id drop not null;

alter table public.storm_runs drop constraint if exists storm_runs_user_or_demo;
alter table public.storm_runs add constraint storm_runs_user_or_demo
  check (is_demo or user_id is not null);

-- Anyone may read demo rows (in addition to the existing owner/admin policy).
drop policy if exists storm_runs_select_demo on public.storm_runs;
create policy storm_runs_select_demo on public.storm_runs
  for select to anon, authenticated
  using (is_demo = true);

-- ============================================================================
-- Tighten pricing_rules client visibility.
--
-- The original policy (pricing_rules_select_all, USING (true)) let any
-- authenticated client read EVERY pricing row via PostgREST, including
-- historical/inactive ones. The app never needs that: the frontend only ever
-- reads pricing through the server (GET /api/pricing, GET /api/dashboard) using
-- the service role, which bypasses RLS. Admin reads/writes likewise flow through
-- the service role. So we scope the client-facing SELECT to the single ACTIVE
-- rule — the only pricing a user should ever see — with no functional change to
-- the app and less exposed surface.
-- ============================================================================

drop policy if exists pricing_rules_select_all on public.pricing_rules;
drop policy if exists pricing_rules_select_active on public.pricing_rules;

create policy pricing_rules_select_active on public.pricing_rules
  for select to authenticated
  using (is_active = true);

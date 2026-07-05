-- ============================================================================
-- Harden public.is_admin()
--
-- Security review finding: is_admin(uid) was created without any EXECUTE
-- grants management, so it kept Postgres' default EXECUTE-to-PUBLIC. Because
-- it is SECURITY DEFINER (it must bypass profiles RLS for policy evaluation),
-- any client — including anon — could call it via PostgREST
-- (rpc('is_admin', { uid: ... })) and use it as an oracle for whether an
-- arbitrary user id belongs to an admin.
--
-- Fix, two layers:
--   1. Non-service callers can only ever ask about THEMSELVES: for any other
--      uid the function now returns false instead of the real answer. RLS
--      policies are unaffected — they call is_admin() with the default
--      uid = auth.uid(), i.e. always the self path.
--   2. EXECUTE is revoked from PUBLIC and anon. authenticated keeps EXECUTE
--      because RLS policy expressions run with the querying role's privileges.
-- ============================================================================

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case
    -- Asking about someone else: only the service role (or a direct DB role
    -- with no request JWT, e.g. migrations/psql) gets the real answer.
    when uid is distinct from auth.uid()
         and coalesce(auth.role(), '') not in ('', 'service_role')
      then false
    else exists (
      select 1 from public.profiles
      where id = uid and role = 'admin'
    )
  end;
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_admin(uuid) from anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

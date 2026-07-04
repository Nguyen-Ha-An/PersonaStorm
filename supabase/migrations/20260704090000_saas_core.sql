-- ============================================================================
-- PersonaStorm SaaS core schema
--
-- Auth (Supabase Auth `auth.users`) + application tables for the dashboard
-- product: profiles, wallets (credit balance), wallet_transactions (audit log),
-- storm_runs (ownership + billing metadata for each wind-tunnel run), and
-- pricing_rules (the credit pricing formula, editable by admins).
--
-- Security model (see docs/deployment.md#security):
--   * RLS is enabled on every table.
--   * Users may only ever *read* their own rows (admins read all).
--   * NO table grants client-side INSERT/UPDATE/DELETE — every mutation flows
--     through the FastAPI backend using the Supabase service role, which
--     bypasses RLS. The frontend can never mutate a wallet balance directly.
--   * Wallet balance changes go exclusively through adjust_wallet_balance(),
--     a SECURITY DEFINER function whose EXECUTE grant is revoked from anon and
--     authenticated roles — only the service role (backend) may call it.
-- ============================================================================

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, mirrors identity + role
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- wallets — credit balance per user (one wallet per user)
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  balance_credits integer not null default 0 check (balance_credits >= 0),
  lifetime_spent_credits integer not null default 0 check (lifetime_spent_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- wallet_transactions — immutable audit log; every balance change writes a row
--   positive amount  = wallet credited (grant / refund / top-up)
--   negative amount  = wallet charged  (storm run)
--   balance_after    = wallet balance immediately after this transaction
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  type text not null check (
    type in ('credit_grant', 'storm_charge', 'refund', 'admin_adjustment')
  ),
  amount_credits integer not null,
  balance_after integer not null,
  description text,
  storm_id text,
  -- SET NULL (not the default NO ACTION): deleting the acting admin/user must
  -- not be blocked by, nor cascade-delete, an audit row it merely stamped.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_id_created_at_idx
  on public.wallet_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- storm_runs — ownership + billing metadata for each run.
--   The live storm state and the streamed reactions still live in the API
--   process (in-memory + data/runs/*.json). This table is the durable record
--   of who ran what, what it cost, and (optionally) the final report JSON.
-- ---------------------------------------------------------------------------
create table if not exists public.storm_runs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  stimulus_type text not null,
  target_market text not null,
  product_category text,
  persona_count integer not null,
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  price_credits integer not null default 0,
  report_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create index if not exists storm_runs_user_id_created_at_idx
  on public.storm_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- pricing_rules — the credit pricing formula. One row is active at a time.
--   total_credits = base_run_credits
--                 + ceil(persona_count / 100) * credits_per_100_personas
--                 + (analyst_report_credits if analyst report requested)
-- ---------------------------------------------------------------------------
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  base_run_credits integer not null default 10,
  credits_per_100_personas integer not null default 5,
  analyst_report_credits integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed exactly one active pricing rule (idempotent: only if none exists).
insert into public.pricing_rules (name, is_active, base_run_credits, credits_per_100_personas, analyst_report_credits)
select 'Default', true, 10, 5, 5
where not exists (select 1 from public.pricing_rules where is_active = true);

-- ============================================================================
-- Functions & triggers
-- ============================================================================

-- is_admin(uid) — true when the given user (default: caller) is an admin.
-- SECURITY DEFINER so RLS policies can call it without recursing into profiles'
-- own RLS. STABLE + explicit search_path to avoid hijacking.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$$;

-- set_updated_at — generic BEFORE UPDATE trigger to bump updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists pricing_rules_set_updated_at on public.pricing_rules;
create trigger pricing_rules_set_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();

-- handle_new_user — on Supabase Auth signup, provision the application rows:
--   * profile (role 'user')
--   * wallet
--   * 100 starter credits + the matching credit_grant transaction
--
-- STARTER BALANCE = 100 credits. Rationale: the default pricing rule charges
-- 20 credits for a 100-persona run and 65 for a 1,000-persona run, so 100
-- starter credits lets a new user run at least one meaningful storm (and
-- several small ones) before needing a top-up — enough to experience the full
-- product without a payment step, which is not yet enabled.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_starter constant integer := 100;
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'user'
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance_credits)
  values (new.id, v_starter)
  on conflict (user_id) do nothing
  returning id into v_wallet_id;

  -- Only log the starter grant if we actually created the wallet just now.
  if v_wallet_id is not null then
    insert into public.wallet_transactions
      (user_id, wallet_id, type, amount_credits, balance_after, description, created_by)
    values
      (new.id, v_wallet_id, 'credit_grant', v_starter, v_starter, 'Starter credits', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- adjust_wallet_balance — the ONE atomic entry point for changing a balance.
--   * locks the wallet row FOR UPDATE (serializes concurrent storm charges)
--   * creates the wallet on demand if somehow missing
--   * rejects any change that would drive the balance below 0
--   * updates lifetime_spent_credits when the amount is negative (a charge)
--   * writes the wallet_transactions audit row
--   * returns the new balance
--
-- EXECUTE is revoked from anon/authenticated below: only the service role
-- (the FastAPI backend) may call this. That is what makes it impossible for a
-- browser client to credit itself.
create or replace function public.adjust_wallet_balance(
  target_user_id uuid,
  amount integer,
  transaction_type text,
  description text default null,
  storm_id text default null,
  actor_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_balance integer;
  v_new_balance integer;
begin
  if transaction_type not in ('credit_grant', 'storm_charge', 'refund', 'admin_adjustment') then
    raise exception 'invalid transaction_type: %', transaction_type
      using errcode = 'check_violation';
  end if;

  -- Lock the wallet row (or create it if missing) so concurrent charges can't race.
  select id, balance_credits into v_wallet_id, v_balance
  from public.wallets
  where user_id = target_user_id
  for update;

  if v_wallet_id is null then
    insert into public.wallets (user_id, balance_credits)
    values (target_user_id, 0)
    on conflict (user_id) do nothing;

    select id, balance_credits into v_wallet_id, v_balance
    from public.wallets
    where user_id = target_user_id
    for update;
  end if;

  v_new_balance := v_balance + amount;

  if v_new_balance < 0 then
    raise exception 'insufficient_credits: balance % cannot absorb adjustment %', v_balance, amount
      using errcode = 'check_violation';
  end if;

  -- lifetime_spent tracks NET credits actually consumed: a charge (amount < 0)
  -- adds to it, and a refund (positive 'refund' txn) reverses the corresponding
  -- charge so it must subtract. Floor at 0 so it can never go negative.
  update public.wallets
  set balance_credits = v_new_balance,
      lifetime_spent_credits = greatest(
        0,
        lifetime_spent_credits + (
          case
            when amount < 0 then -amount
            when transaction_type = 'refund' then -amount
            else 0
          end
        )
      )
  where id = v_wallet_id;

  insert into public.wallet_transactions
    (user_id, wallet_id, type, amount_credits, balance_after, description, storm_id, created_by)
  values
    (target_user_id, v_wallet_id, transaction_type, amount, v_new_balance, description, storm_id, actor_user_id);

  return v_new_balance;
end;
$$;

-- Only the service role may move credits.
revoke all on function public.adjust_wallet_balance(uuid, integer, text, text, text, uuid) from public;
revoke all on function public.adjust_wallet_balance(uuid, integer, text, text, text, uuid) from anon, authenticated;
grant execute on function public.adjust_wallet_balance(uuid, integer, text, text, text, uuid) to service_role;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.storm_runs          enable row level security;
alter table public.pricing_rules       enable row level security;

-- profiles: read own row, admins read all. No client writes.
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- wallets: read own, admins read all. No client writes.
drop policy if exists wallets_select_self_or_admin on public.wallets;
create policy wallets_select_self_or_admin on public.wallets
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- wallet_transactions: read own, admins read all. No client writes.
drop policy if exists wallet_tx_select_self_or_admin on public.wallet_transactions;
create policy wallet_tx_select_self_or_admin on public.wallet_transactions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- storm_runs: read own, admins read all. No client writes.
drop policy if exists storm_runs_select_self_or_admin on public.storm_runs;
create policy storm_runs_select_self_or_admin on public.storm_runs
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- pricing_rules: any authenticated user may read the pricing (to show a quote).
-- Only admins mutate, and only through the backend/service role.
drop policy if exists pricing_rules_select_all on public.pricing_rules;
create policy pricing_rules_select_all on public.pricing_rules
  for select to authenticated
  using (true);

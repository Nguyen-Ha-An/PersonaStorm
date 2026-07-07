-- ============================================================================
-- Activation: raise the one-time signup grant so a new user never hits the
-- credit wall on their first real run (any persona count, with margin).
--
-- Mirrors DEMO_SIGNUP_CREDITS (= 2 x the credit cost of a 1200-persona run) in
-- apps/web/lib/server/demo.ts. Keep the two in sync if the price table changes.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_starter constant integer := 240;
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

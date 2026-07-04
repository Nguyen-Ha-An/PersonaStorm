# Supabase

Commit database migrations under:

```text
supabase/migrations/*.sql
```

## SaaS schema

`20260704090000_saas_core.sql` provisions the dashboard SaaS layer:

- `profiles`, `wallets`, `wallet_transactions`, `storm_runs`, `pricing_rules`
- Row Level Security on every table (users read only their own rows; admins read all; **no client-side writes**)
- `is_admin()`, an `updated_at` trigger, a `handle_new_user` trigger (provisions profile + wallet + 100 starter credits on signup)
- `adjust_wallet_balance(...)` — the atomic, row-locking wallet mutation RPC. `EXECUTE` is revoked from `anon`/`authenticated`; only the service role (backend) can move credits.
- One seeded active pricing rule (10 base / 5 per 100 personas / 5 analyst report)

See `docs/deployment.md` for the full setup, backend/frontend env vars, and the admin bootstrap.

The GitHub Actions deploy workflow checks this directory on every push to `main`.

- If migration SQL files exist, it links to the remote Supabase project using `SUPABASE_PROJECT_ID` and runs `supabase db push`.
- If no migration SQL files exist, it skips the Supabase deploy step safely.

Required GitHub Actions secrets when migrations exist:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

Create a migration locally with:

```bash
supabase migration new <migration_name>
```

Then add SQL to the generated file and commit it.

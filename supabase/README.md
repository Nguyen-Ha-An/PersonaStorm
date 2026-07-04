# Supabase

Commit database migrations under:

```text
supabase/migrations/*.sql
```

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

# Auth redirect troubleshooting: "confirmation email goes to localhost"

**Symptom:** clicking a Supabase confirmation email lands on
`http://localhost:3000/#access_token=...` instead of the production domain
`https://personastorm.nguyenhaan.id.vn`.

> ⚠️ **Security:** those confirmation URLs contain `access_token` and
> `refresh_token`. Never paste, log, screenshot, or commit them. If any have
> leaked, **revoke the affected user's sessions** (Supabase Dashboard →
> Authentication → Users → the user → *Sign out* / *Revoke sessions*) and only
> send a fresh confirmation email **after** the fix below is verified.

---

## What the symptom proves

The tokens land at the **root path** (`/`) of `http://localhost:3000`, in the
URL **hash** (`#access_token=`). That is the exact signature of Supabase using
its project **Site URL** as the redirect target:

- If the app's `emailRedirectTo` (`https://personastorm.nguyenhaan.id.vn/auth/callback`)
  had been honored, the link would land on **`/auth/callback`**, not the root.
- Landing on the **root** of **localhost** means Supabase fell back to its
  **Site URL**, which is still `http://localhost:3000`.

Supabase falls back to the Site URL when the `emailRedirectTo` value is **not in
the project's Redirect URLs allow-list**, or when the email template builds the
link from `{{ .SiteURL }}` directly. **This is dashboard configuration — not app
code.** The app code has been verified (below) to never emit a localhost
redirect in production.

---

## Prove it on your deployment: `/api/debug/auth-config`

The app ships a safe, token-free debug endpoint that reports exactly what the
**deployed build** resolves its auth URLs to.

Enable it (production only — it is disabled by default):

1. Set an `AUTH_DEBUG_SECRET` GitHub secret (any random string). It is synced to
   Vercel on the next deploy.
2. Redeploy, then:

```bash
curl -H "x-debug-secret: <your-secret>" \
  https://personastorm.nguyenhaan.id.vn/api/debug/auth-config
```

Interpretation:

| Field | Healthy value | Meaning if wrong |
|---|---|---|
| `site_url_origin` | `https://personastorm.nguyenhaan.id.vn` | If localhost → the **build/env** is misconfigured (set `NEXT_PUBLIC_SITE_URL`), returns HTTP 500 |
| `auth_callback_origin` | `https://personastorm.nguyenhaan.id.vn` | same |
| `uses_localhost` | `false` | `true` → HTTP 500, env/build problem |
| `safe_for_auth_email_redirect` | `true` | `false` → do not send auth emails yet |
| `commit_sha` | matches the latest `main` commit | mismatch → Vercel is serving a **stale build** |
| `deployed_at` | recent | stale → old build |

**If `uses_localhost` is `false` and `safe_for_auth_email_redirect` is `true`,
the deployed app code is correct** and the localhost redirect is coming from
Supabase dashboard config, an email template, or an old email link — see below.

(In non-production the endpoint is open and will report `uses_localhost: true`,
which is normal for local dev.)

---

## The two external causes (Supabase dashboard) — check these manually

The app cannot read or change your Supabase dashboard. These must be fixed
there, and they are the most likely root cause.

### 1. Authentication → URL Configuration

**Site URL** must be the production domain — **not** localhost:

```text
Site URL = https://personastorm.nguyenhaan.id.vn
```

**Redirect URLs** (allow-list) must include every origin+path the app sends as
`emailRedirectTo` / `redirectTo`, or Supabase silently ignores them and falls
back to the Site URL:

```text
https://personastorm.nguyenhaan.id.vn/**
https://personastorm.nguyenhaan.id.vn/auth/callback
https://personastorm.nguyenhaan.id.vn/auth/confirm
https://personastorm.nguyenhaan.id.vn/auth/reset-password
https://persona-storm.vercel.app/**
http://localhost:3000/**
```

`http://localhost:3000/**` may stay for local development — but it must **not**
be the **Site URL**, and it must not be the production redirect target.

### 2. Authentication → Email Templates

Open **Confirm signup**, **Magic Link**, and **Reset Password** and search each
for `localhost`, `http://localhost:3000`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`,
`{{ .ConfirmationURL }}`.

- **Preferred (default flow)** — let Supabase verify, then redirect to the
  `emailRedirectTo` the app already passes:

  ```html
  <a href="{{ .ConfirmationURL }}">Confirm email address</a>
  ```

- **Custom token_hash flow** (this app also supports `/auth/confirm`):

  ```html
  <a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
    Confirm email address
  </a>
  ```

  > Note: this app's `/auth/confirm` page documents using `{{ .SiteURL }}` for
  > this flow (not `{{ .RedirectTo }}`, which nests to
  > `/auth/callback/auth/confirm`). **Only** use `{{ .SiteURL }}` here if the
  > Site URL is the production domain — if Site URL is stale/localhost, this
  > flow breaks too. Fixing the Site URL (step 1) is what makes it safe.

- **Never** hardcode `http://localhost:3000` in a template. **Never** use
  `{{ .SiteURL }}/...` while the Site URL might be localhost — that is the exact
  configuration that produces the observed root-localhost redirect.

---

## Old email links (the false-negative trap)

A confirmation email generated **before** the fix keeps whatever redirect it was
minted with — clicking it later still goes to localhost even after everything
is fixed. **An old email is not proof the fix failed.**

Always test with a **brand-new** email generated **after** the fix.

---

## Verification protocol (do in order)

1. Deploy the latest `main` to production.
2. `curl -H "x-debug-secret: <secret>" https://personastorm.nguyenhaan.id.vn/api/debug/auth-config`
3. Confirm `safe_for_auth_email_redirect: true`.
4. Confirm `uses_localhost: false`.
5. Confirm `site_url_origin: https://personastorm.nguyenhaan.id.vn`.
6. Confirm `commit_sha` matches the latest `main` (rules out a stale build).
7. In the Supabase dashboard, confirm **Site URL** and **email templates**
   (sections above) — the app cannot do this for you.
8. **Revoke the affected user's leaked sessions** and log them out everywhere.
9. Trigger a **brand-new** signup or "resend confirmation". Do **not** click any
   older email.
10. Click the **newest** email and confirm it lands on
    `https://personastorm.nguyenhaan.id.vn/auth/callback` (or `/auth/confirm`),
    then `/dashboard`.

Do not consider this resolved until step 10 passes with a fresh email.

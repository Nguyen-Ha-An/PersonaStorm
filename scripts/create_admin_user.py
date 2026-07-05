#!/usr/bin/env python3
"""Create (or promote) the first PersonaStorm admin user.

Uses the Supabase Auth Admin API + PostgREST with the SERVICE ROLE key. Run
this once after the database migrations have been applied.

Required environment variables:

    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service role key>   # secret — server-side only
    ADMIN_EMAIL=you@example.com
    ADMIN_PASSWORD=<strong password>
    ADMIN_FULL_NAME=PersonaStorm Admin            # optional

Behavior (idempotent):
    * creates the auth user if it does not exist (email pre-confirmed)
    * ensures a profile row exists and sets role = 'admin'
    * ensures a wallet exists and, on first creation, grants 10000 credits
      (recorded as a wallet_transactions row via adjust_wallet_balance)
    * prints a clear success/failure line and NEVER prints any secret

    python scripts/create_admin_user.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ADMIN_GRANT = 10_000


def _fail(msg: str) -> "None":
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def _request(method: str, url: str, key: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode() or "null"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:  # non-2xx
        raw = exc.read().decode()
        try:
            parsed: object = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
        return exc.code, parsed
    except urllib.error.URLError as exc:
        _fail(f"Could not reach Supabase at {url}: {exc.reason}")
        raise  # unreachable


def _find_user_id_by_email(base: str, key: str, email: str) -> str | None:
    # The trigger writes a profile row (with email) at signup, so PostgREST is
    # the simplest way to resolve an existing user id.
    status, rows = _request(
        "GET",
        f"{base}/rest/v1/profiles?email=eq.{urllib.parse.quote(email, safe='')}&select=id&limit=1",
        key,
    )
    if status < 300 and isinstance(rows, list) and rows:
        return rows[0]["id"]
    # Fallback: scan the auth admin user list.
    status, payload = _request("GET", f"{base}/auth/v1/admin/users?per_page=200", key)
    if status < 300 and isinstance(payload, dict):
        for user in payload.get("users", []):
            if (user.get("email") or "").lower() == email.lower():
                return user.get("id")
    return None


def main() -> None:
    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    email = os.environ.get("ADMIN_EMAIL") or ""
    password = os.environ.get("ADMIN_PASSWORD") or ""
    full_name = os.environ.get("ADMIN_FULL_NAME") or "PersonaStorm Admin"

    missing = [
        name
        for name, val in (
            ("SUPABASE_URL", base),
            ("SUPABASE_SERVICE_ROLE_KEY", key),
            ("ADMIN_EMAIL", email),
            ("ADMIN_PASSWORD", password),
        )
        if not val
    ]
    if missing:
        _fail(f"Missing required environment variables: {', '.join(missing)}")

    # The service role key rides in these requests — refuse plaintext transport
    # (http://localhost is fine for a local Supabase stack).
    if not (base.startswith("https://") or base.startswith("http://localhost") or base.startswith("http://127.0.0.1")):
        _fail("SUPABASE_URL must be https:// (or a local http://localhost stack).")

    print(f"→ Bootstrapping admin for {email} on {base}")

    # 1) Create the auth user (email pre-confirmed) — or detect that it exists.
    created = False
    status, payload = _request(
        "POST",
        f"{base}/auth/v1/admin/users",
        key,
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        },
    )
    if status in (200, 201) and isinstance(payload, dict) and payload.get("id"):
        user_id = payload["id"]
        created = True
        print("  • created new auth user")
    else:
        # Already exists (or a benign conflict) — resolve the id.
        user_id = _find_user_id_by_email(base, key, email)
        if not user_id:
            detail = payload if isinstance(payload, str) else json.dumps(payload)
            _fail(f"Could not create or find the admin user (HTTP {status}): {detail}")
        print("  • auth user already exists")

    # 2) Ensure the profile exists and is an admin (UPSERT on id via the
    #    merge-duplicates resolution, so role + full_name are set either way).
    up_req = urllib.request.Request(
        f"{base}/rest/v1/profiles?on_conflict=id",
        data=json.dumps(
            {"id": user_id, "email": email, "full_name": full_name, "role": "admin"}
        ).encode(),
        method="POST",
    )
    up_req.add_header("apikey", key)
    up_req.add_header("Authorization", f"Bearer {key}")
    up_req.add_header("Content-Type", "application/json")
    up_req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(up_req, timeout=30) as resp:
            if resp.status >= 300:
                _fail(f"Failed to set admin role (HTTP {resp.status})")
    except urllib.error.HTTPError as exc:
        _fail(f"Failed to set admin role (HTTP {exc.code}): {exc.read().decode()}")
    print("  • profile role set to admin")

    # 3) On first creation, grant the admin credit balance atomically.
    if created:
        status, payload = _request(
            "POST",
            f"{base}/rest/v1/rpc/adjust_wallet_balance",
            key,
            {
                "target_user_id": user_id,
                "amount": ADMIN_GRANT,
                "transaction_type": "credit_grant",
                "description": "Admin bootstrap grant",
                "actor_user_id": user_id,
            },
        )
        if status >= 300:
            detail = payload if isinstance(payload, str) else json.dumps(payload)
            _fail(f"Failed to grant admin credits (HTTP {status}): {detail}")
        print(f"  • granted {ADMIN_GRANT} credits (new balance: {payload})")
    else:
        print("  • existing user — skipped credit grant (no double-grant)")

    print(f"✅ Admin ready: {email} (role=admin)")


if __name__ == "__main__":
    main()

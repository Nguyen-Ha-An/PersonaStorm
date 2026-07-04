"""Supabase data-access gateway.

Two interchangeable implementations behind one Protocol:

  * HttpSupabaseGateway  — talks to a real Supabase project over PostgREST /
                           RPC using the service role key (server-side only).
  * InMemorySupabaseGateway — a faithful in-process simulation used for the
                           test suite AND as a local-dev fallback when Supabase
                           env vars are unset, so the whole app works end-to-end
                           without a live Supabase.

Why a gateway at all: the frontend must never mutate wallet balances, so ALL
billing/ownership writes go through the backend. Centralizing them here keeps
the atomic-charge logic (adjust_wallet_balance) in exactly one place and makes
it trivially testable.
"""

from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable

import httpx

from ..config import Settings
from .billing import PricingRule
from .errors import InsufficientCreditsError, SupabaseError

_TXN_TYPES = {"credit_grant", "storm_charge", "refund", "admin_adjustment"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@runtime_checkable
class SupabaseGateway(Protocol):
    async def ensure_and_get_profile(
        self, user_id: str, email: str, full_name: str | None
    ) -> dict[str, Any]: ...

    async def get_profile(self, user_id: str) -> dict[str, Any] | None: ...

    async def get_wallet(self, user_id: str) -> dict[str, Any]: ...

    async def list_transactions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]: ...

    async def adjust_wallet(
        self,
        user_id: str,
        amount: int,
        transaction_type: str,
        description: str | None = None,
        storm_id: str | None = None,
        actor_user_id: str | None = None,
    ) -> int: ...

    async def get_active_pricing(self) -> dict[str, Any] | None: ...

    async def update_active_pricing(
        self,
        *,
        base_run_credits: int,
        credits_per_100_personas: int,
        analyst_report_credits: int,
        name: str,
    ) -> dict[str, Any]: ...

    async def record_storm(self, row: dict[str, Any]) -> None: ...

    async def update_storm(self, storm_id: str, fields: dict[str, Any]) -> None: ...

    async def get_storm(self, storm_id: str) -> dict[str, Any] | None: ...

    async def list_user_storms(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]: ...

    # admin ----------------------------------------------------------------
    async def admin_list_users(self, search: str | None = None) -> list[dict[str, Any]]: ...

    async def admin_get_user(self, user_id: str) -> dict[str, Any] | None: ...

    async def set_role(self, user_id: str, role: str) -> None: ...

    async def admin_list_storms(self, limit: int = 100) -> list[dict[str, Any]]: ...

    async def count_admins(self) -> int: ...


# ===========================================================================
# In-memory implementation (tests + local dev fallback)
# ===========================================================================
class InMemorySupabaseGateway:
    """Non-persistent gateway. Mirrors the SQL semantics closely enough for
    tests and local development, including the atomic non-negative charge."""

    def __init__(self, starter_credits: int = 100):
        self.starter_credits = starter_credits
        self._profiles: dict[str, dict[str, Any]] = {}
        self._wallets: dict[str, dict[str, Any]] = {}
        self._transactions: list[dict[str, Any]] = []
        self._storms: dict[str, dict[str, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._pricing: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "name": "Default",
            "is_active": True,
            "base_run_credits": 10,
            "credits_per_100_personas": 5,
            "analyst_report_credits": 5,
            "created_at": _now(),
            "updated_at": _now(),
        }

    # -- provisioning ------------------------------------------------------
    async def ensure_and_get_profile(
        self, user_id: str, email: str, full_name: str | None
    ) -> dict[str, Any]:
        prof = self._profiles.get(user_id)
        if prof is None:
            prof = {
                "id": user_id,
                "email": email,
                "full_name": full_name,
                "role": "user",
                "created_at": _now(),
                "updated_at": _now(),
            }
            self._profiles[user_id] = prof
            # provision wallet + starter grant (mirrors handle_new_user())
            wallet = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "balance_credits": self.starter_credits,
                "lifetime_spent_credits": 0,
                "created_at": _now(),
                "updated_at": _now(),
            }
            self._wallets[user_id] = wallet
            self._transactions.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "wallet_id": wallet["id"],
                    "type": "credit_grant",
                    "amount_credits": self.starter_credits,
                    "balance_after": self.starter_credits,
                    "description": "Starter credits",
                    "storm_id": None,
                    "created_by": user_id,
                    "created_at": _now(),
                }
            )
        else:
            # keep email/full_name fresh
            if email:
                prof["email"] = email
            if full_name and not prof.get("full_name"):
                prof["full_name"] = full_name
        return dict(prof)

    async def get_profile(self, user_id: str) -> dict[str, Any] | None:
        prof = self._profiles.get(user_id)
        return dict(prof) if prof else None

    async def get_wallet(self, user_id: str) -> dict[str, Any]:
        wallet = self._wallets.get(user_id)
        if wallet is None:
            wallet = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "balance_credits": 0,
                "lifetime_spent_credits": 0,
                "created_at": _now(),
                "updated_at": _now(),
            }
            self._wallets[user_id] = wallet
        return dict(wallet)

    async def list_transactions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = [t for t in self._transactions if t["user_id"] == user_id]
        rows.sort(key=lambda t: t["created_at"], reverse=True)
        return [dict(r) for r in rows[:limit]]

    async def adjust_wallet(
        self,
        user_id: str,
        amount: int,
        transaction_type: str,
        description: str | None = None,
        storm_id: str | None = None,
        actor_user_id: str | None = None,
    ) -> int:
        if transaction_type not in _TXN_TYPES:
            raise SupabaseError(f"invalid transaction_type: {transaction_type}")
        async with self._locks[user_id]:
            wallet = self._wallets.get(user_id)
            if wallet is None:
                wallet = await self.get_wallet(user_id)
                self._wallets[user_id] = wallet
            balance = wallet["balance_credits"]
            new_balance = balance + amount
            if new_balance < 0:
                raise InsufficientCreditsError(balance=balance, needed=-amount)
            wallet["balance_credits"] = new_balance
            # Mirror adjust_wallet_balance(): a charge adds to lifetime_spent, a
            # refund reverses it. Floor at 0. (Kept in sync with the SQL RPC.)
            if amount < 0:
                spent_delta = -amount
            elif transaction_type == "refund":
                spent_delta = -amount
            else:
                spent_delta = 0
            wallet["lifetime_spent_credits"] = max(
                0, wallet["lifetime_spent_credits"] + spent_delta
            )
            wallet["updated_at"] = _now()
            self._transactions.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "wallet_id": wallet["id"],
                    "type": transaction_type,
                    "amount_credits": amount,
                    "balance_after": new_balance,
                    "description": description,
                    "storm_id": storm_id,
                    "created_by": actor_user_id,
                    "created_at": _now(),
                }
            )
            return new_balance

    # -- pricing -----------------------------------------------------------
    async def get_active_pricing(self) -> dict[str, Any] | None:
        return dict(self._pricing)

    async def update_active_pricing(
        self,
        *,
        base_run_credits: int,
        credits_per_100_personas: int,
        analyst_report_credits: int,
        name: str,
    ) -> dict[str, Any]:
        self._pricing.update(
            {
                "name": name,
                "base_run_credits": base_run_credits,
                "credits_per_100_personas": credits_per_100_personas,
                "analyst_report_credits": analyst_report_credits,
                "updated_at": _now(),
            }
        )
        return dict(self._pricing)

    # -- storms ------------------------------------------------------------
    async def record_storm(self, row: dict[str, Any]) -> None:
        self._storms[row["id"]] = {**row}

    async def update_storm(self, storm_id: str, fields: dict[str, Any]) -> None:
        if storm_id in self._storms:
            self._storms[storm_id].update(fields)

    async def get_storm(self, storm_id: str) -> dict[str, Any] | None:
        row = self._storms.get(storm_id)
        return dict(row) if row else None

    async def list_user_storms(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = [s for s in self._storms.values() if s["user_id"] == user_id]
        rows.sort(key=lambda s: s.get("created_at", ""), reverse=True)
        return [dict(r) for r in rows[:limit]]

    # -- admin -------------------------------------------------------------
    async def admin_list_users(self, search: str | None = None) -> list[dict[str, Any]]:
        out = []
        for prof in self._profiles.values():
            if search:
                needle = search.lower()
                hay = f"{prof.get('email','')} {prof.get('full_name','') or ''}".lower()
                if needle not in hay:
                    continue
            out.append(self._user_summary(prof))
        out.sort(key=lambda u: u.get("created_at", ""), reverse=True)
        return out

    async def admin_get_user(self, user_id: str) -> dict[str, Any] | None:
        prof = self._profiles.get(user_id)
        if not prof:
            return None
        summary = self._user_summary(prof)
        summary["recent_transactions"] = await self.list_transactions(user_id, limit=20)
        summary["recent_storms"] = await self.list_user_storms(user_id, limit=20)
        return summary

    def _user_summary(self, prof: dict[str, Any]) -> dict[str, Any]:
        uid = prof["id"]
        wallet = self._wallets.get(uid)
        storms = [s for s in self._storms.values() if s["user_id"] == uid]
        total_spent = sum(
            s.get("price_credits", 0) for s in storms if s.get("status") != "failed"
        )
        return {
            "id": uid,
            "email": prof.get("email"),
            "full_name": prof.get("full_name"),
            "role": prof.get("role", "user"),
            "created_at": prof.get("created_at"),
            "balance_credits": wallet["balance_credits"] if wallet else 0,
            "lifetime_spent_credits": wallet["lifetime_spent_credits"] if wallet else 0,
            "total_storms": len(storms),
            "total_spent_credits": total_spent,
        }

    async def set_role(self, user_id: str, role: str) -> None:
        if user_id in self._profiles:
            self._profiles[user_id]["role"] = role
            self._profiles[user_id]["updated_at"] = _now()

    async def admin_list_storms(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = list(self._storms.values())
        rows.sort(key=lambda s: s.get("created_at", ""), reverse=True)
        out = []
        for s in rows[:limit]:
            prof = self._profiles.get(s["user_id"], {})
            out.append({**s, "user_email": prof.get("email")})
        return out

    async def count_admins(self) -> int:
        return sum(1 for p in self._profiles.values() if p.get("role") == "admin")


# ===========================================================================
# HTTP implementation (real Supabase, service role)
# ===========================================================================
class HttpSupabaseGateway:
    """PostgREST + RPC client using the service role key. Server-side only —
    the service role bypasses RLS, so this must never be exposed to a browser."""

    def __init__(self, settings: Settings):
        self._base = settings.supabase_url.rstrip("/")
        self._key = settings.supabase_service_role_key
        self._rest = f"{self._base}/rest/v1"
        self._client = httpx.AsyncClient(timeout=15.0)

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            resp = await self._client.get(
                f"{self._rest}/{path}", params=params, headers=self._headers()
            )
        except httpx.HTTPError as exc:  # connect/read/timeout — treat as backend down
            raise SupabaseError(f"GET {path} transport error: {exc}") from exc
        if resp.status_code >= 300:
            raise SupabaseError(f"GET {path} -> {resp.status_code}: {resp.text}")
        return resp.json()

    async def _mutate(
        self, method: str, path: str, *, params: dict[str, Any] | None = None,
        json: Any = None, prefer: str = "return=representation",
    ) -> list[dict[str, Any]]:
        try:
            resp = await self._client.request(
                method,
                f"{self._rest}/{path}",
                params=params,
                json=json,
                headers=self._headers({"Prefer": prefer}),
            )
        except httpx.HTTPError as exc:
            raise SupabaseError(f"{method} {path} transport error: {exc}") from exc
        if resp.status_code >= 300:
            raise SupabaseError(f"{method} {path} -> {resp.status_code}: {resp.text}")
        if resp.status_code == 204 or not resp.content:
            return []
        return resp.json()

    # -- provisioning ------------------------------------------------------
    async def ensure_and_get_profile(
        self, user_id: str, email: str, full_name: str | None
    ) -> dict[str, Any]:
        # The handle_new_user() trigger creates profile+wallet at signup; this
        # upsert self-heals a missing profile without touching the wallet
        # (so it can never re-grant starter credits).
        try:
            await self._mutate(
                "POST",
                "profiles",
                params={"on_conflict": "id"},
                json={"id": user_id, "email": email, "full_name": full_name},
                prefer="resolution=ignore-duplicates,return=minimal",
            )
        except SupabaseError:
            # best-effort self-heal; identity from the JWT is still valid
            pass
        prof = await self.get_profile(user_id)
        if prof is None:
            # extremely unlikely (upsert failed AND row absent) — synthesize
            return {"id": user_id, "email": email, "full_name": full_name, "role": "user"}
        return prof

    async def get_profile(self, user_id: str) -> dict[str, Any] | None:
        rows = await self._get("profiles", {"id": f"eq.{user_id}", "select": "*", "limit": 1})
        return rows[0] if rows else None

    async def get_wallet(self, user_id: str) -> dict[str, Any]:
        rows = await self._get("wallets", {"user_id": f"eq.{user_id}", "select": "*", "limit": 1})
        if rows:
            return rows[0]
        # Defensive: create an empty wallet (no starter grant — that's the
        # trigger's job) so downstream reads always have a wallet.
        created = await self._mutate(
            "POST", "wallets",
            params={"on_conflict": "user_id"},
            json={"user_id": user_id, "balance_credits": 0},
            prefer="resolution=ignore-duplicates,return=representation",
        )
        if created:
            return created[0]
        rows = await self._get("wallets", {"user_id": f"eq.{user_id}", "select": "*", "limit": 1})
        return rows[0] if rows else {
            "user_id": user_id, "balance_credits": 0, "lifetime_spent_credits": 0,
        }

    async def list_transactions(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        return await self._get(
            "wallet_transactions",
            {"user_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc", "limit": limit},
        )

    async def adjust_wallet(
        self,
        user_id: str,
        amount: int,
        transaction_type: str,
        description: str | None = None,
        storm_id: str | None = None,
        actor_user_id: str | None = None,
    ) -> int:
        try:
            resp = await self._client.post(
                f"{self._rest}/rpc/adjust_wallet_balance",
                headers=self._headers(),
                json={
                    "target_user_id": user_id,
                    "amount": amount,
                    "transaction_type": transaction_type,
                    "description": description,
                    "storm_id": storm_id,
                    "actor_user_id": actor_user_id,
                },
            )
        except httpx.HTTPError as exc:
            # Ambiguous outcome: the deduction MAY have committed server-side. We
            # surface it as SupabaseError (-> 502) so the caller does not treat a
            # transport failure as a definitive charge or a definitive no-charge.
            raise SupabaseError(f"adjust_wallet_balance transport error: {exc}") from exc
        if resp.status_code >= 300:
            body = resp.text
            if "insufficient_credits" in body:
                # We don't get the raw balance back from the RPC error; report
                # the amount that couldn't be covered.
                raise InsufficientCreditsError(balance=-1, needed=-amount if amount < 0 else amount)
            raise SupabaseError(f"adjust_wallet_balance -> {resp.status_code}: {body}")
        return int(resp.json())

    # -- pricing -----------------------------------------------------------
    async def get_active_pricing(self) -> dict[str, Any] | None:
        rows = await self._get(
            "pricing_rules",
            {"is_active": "eq.true", "select": "*", "order": "created_at.desc", "limit": 1},
        )
        return rows[0] if rows else None

    async def update_active_pricing(
        self,
        *,
        base_run_credits: int,
        credits_per_100_personas: int,
        analyst_report_credits: int,
        name: str,
    ) -> dict[str, Any]:
        current = await self.get_active_pricing()
        payload = {
            "name": name,
            "base_run_credits": base_run_credits,
            "credits_per_100_personas": credits_per_100_personas,
            "analyst_report_credits": analyst_report_credits,
        }
        if current:
            rows = await self._mutate(
                "PATCH", "pricing_rules", params={"id": f"eq.{current['id']}"}, json=payload
            )
        else:
            rows = await self._mutate(
                "POST", "pricing_rules", json={**payload, "is_active": True}
            )
        return rows[0] if rows else {**payload, "is_active": True}

    # -- storms ------------------------------------------------------------
    async def record_storm(self, row: dict[str, Any]) -> None:
        await self._mutate("POST", "storm_runs", json=row, prefer="return=minimal")

    async def update_storm(self, storm_id: str, fields: dict[str, Any]) -> None:
        await self._mutate(
            "PATCH", "storm_runs", params={"id": f"eq.{storm_id}"}, json=fields,
            prefer="return=minimal",
        )

    async def get_storm(self, storm_id: str) -> dict[str, Any] | None:
        rows = await self._get("storm_runs", {"id": f"eq.{storm_id}", "select": "*", "limit": 1})
        return rows[0] if rows else None

    async def list_user_storms(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        return await self._get(
            "storm_runs",
            {"user_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc", "limit": limit},
        )

    # -- admin -------------------------------------------------------------
    async def admin_list_users(self, search: str | None = None) -> list[dict[str, Any]]:
        profiles = await self._get("profiles", {"select": "*", "order": "created_at.desc"})
        wallets = await self._get("wallets", {"select": "user_id,balance_credits,lifetime_spent_credits"})
        storms = await self._get("storm_runs", {"select": "user_id,price_credits,status"})
        wallet_by_user = {w["user_id"]: w for w in wallets}
        storms_by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for s in storms:
            storms_by_user[s["user_id"]].append(s)

        out = []
        for prof in profiles:
            if search:
                needle = search.lower()
                hay = f"{prof.get('email','')} {prof.get('full_name','') or ''}".lower()
                if needle not in hay:
                    continue
            uid = prof["id"]
            w = wallet_by_user.get(uid, {})
            user_storms = storms_by_user.get(uid, [])
            out.append(
                {
                    "id": uid,
                    "email": prof.get("email"),
                    "full_name": prof.get("full_name"),
                    "role": prof.get("role", "user"),
                    "created_at": prof.get("created_at"),
                    "balance_credits": w.get("balance_credits", 0),
                    "lifetime_spent_credits": w.get("lifetime_spent_credits", 0),
                    "total_storms": len(user_storms),
                    "total_spent_credits": sum(
                        s.get("price_credits", 0) for s in user_storms if s.get("status") != "failed"
                    ),
                }
            )
        return out

    async def admin_get_user(self, user_id: str) -> dict[str, Any] | None:
        users = await self.admin_list_users()
        summary = next((u for u in users if u["id"] == user_id), None)
        if not summary:
            return None
        summary["recent_transactions"] = await self.list_transactions(user_id, limit=20)
        summary["recent_storms"] = await self.list_user_storms(user_id, limit=20)
        return summary

    async def set_role(self, user_id: str, role: str) -> None:
        await self._mutate(
            "PATCH", "profiles", params={"id": f"eq.{user_id}"}, json={"role": role},
            prefer="return=minimal",
        )

    async def admin_list_storms(self, limit: int = 100) -> list[dict[str, Any]]:
        # NOTE: storm_runs.user_id and profiles.id both reference auth.users, but
        # there is no direct FK between storm_runs and profiles, so PostgREST
        # cannot embed `profiles(email)`. Resolve the emails with a second query.
        storms = await self._get(
            "storm_runs",
            {"select": "*", "order": "created_at.desc", "limit": limit},
        )
        if not storms:
            return []
        user_ids = sorted({s["user_id"] for s in storms})
        id_list = ",".join(user_ids)
        profiles = await self._get(
            "profiles", {"id": f"in.({id_list})", "select": "id,email"}
        )
        email_by_id = {p["id"]: p.get("email") for p in profiles}
        for s in storms:
            s["user_email"] = email_by_id.get(s["user_id"])
        return storms

    async def count_admins(self) -> int:
        try:
            resp = await self._client.get(
                f"{self._rest}/profiles",
                params={"role": "eq.admin", "select": "id"},
                headers=self._headers({"Prefer": "count=exact"}),
            )
        except httpx.HTTPError as exc:
            raise SupabaseError(f"count_admins transport error: {exc}") from exc
        if resp.status_code >= 300:
            raise SupabaseError(f"count_admins -> {resp.status_code}: {resp.text}")
        # Content-Range: 0-4/5  -> total after the slash
        content_range = resp.headers.get("content-range", "")
        if "/" in content_range:
            try:
                return int(content_range.split("/")[-1])
            except ValueError:
                pass
        return len(resp.json())


def build_gateway(settings: Settings) -> SupabaseGateway:
    """Pick the gateway: real Supabase when configured, else in-memory."""
    if settings.supabase_configured:
        return HttpSupabaseGateway(settings)
    return InMemorySupabaseGateway(starter_credits=settings.starter_credits)


async def get_pricing_rule(gateway: SupabaseGateway) -> PricingRule:
    """Fetch the active pricing rule (falls back to defaults if none)."""
    row = await gateway.get_active_pricing()
    return PricingRule.from_row(row)

"""Authentication & authorization for the SaaS API.

We trust ONLY the Supabase-issued access token (a JWT), never a user_id sent by
the client. The token arrives either as an `Authorization: Bearer <jwt>` header
or, for the SSE stream endpoint (EventSource cannot set headers), as an
`?access_token=<jwt>` query parameter.

Verification path (documented tradeoff):
  * Primary — verify the HS256 signature with SUPABASE_JWT_SECRET (offline,
    no network round-trip). This is Supabase's standard token-verification
    method.
  * Dev fallback — if SUPABASE_JWT_SECRET is unset AND the API is not running
    in prod, we decode the token WITHOUT signature verification so local
    development against a dev Supabase (or the in-memory gateway) still works.
    In prod a missing secret is a hard 401 — we never accept unverified tokens
    in production.

NOTE (reference service only): this module supports the legacy shared-secret
HS256 verification path only. Supabase projects that use the modern asymmetric
JWT signing keys (ES256/RS256) issue tokens this offline verifier cannot check,
so the reference API would 401 them. That is intentional here — apps/api is
local/dev/reference only. The PRODUCTION path is the Next.js Route Handlers in
apps/web/lib/server/supabaseAdmin.ts (verifyAccessToken), which is
algorithm-aware and validates asymmetric-signed tokens remotely via GoTrue.
"""

from __future__ import annotations

import logging

import jwt
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel

from .config import Settings, get_settings
from .services.supabase_gateway import SupabaseGateway

logger = logging.getLogger("personastorm.auth")


class CurrentUser(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str = "user"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def get_gateway(request: Request) -> SupabaseGateway:
    return request.app.state.gateway


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    # SSE / EventSource can't set headers — accept the token as a query param,
    # but ONLY on the stream endpoint. A token that leaks into a reverse-proxy
    # access log / browser history / Referer via the stream URL must not be
    # replayable against any other endpoint, so we refuse query-string tokens
    # everywhere else and require the Authorization header there.
    if request.url.path.endswith("/stream"):
        token = request.query_params.get("access_token")
        return token.strip() if token else None
    return None


def _decode_token(token: str, settings: Settings) -> dict:
    secret = settings.supabase_jwt_secret
    if secret:
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True},
            )
        except jwt.PyJWTError as exc:
            logger.info("JWT verification failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session token.",
            ) from exc

    # No JWT secret configured. The unverified dev fallback below is only safe
    # when we are NOT talking to a real Supabase (in-memory gateway) AND not in
    # prod. If real Supabase creds are present, accepting an unverified token
    # would let anyone forge `sub` and read another user's authoritative role
    # from the live DB — so we refuse. This decouples the fallback from a single
    # easy-to-miss flag (API_ENV) and fails safe on a misconfigured deploy.
    if settings.api_env == "prod" or settings.supabase_configured:
        logger.error(
            "SUPABASE_JWT_SECRET is not set but auth is required "
            "(supabase configured or prod) — refusing to accept tokens."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Auth is not configured on the server (missing SUPABASE_JWT_SECRET).",
        )
    # Dev fallback (in-memory gateway, non-prod only): decode without verifying.
    try:
        return jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed session token.",
        ) from exc


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
    gateway: SupabaseGateway = Depends(get_gateway),
) -> CurrentUser:
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = _decode_token(token, settings)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has no subject.",
        )
    email = claims.get("email") or ""
    meta = claims.get("user_metadata") or {}
    full_name = meta.get("full_name")

    # Ensure the profile/wallet exist and read the authoritative role.
    try:
        profile = await gateway.ensure_and_get_profile(user_id, email, full_name)
    except Exception:  # noqa: BLE001 — never 500 on a self-heal failure
        logger.exception("ensure_and_get_profile failed for %s", user_id)
        profile = {"id": user_id, "email": email, "full_name": full_name, "role": "user"}

    return CurrentUser(
        id=user_id,
        email=profile.get("email") or email,
        full_name=profile.get("full_name") or full_name,
        role=profile.get("role", "user"),
    )


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user

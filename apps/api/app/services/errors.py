"""Domain errors for auth, billing and Supabase access.

Routers translate these into HTTP responses (see routers/*). Keeping them here
means the service layer never imports FastAPI.
"""

from __future__ import annotations


class SupabaseError(RuntimeError):
    """A Supabase/PostgREST call failed unexpectedly."""


class InsufficientCreditsError(Exception):
    """A wallet adjustment would drive the balance below zero."""

    def __init__(self, balance: int, needed: int):
        self.balance = balance
        self.needed = needed
        super().__init__(
            f"Insufficient credits: balance {balance} cannot cover {needed} credits."
        )


class AuthError(Exception):
    """Authentication failed (missing/invalid token)."""


class ForbiddenError(Exception):
    """Authenticated, but not allowed to perform this action."""

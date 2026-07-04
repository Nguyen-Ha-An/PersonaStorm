"""Billing, wallet, ownership and admin tests.

Covers: pricing formula, atomic non-negative charge, insufficient-balance 402,
successful charge, storm ownership isolation, and admin authorization + admin
management flows. Runs entirely on the in-memory Supabase gateway (no live
Supabase needed) with the auth override from conftest.
"""

import asyncio

import pytest

from app.services.billing import PricingRule, quote_price
from app.services.errors import InsufficientCreditsError
from app.services.supabase_gateway import InMemorySupabaseGateway

from .conftest import create_payload


# --------------------------------------------------------------------------- #
# Pricing formula (pure)                                                        #
# --------------------------------------------------------------------------- #
def test_pricing_formula_reference_points():
    rule = PricingRule()  # defaults: 10 / 5 / 5
    assert quote_price(rule, 100).total_credits == 20
    assert quote_price(rule, 250).total_credits == 30
    assert quote_price(rule, 500).total_credits == 40
    assert quote_price(rule, 1000).total_credits == 65


def test_pricing_excludes_analyst_when_not_requested():
    rule = PricingRule()
    q = quote_price(rule, 100, include_analyst_report=False)
    assert q.total_credits == 15  # 10 + 5 + 0
    assert q.analyst_report_credits == 0


def test_pricing_rounds_persona_blocks_up():
    rule = PricingRule()
    # 101 personas rounds up to 2 blocks -> 10 + 2*5 + 5 = 25
    assert quote_price(rule, 101).total_credits == 25


# --------------------------------------------------------------------------- #
# Atomic wallet mutation (in-memory gateway == SQL semantics)                   #
# --------------------------------------------------------------------------- #
def test_wallet_cannot_go_negative():
    gw = InMemorySupabaseGateway(starter_credits=50)

    async def run():
        await gw.ensure_and_get_profile("u1", "e@x", "n")  # 50 starter
        assert await gw.adjust_wallet("u1", -30, "storm_charge") == 20
        with pytest.raises(InsufficientCreditsError):
            await gw.adjust_wallet("u1", -30, "storm_charge")
        w = await gw.get_wallet("u1")
        assert w["balance_credits"] == 20  # rejected charge left it untouched
        assert w["lifetime_spent_credits"] == 30

    asyncio.run(run())


def test_concurrent_charges_never_oversell():
    """The FOR UPDATE lock (here an asyncio.Lock) must serialize charges so the
    balance never oversells under concurrency."""
    gw = InMemorySupabaseGateway(starter_credits=100)

    async def run():
        await gw.ensure_and_get_profile("u1", "e@x", "n")

        async def charge():
            try:
                await gw.adjust_wallet("u1", -30, "storm_charge")
                return True
            except InsufficientCreditsError:
                return False

        results = await asyncio.gather(*[charge() for _ in range(10)])
        w = await gw.get_wallet("u1")
        assert w["balance_credits"] >= 0
        assert sum(results) == 3          # only three 30-credit charges fit in 100
        assert w["balance_credits"] == 10

    asyncio.run(run())


# --------------------------------------------------------------------------- #
# Charging through the API                                                      #
# --------------------------------------------------------------------------- #
def test_successful_charge_decrements_wallet(client):
    assert client.get("/api/wallet").json()["balance_credits"] == 100
    r = client.post("/api/storm/create", json=create_payload(persona_count=100))
    assert r.status_code == 200, r.text
    assert r.json()["price_credits"] == 20
    assert r.json()["wallet_balance_after"] == 80

    assert client.get("/api/wallet").json()["balance_credits"] == 80
    txns = client.get("/api/wallet/transactions").json()
    assert any(t["type"] == "storm_charge" and t["amount_credits"] == -20 for t in txns)
    assert any(t["type"] == "credit_grant" and t["amount_credits"] == 100 for t in txns)


def test_insufficient_credits_blocks_run(client):
    # 1200 personas -> 10 + 12*5 + 5 = 75 credits
    r1 = client.post("/api/storm/create", json=create_payload(persona_count=1200))
    assert r1.status_code == 200, r1.text
    assert r1.json()["price_credits"] == 75
    assert r1.json()["wallet_balance_after"] == 25

    # A second identical run costs 75 but only 25 remain -> 402, no charge.
    r2 = client.post("/api/storm/create", json=create_payload(persona_count=1200))
    assert r2.status_code == 402, r2.text
    assert client.get("/api/wallet").json()["balance_credits"] == 25


def test_quote_reports_affordability(client):
    q = client.post(
        "/api/billing/quote", json={"persona_count": 1000, "include_analyst_report": True}
    ).json()
    assert q["total_credits"] == 65
    assert q["wallet_balance"] == 100
    assert q["balance_after"] == 35
    assert q["has_enough_credits"] is True

    # Spend the wallet down to 25, then the same 65-credit quote is unaffordable.
    client.post("/api/storm/create", json=create_payload(persona_count=1200))  # -75 -> 25
    q2 = client.post(
        "/api/billing/quote", json={"persona_count": 1000, "include_analyst_report": True}
    ).json()
    assert q2["wallet_balance"] == 25
    assert q2["total_credits"] == 65
    assert q2["balance_after"] == -40
    assert q2["has_enough_credits"] is False


# --------------------------------------------------------------------------- #
# Storm ownership isolation                                                     #
# --------------------------------------------------------------------------- #
def test_storm_ownership_isolated_between_users(client, actor):
    r = client.post("/api/storm/create", json=create_payload())
    sid = r.json()["storm_id"]
    # Owner can see it.
    assert client.get(f"/api/storm/{sid}").status_code == 200

    # A different user cannot — 404 (never leak existence).
    actor.id = "00000000-0000-0000-0000-0000000000ff"
    actor.email = "other@test.dev"
    assert client.get(f"/api/storm/{sid}").status_code == 404
    assert client.get(f"/api/storm/{sid}/report").status_code == 404


def test_admin_can_access_any_storm(client, actor):
    r = client.post("/api/storm/create", json=create_payload())
    sid = r.json()["storm_id"]
    actor.id = "00000000-0000-0000-0000-0000000000ad"
    actor.email = "admin@test.dev"
    actor.role = "admin"
    assert client.get(f"/api/storm/{sid}").status_code == 200


# --------------------------------------------------------------------------- #
# Admin authorization + management                                             #
# --------------------------------------------------------------------------- #
def test_admin_endpoints_reject_normal_user(client, actor):
    assert client.get("/api/admin/users").status_code == 403
    assert client.get("/api/admin/storm-runs").status_code == 403
    assert (
        client.post(
            "/api/admin/users/x/wallet-adjust", json={"amount_credits": 10, "reason": "x"}
        ).status_code
        == 403
    )


def test_admin_manages_wallets_roles_and_pricing(client, actor):
    target_id = "00000000-0000-0000-0000-0000000000aa"
    # Provision the target by acting as them once.
    actor.id = target_id
    actor.email = "target@test.dev"
    client.get("/api/me")

    # Become an admin.
    actor.id = "00000000-0000-0000-0000-0000000000ad"
    actor.email = "admin@test.dev"
    actor.role = "admin"

    users = client.get("/api/admin/users").json()
    assert target_id in {u["id"] for u in users}

    # Top up the target's wallet.
    adj = client.post(
        f"/api/admin/users/{target_id}/wallet-adjust",
        json={"amount_credits": 500, "reason": "Manual top-up for demo"},
    )
    assert adj.status_code == 200, adj.text
    assert adj.json()["new_balance"] == 600

    # A debit larger than the balance is rejected (wallet can't go negative).
    over = client.post(
        f"/api/admin/users/{target_id}/wallet-adjust",
        json={"amount_credits": -100000, "reason": "overdraw"},
    )
    assert over.status_code == 400

    # Promote the target to admin.
    rr = client.post(f"/api/admin/users/{target_id}/role", json={"role": "admin"})
    assert rr.status_code == 200
    assert rr.json()["role"] == "admin"

    # Edit the active pricing rule; a fresh quote reflects it.
    pr = client.post(
        "/api/admin/pricing",
        json={
            "name": "Custom",
            "base_run_credits": 20,
            "credits_per_100_personas": 10,
            "analyst_report_credits": 0,
        },
    )
    assert pr.status_code == 200, pr.text
    q = client.post(
        "/api/billing/quote", json={"persona_count": 100, "include_analyst_report": True}
    ).json()
    assert q["total_credits"] == 30  # 20 + 1*10 + 0


def test_cannot_demote_last_admin(client, actor):
    admin_id = "00000000-0000-0000-0000-0000000000ad"
    actor.id = admin_id
    actor.email = "admin@test.dev"
    actor.role = "admin"
    client.get("/api/me")  # provision the admin's profile (role 'user' in DB)

    # Make the profile role admin so count_admins() == 1.
    client.post(f"/api/admin/users/{admin_id}/role", json={"role": "admin"})

    # Demoting the only admin is refused.
    r = client.post(f"/api/admin/users/{admin_id}/role", json={"role": "user"})
    assert r.status_code == 400

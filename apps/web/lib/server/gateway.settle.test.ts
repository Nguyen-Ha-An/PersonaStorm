// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildGateway } from "./gateway";

// buildGateway() falls back to the in-memory dev gateway when no Supabase env
// is configured — which is the case in the test environment.

describe("settleStormIfRunning — the refund idempotency gate", () => {
  it("wins the running→failed transition exactly once", async () => {
    const gw = buildGateway();
    await gw.recordStorm({ id: "storm_x", user_id: "u1", status: "running", price_credits: 65 });

    const first = await gw.settleStormIfRunning("storm_x", { status: "failed", error: "interrupted" });
    const second = await gw.settleStormIfRunning("storm_x", { status: "failed", error: "interrupted" });

    expect(first).toBe(true);
    expect(second).toBe(false); // a concurrent racer must NOT refund again
    const row = await gw.getStorm("storm_x");
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("interrupted");
  });

  it("does not touch a completed storm", async () => {
    const gw = buildGateway();
    await gw.recordStorm({ id: "storm_y", user_id: "u1", status: "complete", price_credits: 65 });
    expect(await gw.settleStormIfRunning("storm_y", { status: "failed" })).toBe(false);
    expect((await gw.getStorm("storm_y"))?.status).toBe("complete");
  });

  it("returns false for a missing storm", async () => {
    const gw = buildGateway();
    expect(await gw.settleStormIfRunning("storm_missing", { status: "failed" })).toBe(false);
  });
});

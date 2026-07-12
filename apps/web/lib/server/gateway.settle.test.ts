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

describe("storm list queries exclude the heavy jsonb payloads", () => {
  it("listUserStorms and adminListStorms return metadata only; getStorm returns everything", async () => {
    const gw = buildGateway();
    // The dev gateway is a process-wide singleton, so use a dedicated user id
    // to keep rows from the settle tests above out of this list.
    await gw.recordStorm({
      id: "storm_big",
      user_id: "u_heavy",
      title: "t",
      status: "complete",
      price_credits: 65,
      report_json: { huge: true },
      reactions_json: { reactions: [1, 2, 3] },
      orchestration_json: { plan: {} },
    });

    for (const row of await gw.listUserStorms("u_heavy", 5)) {
      expect(row).not.toHaveProperty("report_json");
      expect(row).not.toHaveProperty("reactions_json");
      expect(row).not.toHaveProperty("orchestration_json");
      expect(row.status).toBe("complete"); // metadata intact
    }
    for (const row of await gw.adminListStorms(5)) {
      expect(row).not.toHaveProperty("report_json");
      expect(row).not.toHaveProperty("reactions_json");
      expect(row).not.toHaveProperty("orchestration_json");
    }
    // The single-row read still carries the full payload for the report page.
    const full = await gw.getStorm("storm_big");
    expect(full?.report_json).toEqual({ huge: true });
  });

  it("adminListStorms tolerates the demo row's NULL user_id", async () => {
    const gw = buildGateway();
    await gw.recordStorm({ id: "storm_demo", user_id: null, is_demo: true, title: "demo", status: "complete", price_credits: 0 });
    const rows = await gw.adminListStorms(50);
    const demo = rows.find((r) => r.id === "storm_demo");
    expect(demo).toBeDefined();
    expect(demo?.user_email).toBeNull();
  });
});

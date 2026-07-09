import { test, expect } from "@playwright/test";

// Skip the guided tour + how-it-works so the smoke assertions are deterministic.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ps_tour_demo", "1");
      localStorage.setItem("ps_howitworks_dismissed", "1");
    } catch {
      /* storage unavailable — the tour just shows; assertions still pass */
    }
  });
});

test("public demo streams to a verdict-first report without signup", async ({ page }) => {
  await page.goto("/demo");

  // Public page renders — no auth redirect to /login for an anonymous visitor.
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { name: /Watch 1,000 AI personas/i })).toBeVisible();

  // Seed → stream → report. The verdict banner is the payoff.
  await expect(page.getByText("The verdict")).toBeVisible({ timeout: 75_000 });
  await expect(
    page.getByRole("heading", { name: /(Strong signal|Promising|Weak signal)/i }),
  ).toBeVisible();

  // Top actions + the preserved full diagnostics below.
  await expect(page.getByText("Do these first")).toBeVisible();
  await expect(page.getByText("Full diagnostics")).toBeVisible();
});

test("landing leads with the no-signup demo CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Watch a 60-second live demo/i })).toBeVisible();
});

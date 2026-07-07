import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke of the public demo golden path. Boots a dev server on port 3101
 * (reused if already running) and runs the specs in ./e2e. Vitest excludes
 * e2e/, so unit and e2e suites never collide.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- -p 3101",
    url: "http://localhost:3101",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

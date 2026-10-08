import { defineConfig, devices } from "@playwright/test";

/** Port of the throwaway server the smoke suite runs against. */
const PORT = 8790;

/**
 * The browser smoke suite: a real backend on a temporary data folder, the
 * built frontend, Chromium only. Run with `py scripts\test.py --e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: "Europe/Amsterdam",
    locale: "en-GB",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `py -3.14 ../scripts/e2e_server.py --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});

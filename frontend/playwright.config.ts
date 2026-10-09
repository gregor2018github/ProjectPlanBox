import { defineConfig, devices } from "@playwright/test";

/** Port of the throwaway server the smoke suite runs against. */
const PORT = 8790;

// Node's `process`, declared here so the config needs no @types/node.
declare const process: { platform: string; env: Record<string, string | undefined> };

/** The repo's .venv interpreter (setup.py creates it on every OS). */
const VENV_PYTHON =
  process.platform === "win32" ? "..\\.venv\\Scripts\\python.exe" : "../.venv/bin/python";

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
    command: `${VENV_PYTHON} ../scripts/e2e_server.py --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});

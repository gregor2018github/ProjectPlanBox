import { defineConfig, devices } from "@playwright/test";

/** Port of the preview server for the phone app's build. */
const PORT = 8791;

/**
 * The phone app's smoke suite: the device build (`npm run build:device`)
 * in Chromium on a phone-sized screen, with its own database in the
 * browser. No Python backend runs. Run with `py scripts\test.py --e2e`.
 */
export default defineConfig({
  testDir: "./e2e-device",
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
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx vite preview --outDir dist-device --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
  },
});

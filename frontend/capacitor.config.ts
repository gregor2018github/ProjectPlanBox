import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app: the device build (`npm run build:device`) in a WebView,
 * with its own database. Built with Android Studio; see README, "Phone app".
 */
const config: CapacitorConfig = {
  appId: "app.planbox",
  appName: "PlanBox",
  webDir: "dist-device",
};

export default config;

import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { StartupSplash } from "./app/StartupSplash";
import { createApiClient } from "./core/api/client";
import { installBackHandler } from "./core/back";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing #root");

/** The phone app (`npm run build:device`) keeps its own database instead of calling a PC. */
const DEVICE = import.meta.env.VITE_PLANBOX_DEVICE === "1";

// The service worker keeps the app shell for the home-screen app (phone
// access). Browsers allow it only on https or localhost; dev never uses it.
// The phone app ships its shell inside the app, so it needs none.
if (!DEVICE && import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Without it PlanBox works the same, just not offline.
    });
  });
}

// Loaded only by the device build, so the PC's bundle carries no database engine.
const apiClient = DEVICE
  ? createApiClient((await import("./app/device/start")).deviceFetch())
  : undefined;

// The Android app asks the page first on a back gesture (see core/back.ts).
if (DEVICE) installBackHandler();

createRoot(root).render(
  <StrictMode>
    <App apiClient={apiClient} />
    <StartupSplash />
  </StrictMode>,
);

import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { StartupSplash } from "./app/StartupSplash";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html is missing #root");

// The service worker keeps the app shell for the home-screen app (phone
// access). Browsers allow it only on https or localhost; dev never uses it.
if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Without it PlanBox works the same, just not offline.
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
    <StartupSplash />
  </StrictMode>,
);

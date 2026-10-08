import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** The backend's dev address; the host is always loopback. */
const BACKEND = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": BACKEND },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  // Served from localhost, so one ~210 kB gzip bundle loads instantly; revisit with
  // per-module lazy routes once modules exist.
  build: { target: "es2023", sourcemap: true, chunkSizeWarningLimit: 800 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    // tokens.test.ts reads tokens.css?raw; other CSS stays stubbed for speed.
    css: { include: [/tokens\.css/] },
  },
});

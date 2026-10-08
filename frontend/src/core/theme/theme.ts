/**
 * Theme preference: `system` follows the OS, `light`/`dark` pin it.
 * index.html applies the stored preference before first paint; keep the key
 * and logic there in sync with this file.
 */
import { readStorage, writeStorage } from "../storage";

/** What the user chose. */
export type ThemePreference = "system" | "light" | "dark";

/** What is actually shown. */
export type ResolvedTheme = "light" | "dark";

/** localStorage key, shared with the inline script in index.html. */
export const THEME_STORAGE_KEY = "planbox.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Reads the stored preference, defaulting to `system`. */
export function readThemePreference(): ThemePreference {
  const stored = readStorage(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** Stores the preference. */
export function writeThemePreference(preference: ThemePreference): void {
  writeStorage(THEME_STORAGE_KEY, preference);
}

/** Tells whether the OS currently prefers dark. */
export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Turns a preference into the theme to show. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

/** Sets `data-theme` on <html>, which switches every token. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/** Calls `onChange` whenever the OS colour scheme changes; returns an unsubscribe. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

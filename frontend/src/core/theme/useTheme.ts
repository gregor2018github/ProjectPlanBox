import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  subscribeToSystemTheme,
  systemPrefersDark,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

/** Current theme preference and resolved theme, plus a setter. */
export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const THEME_EVENT = "planbox:theme";

/**
 * Reads and controls the theme. Every caller stays in sync, and the
 * `system` preference follows OS changes live.
 */
export function useTheme(): ThemeState {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    const sync = () => {
      setPreferenceState(readThemePreference());
    };
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPreferenceState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { preference, resolved, setPreference };
}

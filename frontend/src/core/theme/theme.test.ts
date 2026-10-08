import { describe, expect, it } from "vitest";

import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from "./theme";

describe("theme", () => {
  it("defaults to system and ignores junk", () => {
    expect(readThemePreference()).toBe("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readThemePreference()).toBe("system");
  });

  it("round-trips a preference", () => {
    writeThemePreference("dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("resolves system from the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("applies the theme to <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { installMatchMedia } from "./matchMedia";

beforeEach(() => {
  // jsdom has no matchMedia; default to a phone-sized window with no OS preferences.
  installMatchMedia(() => false);
  // jsdom does not implement scrolling.
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

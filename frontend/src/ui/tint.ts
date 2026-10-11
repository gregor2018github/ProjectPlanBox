import type { CSSProperties } from "react";

/** Attributes that re-tint the accent family for an element and its subtree. */
export interface TintProps {
  "data-tint": "";
  style: CSSProperties;
}

/**
 * Spread on an element to give it (and everything inside) the accent in
 * `hue` (0–359 OKLCH degrees). Lightness and chroma come from the theme
 * (`[data-tint]` in tokens.css), so any hue stays quiet and legible.
 */
export function tintProps(hue: number): TintProps {
  return { "data-tint": "", style: { "--tint-hue": String(normalizeHue(hue)) } as CSSProperties };
}

/** Wraps any angle into 0–359 whole degrees. */
export function normalizeHue(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

/** The hue at a point on a wheel (0° at the top, clockwise), e.g. under a pointer. */
export function hueAt(
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): number {
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  return normalizeHue((Math.atan2(dx, -dy) * 180) / Math.PI);
}

const HUE_NAMES: readonly [upTo: number, name: string][] = [
  [15, "pink"],
  [45, "red"],
  [70, "orange"],
  [105, "yellow"],
  [135, "lime"],
  [170, "green"],
  [200, "teal"],
  [240, "blue"],
  [285, "indigo"],
  [320, "purple"],
  [345, "magenta"],
  [360, "pink"],
];

/** A rough colour name for a hue, for screen readers ("264°, indigo"). */
export function hueName(hue: number): string {
  const h = normalizeHue(hue);
  return HUE_NAMES.find(([upTo]) => h < upTo)?.[1] ?? "pink";
}

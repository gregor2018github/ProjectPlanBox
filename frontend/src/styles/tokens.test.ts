/**
 * WCAG contrast of the colour tokens, computed from tokens.css itself so a
 * token edit that breaks legibility fails the build.
 */
import { describe, expect, it } from "vitest";

import tokensCss from "./tokens.css?raw";

type Oklch = [l: number, c: number, h: number];

function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`no block ${opener}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${opener}`);
}

function colours(body: string): Map<string, Oklch> {
  const result = new Map<string, Oklch>();
  for (const match of body.matchAll(/--color-([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)) {
    const [, name, l, c, h] = match;
    result.set(name as string, [Number(l), Number(c), Number(h)]);
  }
  return result;
}

/** OKLCH -> linear sRGB (clipped) -> relative luminance. */
function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  const r = clip(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const g = clip(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const bl = clip(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(x: Oklch, y: Oklch): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = colours(block(tokensCss, "@theme {"));
const dark = new Map([...light, ...colours(block(tokensCss, '[data-theme="dark"] {'))]);
const backgrounds = [
  "bg",
  "surface",
  "surface-raised",
  "sidebar",
  "stripe",
  "hover",
  "selected",
  "wash",
];

const requirements: [fg: string, min: number, on: string[]][] = [
  ["text", 4.5, backgrounds],
  ["text-muted", 4.5, backgrounds],
  ["accent", 4.5, backgrounds], // links and accent text
  ["danger", 4.5, backgrounds], // "overdue" text
  ["warning", 3, ["bg", "surface", "surface-raised", "stripe", "hover", "wash"]], // non-text marks only
  ["on-accent", 4.5, ["accent"]],
  ["on-danger", 4.5, ["danger"]],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_, theme) => {
  for (const [fg, min, on] of requirements) {
    for (const bg of on) {
      it(`${fg} on ${bg} reaches ${min}:1`, () => {
        const f = theme.get(fg);
        const b = theme.get(bg);
        expect(f, fg).toBeDefined();
        expect(b, bg).toBeDefined();
        expect(contrast(f!, b!)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe.each([
  ["light", light],
  ["dark", dark],
])("%s ink", (_, theme) => {
  for (const ink of ["default", "red", "orange", "green", "blue", "purple"]) {
    it(`ink-${ink} is a visible mark on the page (3:1)`, () => {
      const colour = theme.get(`ink-${ink}`);
      expect(colour, ink).toBeDefined();
      expect(contrast(colour!, theme.get("surface")!)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe.each([
  ["light", light],
  ["dark", dark],
])("%s heat ramp", (_, theme) => {
  const ramp = [0, 1, 2, 3, 4].map((step) => theme.get(`heat-${step}`));

  it("steps away from the surface, empty to full", () => {
    const surface = theme.get("surface")!;
    const distances = ramp.map((c) => contrast(c!, surface));
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]!);
    }
  });

  it("full is a visible mark on the card surface (3:1)", () => {
    expect(contrast(ramp[4]!, theme.get("surface")!)).toBeGreaterThanOrEqual(3);
  });
});

/** The tint overrides of one theme, as [lightness, chroma] per token (the hue varies). */
function tints(body: string): Map<string, [l: number, c: number]> {
  const result = new Map<string, [number, number]>();
  for (const match of body.matchAll(
    /--color-([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) var\(--tint-hue\)\)/g,
  )) {
    const [, name, l, c] = match;
    result.set(name as string, [Number(l), Number(c)]);
  }
  return result;
}

const lightTints = tints(block(tokensCss, "[data-tint] {"));
const darkTints = new Map([
  ...lightTints,
  ...tints(block(tokensCss, '[data-theme="dark"] [data-tint] {')),
]);
const lightWash = new Map([...lightTints, ...tints(block(tokensCss, "[data-wash] {"))]);
const darkWash = new Map([
  ...darkTints,
  ...tints(block(tokensCss, '[data-theme="dark"] [data-wash] {')),
]);

describe.each([
  ["light", light, lightTints, false],
  ["dark", dark, darkTints, false],
  ["light washed", light, lightWash, true],
  ["dark washed", dark, darkWash, true],
])("%s tints", (_, theme, tinted, washed) => {
  // Every whole degree: gamut clipping makes some hues darker or lighter than others.
  const hues = Array.from({ length: 360 }, (__, hue) => hue);
  const at = (name: string, hue: number): Oklch => {
    const lc = tinted.get(name);
    if (lc) return [lc[0], lc[1], hue];
    const fixed = theme.get(name);
    if (!fixed) throw new Error(`no token ${name}`);
    return fixed;
  };
  const tintRequirements: [fg: string, min: number, on: string[]][] = [
    ["text", 4.5, ["selected", "hover", "wash"]],
    ["text-muted", 4.5, ["selected", "hover", "wash"]],
    ["accent", 4.5, backgrounds],
    ["on-accent", 4.5, ["accent"]],
  ];

  for (const [fg, min, on] of tintRequirements) {
    for (const bg of on) {
      it(`${fg} on ${bg} reaches ${min}:1 at every hue`, () => {
        const worst = Math.min(...hues.map((hue) => contrast(at(fg, hue), at(bg, hue))));
        expect(worst).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("re-tints the whole accent family", () => {
    expect([...tinted.keys()]).toEqual(
      expect.arrayContaining(["accent", "accent-hover", "accent-subtle", "selected", "wash"]),
    );
  });

  it.runIf(washed)("keeps hover and selected apart from the wash at every hue", () => {
    for (const hue of hues) {
      const wash = at("wash", hue);
      expect(contrast(at("hover", hue), wash)).toBeGreaterThan(1.04);
      expect(contrast(at("selected", hue), wash)).toBeGreaterThan(1.08);
    }
  });
});

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

const light = colours(block(tokensCss, "@theme"));
const dark = new Map([...light, ...colours(block(tokensCss, '[data-theme="dark"]'))]);
const backgrounds = ["bg", "surface", "surface-raised", "sidebar", "hover", "selected"];

const requirements: [fg: string, min: number, on: string[]][] = [
  ["text", 4.5, backgrounds],
  ["text-muted", 4.5, backgrounds],
  ["accent", 4.5, backgrounds], // links and accent text
  ["danger", 4.5, backgrounds], // "overdue" text
  ["warning", 3, ["bg", "surface", "surface-raised", "hover"]], // non-text marks only
  ["on-accent", 4.5, ["accent"]],
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

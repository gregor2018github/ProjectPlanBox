/**
 * Pure edits of a page's drawings: pen strokes grouped into drawings that
 * move together, like layers above the boxes. A drawing's `x`/`y` is the top
 * left of its points, and each stroke's points (x0, y0, x1, y1, …) are whole
 * pixels from there, so every result is a valid PATCH body.
 */
import type { InkColor, PageContent, PageDrawing, PageStroke } from "./types";

/** The pen colours, in the toolbar's order. */
export const INK_COLORS: readonly InkColor[] = [
  "default",
  "red",
  "orange",
  "green",
  "blue",
  "purple",
];

/** What each colour is called (for the toolbar's labels). */
export const INK_COLOR_NAMES: Record<InkColor, string> = {
  default: "Black",
  red: "Red",
  orange: "Orange",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

/** The pen thicknesses the toolbar offers, in pixels. */
export const INK_WIDTHS: readonly number[] = [2, 4, 8, 16];

/** A new stroke joins the drawing just drawn when it comes this close to it. */
export const JOIN_GAP = 48;

/** The furthest from the page's top left ink can go (the server's limit). */
const MAX_OFFSET = 100_000;
/** The most numbers one stroke holds (the server's limit). */
const MAX_POINTS = 20_000;
/** How far (pixels) simplifying may move a stroke's line. */
const TOLERANCE = 0.75;

/** A pen: what a new stroke looks like. */
export interface Pen {
  color: InkColor;
  width: number;
}

/** A rectangle on the page. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const drawingsOf = (content: PageContent): PageDrawing[] => content.drawings ?? [];

const withDrawings = (content: PageContent, drawings: PageDrawing[]): PageContent => ({
  ...content,
  drawings,
});

/** The rectangle around a stroke's points (relative to its drawing). */
function pointsRect(points: readonly number[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (left === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where a drawing's points lie on the page (not counting the pen's thickness). */
export function drawingBounds(drawing: PageDrawing): Rect {
  const rects = drawing.strokes.map((stroke) => pointsRect(stroke.points));
  if (rects.length === 0) return { x: drawing.x, y: drawing.y, width: 0, height: 0 };
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: drawing.x + left, y: drawing.y + top, width: right - left, height: bottom - top };
}

/** The thickest pen in a drawing. */
export function thickest(drawing: PageDrawing): number {
  return Math.max(0, ...drawing.strokes.map((stroke) => stroke.width));
}

/** Drops points closer than `tolerance` to the line (Ramer–Douglas–Peucker). */
function simplify(points: readonly [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    const [ax, ay] = points[first] as [number, number];
    const [bx, by] = points[last] as [number, number];
    let far = -1;
    let farIndex = first;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i] as [number, number];
      const d = segmentDistance(px, py, ax, ay, bx, by);
      if (d > far) {
        far = d;
        farIndex = i;
      }
    }
    if (far > tolerance) {
      keep[farIndex] = true;
      stack.push([first, farIndex], [farIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * A pointer's path as page points for a stroke: whole pixels on the page,
 * repeats dropped, simplified within a fraction of a pixel and capped at the
 * server's size.
 */
export function cleanPath(path: readonly { x: number; y: number }[]): [number, number][] {
  const clamp = (v: number) => Math.min(Math.max(Math.round(v), 0), MAX_OFFSET);
  const whole: [number, number][] = [];
  for (const { x, y } of path) {
    const point: [number, number] = [clamp(x), clamp(y)];
    const last = whole.at(-1);
    if (last?.[0] !== point[0] || last[1] !== point[1]) whole.push(point);
  }
  return simplify(whole, TOLERANCE).slice(0, MAX_POINTS / 2);
}

/** Moves a drawing's origin to the top left of its points, so none is negative. */
function normalized(drawing: PageDrawing): PageDrawing {
  const bounds = drawingBounds(drawing);
  const dx = drawing.x - bounds.x;
  const dy = drawing.y - bounds.y;
  if (dx === 0 && dy === 0) return drawing;
  return {
    ...drawing,
    x: bounds.x,
    y: bounds.y,
    strokes: drawing.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)),
    })),
  };
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x - gap <= b.x + b.width &&
  b.x - gap <= a.x + a.width &&
  a.y - gap <= b.y + b.height &&
  b.y - gap <= a.y + a.height;

/**
 * Adds a stroke drawn through these page points. It joins the drawing `join`
 * (the one just drawn) when it comes within {@link JOIN_GAP} of it, so a
 * sketch made in one go moves as one; otherwise it starts a new drawing `id`
 * on top of the others. Returns the content and the drawing it went into.
 */
export function addStroke(
  content: PageContent,
  points: readonly [number, number][],
  pen: Pen,
  join: string | null,
  id: string,
): { content: PageContent; drawingId: string } {
  if (points.length === 0) return { content, drawingId: join ?? id };
  const drawings = drawingsOf(content);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const rect: Rect = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const target = drawings.find((d) => d.id === join);
  const gap = JOIN_GAP + Math.max(pen.width, target === undefined ? 0 : thickest(target)) / 2;
  if (target !== undefined && overlaps(drawingBounds(target), rect, gap)) {
    const stroke: PageStroke = {
      color: pen.color,
      width: pen.width,
      points: points.flatMap(([x, y]) => [x - target.x, y - target.y]),
    };
    const grown = normalized({ ...target, strokes: [...target.strokes, stroke] });
    return {
      content: withDrawings(
        content,
        drawings.map((d) => (d.id === target.id ? grown : d)),
      ),
      drawingId: target.id,
    };
  }
  const drawing: PageDrawing = {
    id,
    x: rect.x,
    y: rect.y,
    strokes: [
      {
        color: pen.color,
        width: pen.width,
        points: points.flatMap(([x, y]) => [x - rect.x, y - rect.y]),
      },
    ],
  };
  return { content: withDrawings(content, [...drawings, drawing]), drawingId: id };
}

/** Removes a drawing's last stroke if it is still this one (undoing a stroke); an empty drawing goes. */
export function removeLastStroke(
  content: PageContent,
  drawingId: string,
  count: number,
): PageContent {
  const drawings = drawingsOf(content);
  const drawing = drawings.find((d) => d.id === drawingId);
  if (drawing?.strokes.length !== count) return content;
  if (count <= 1)
    return withDrawings(
      content,
      drawings.filter((d) => d.id !== drawingId),
    );
  const shrunk = normalized({ ...drawing, strokes: drawing.strokes.slice(0, -1) });
  return withDrawings(
    content,
    drawings.map((d) => (d.id === drawingId ? shrunk : d)),
  );
}

/** Moves a drawing so its points' top left sits at a point (clamped onto the page). */
export function moveDrawing(content: PageContent, id: string, x: number, y: number): PageContent {
  const drawings = drawingsOf(content);
  const drawing = drawings.find((d) => d.id === id);
  if (drawing === undefined) return content;
  const bounds = drawingBounds(drawing);
  const clamp = (v: number, size: number) =>
    Math.min(Math.max(Math.round(v), 0), MAX_OFFSET - size);
  const nx = clamp(x, bounds.width);
  const ny = clamp(y, bounds.height);
  if (nx === bounds.x && ny === bounds.y) return content;
  const moved = { ...drawing, x: drawing.x + nx - bounds.x, y: drawing.y + ny - bounds.y };
  return withDrawings(
    content,
    drawings.map((d) => (d.id === id ? moved : d)),
  );
}

/** Removes a drawing. */
export function removeDrawing(content: PageContent, id: string): PageContent {
  return withDrawings(
    content,
    drawingsOf(content).filter((d) => d.id !== id),
  );
}

/** Brings a drawing in front of the others, or sends it behind them. */
export function restackDrawing(
  content: PageContent,
  id: string,
  to: "front" | "back",
): PageContent {
  const drawings = drawingsOf(content);
  const drawing = drawings.find((d) => d.id === id);
  if (drawing === undefined) return content;
  const others = drawings.filter((d) => d.id !== id);
  const next = to === "front" ? [...others, drawing] : [drawing, ...others];
  if (next.every((d, i) => d === drawings[i])) return content;
  return withDrawings(content, next);
}

/** A drawing as it was before an edit, and where it stacked (to put it back). */
export interface DrawingSnapshot {
  drawing: PageDrawing;
  index: number;
}

/** Puts drawings back as they were (undoing an erase or a delete). */
export function putBackDrawings(
  content: PageContent,
  snapshots: readonly DrawingSnapshot[],
): PageContent {
  let drawings = drawingsOf(content);
  for (const { drawing, index } of [...snapshots].sort((a, b) => a.index - b.index)) {
    if (drawings.some((d) => d.id === drawing.id)) {
      drawings = drawings.map((d) => (d.id === drawing.id ? drawing : d));
    } else {
      drawings = [...drawings];
      drawings.splice(Math.min(index, drawings.length), 0, drawing);
    }
  }
  return withDrawings(content, drawings);
}

/** How far a point is from the segment a–b. */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether a page point lies within `reach` of a stroke's line (its thickness counted). */
export function touchesStroke(
  drawing: PageDrawing,
  stroke: PageStroke,
  x: number,
  y: number,
  reach: number,
): boolean {
  const px = x - drawing.x;
  const py = y - drawing.y;
  const limit = reach + stroke.width / 2;
  const p = stroke.points;
  if (p.length <= 2) return Math.hypot(px - (p[0] ?? 0), py - (p[1] ?? 0)) <= limit;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const d = segmentDistance(px, py, p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0, p[i + 3] ?? 0);
    if (d <= limit) return true;
  }
  return false;
}

/**
 * Erases every stroke within `reach` of a page point; a drawing left without
 * strokes goes. Returns the content and the drawings as they were before
 * (to undo), or the same content when nothing was hit.
 */
export function eraseAt(
  content: PageContent,
  x: number,
  y: number,
  reach: number,
): { content: PageContent; before: DrawingSnapshot[] } {
  const drawings = drawingsOf(content);
  const before: DrawingSnapshot[] = [];
  const next: PageDrawing[] = [];
  drawings.forEach((drawing, index) => {
    const kept = drawing.strokes.filter((s) => !touchesStroke(drawing, s, x, y, reach));
    if (kept.length === drawing.strokes.length) {
      next.push(drawing);
      return;
    }
    before.push({ drawing, index });
    if (kept.length > 0) next.push(normalized({ ...drawing, strokes: kept }));
  });
  if (before.length === 0) return { content, before };
  return { content: withDrawings(content, next), before };
}

/**
 * An SVG path through a stroke's points, smoothed: straight to the first
 * midpoint, then curves through each midpoint with the points as controls.
 * A single point is a dot (a zero-length line with round caps).
 */
export function strokePath(points: readonly number[]): string {
  const n = Math.floor(points.length / 2);
  const at = (i: number): [number, number] => [points[2 * i] ?? 0, points[2 * i + 1] ?? 0];
  if (n === 0) return "";
  const [x0, y0] = at(0);
  if (n === 1) return `M${String(x0)} ${String(y0)}l0 0`;
  if (n === 2) {
    const [x1, y1] = at(1);
    return `M${String(x0)} ${String(y0)}L${String(x1)} ${String(y1)}`;
  }
  const mid = (a: number, b: number) => Math.round(((a + b) / 2) * 10) / 10;
  const parts = [`M${String(x0)} ${String(y0)}`];
  const [x1, y1] = at(1);
  parts.push(`L${String(mid(x0, x1))} ${String(mid(y0, y1))}`);
  for (let i = 1; i < n - 1; i += 1) {
    const [cx, cy] = at(i);
    const [nx, ny] = at(i + 1);
    parts.push(`Q${String(cx)} ${String(cy)} ${String(mid(cx, nx))} ${String(mid(cy, ny))}`);
  }
  const [lx, ly] = at(n - 1);
  parts.push(`L${String(lx)} ${String(ly)}`);
  return parts.join("");
}

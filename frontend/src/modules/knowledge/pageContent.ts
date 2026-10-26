/**
 * Pure edits of a page's content (its boxes; drawings are in `ink.ts`).
 * Positions and widths are whole pixels inside the server's limits, so every
 * result is a valid PATCH body.
 */
import { drawingBounds } from "./ink";
import type { PageBox, PageContent, PageDoc } from "./types";

/** How wide a new box starts. */
export const DEFAULT_BOX_WIDTH = 480;
/** The narrowest a box can be dragged. */
export const MIN_BOX_WIDTH = 120;
/** The widest a box can be dragged. */
export const MAX_BOX_WIDTH = 4000;
/** The furthest from the page's top left a box can sit. */
export const MAX_OFFSET = 100_000;
/** The lowest a box's text area can be dragged (about one line). */
export const MIN_BOX_HEIGHT = 40;
/** The tallest a box's text area can be dragged. */
export const MAX_BOX_HEIGHT = 100_000;

/** A box side or corner to resize from. */
export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Every direction, sides first. */
export const RESIZE_DIRECTIONS: readonly ResizeDirection[] = [
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
];

/** Where a box sits and how large it is (height is its text area's least height). */
export interface BoxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A document with one empty paragraph (a fresh box). */
export function emptyDoc(): PageDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(Math.round(value), low), high);

/** A new box at a point (clamped onto the page). */
export function newBox(id: string, x: number, y: number, doc: PageDoc = emptyDoc()): PageBox {
  return {
    id,
    x: clamp(x, 0, MAX_OFFSET),
    y: clamp(y, 0, MAX_OFFSET),
    width: DEFAULT_BOX_WIDTH,
    height: null,
    doc,
  };
}

/**
 * The bounds after dragging a side or corner by dx/dy pixels. The opposite
 * side stays where it is: dragging the left or top edge moves the box. Sizes
 * stop at their limits and the box at the page's top and left edges.
 */
export function resizeBounds(
  start: BoxBounds,
  direction: ResizeDirection,
  dx: number,
  dy: number,
): BoxBounds {
  let { x, y, width, height } = start;
  if (direction.includes("e")) {
    width = clamp(start.width + dx, MIN_BOX_WIDTH, MAX_BOX_WIDTH);
  }
  if (direction.includes("w")) {
    const right = start.x + start.width;
    width = clamp(start.width - dx, MIN_BOX_WIDTH, Math.min(MAX_BOX_WIDTH, right));
    x = right - width;
  }
  if (direction.includes("s")) {
    height = clamp(start.height + dy, MIN_BOX_HEIGHT, MAX_BOX_HEIGHT);
  }
  if (direction.startsWith("n")) {
    const bottom = start.y + start.height;
    height = clamp(start.height - dy, MIN_BOX_HEIGHT, Math.min(MAX_BOX_HEIGHT, bottom));
    y = bottom - height;
  }
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function mapBox(content: PageContent, id: string, edit: (box: PageBox) => PageBox): PageContent {
  return { ...content, boxes: content.boxes.map((box) => (box.id === id ? edit(box) : box)) };
}

/** Adds a box on top of the others. */
export function addBox(content: PageContent, box: PageBox): PageContent {
  return { ...content, boxes: [...content.boxes, box] };
}

/** Moves a box to a point (clamped onto the page). */
export function moveBox(content: PageContent, id: string, x: number, y: number): PageContent {
  return mapBox(content, id, (box) => ({
    ...box,
    x: clamp(x, 0, MAX_OFFSET),
    y: clamp(y, 0, MAX_OFFSET),
  }));
}

/** Gives a box new bounds (clamped onto the page and to the size limits). */
export function setBoxBounds(content: PageContent, id: string, bounds: BoxBounds): PageContent {
  return mapBox(content, id, (box) => ({
    ...box,
    x: clamp(bounds.x, 0, MAX_OFFSET),
    y: clamp(bounds.y, 0, MAX_OFFSET),
    width: clamp(bounds.width, MIN_BOX_WIDTH, MAX_BOX_WIDTH),
    height: clamp(bounds.height, MIN_BOX_HEIGHT, MAX_BOX_HEIGHT),
  }));
}

/** Replaces a box's document. */
export function setBoxDoc(content: PageContent, id: string, doc: PageDoc): PageContent {
  return mapBox(content, id, (box) => ({ ...box, doc }));
}

/** Removes a box. */
export function removeBox(content: PageContent, id: string): PageContent {
  return { ...content, boxes: content.boxes.filter((box) => box.id !== id) };
}

/** Puts a removed box back where it was in the stacking order (undo). */
export function restoreBox(content: PageContent, box: PageBox, index: number): PageContent {
  if (content.boxes.some((b) => b.id === box.id)) return content;
  const boxes = [...content.boxes];
  boxes.splice(Math.min(index, boxes.length), 0, box);
  return { ...content, boxes };
}

/** Whether a document holds nothing (no text, no image, no table…), e.g. a box never typed in. */
export function isEmptyDoc(doc: PageDoc): boolean {
  const content = doc.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  if (content.length > 1) return false;
  const only: unknown = content[0];
  if (typeof only !== "object" || only === null) return true;
  const node = only as Record<string, unknown>;
  const inner = node.content;
  return node.type === "paragraph" && (!Array.isArray(inner) || inner.length === 0);
}

/**
 * How large the page's area must be to hold every box and drawing with room
 * to add more: right and below the furthest one.
 */
export function pageExtent(content: PageContent): { width: number; height: number } {
  let right = 0;
  let bottom = 0;
  for (const box of content.boxes) {
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + (box.height ?? 0));
  }
  for (const drawing of content.drawings ?? []) {
    const bounds = drawingBounds(drawing);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  return { width: right + 480, height: bottom + 960 };
}

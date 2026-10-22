/**
 * Pure edits of a page's content (its boxes). Positions and widths are whole
 * pixels inside the server's limits, so every result is a valid PATCH body.
 */
import type { PageBox, PageContent, PageDoc } from "./types";

/** How wide a new box starts. */
export const DEFAULT_BOX_WIDTH = 480;
/** The narrowest a box can be dragged. */
export const MIN_BOX_WIDTH = 120;
/** The widest a box can be dragged. */
export const MAX_BOX_WIDTH = 4000;
/** The furthest from the page's top left a box can sit. */
export const MAX_OFFSET = 100_000;

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
    doc,
  };
}

function mapBox(content: PageContent, id: string, edit: (box: PageBox) => PageBox): PageContent {
  return { boxes: content.boxes.map((box) => (box.id === id ? edit(box) : box)) };
}

/** Adds a box on top of the others. */
export function addBox(content: PageContent, box: PageBox): PageContent {
  return { boxes: [...content.boxes, box] };
}

/** Moves a box to a point (clamped onto the page). */
export function moveBox(content: PageContent, id: string, x: number, y: number): PageContent {
  return mapBox(content, id, (box) => ({
    ...box,
    x: clamp(x, 0, MAX_OFFSET),
    y: clamp(y, 0, MAX_OFFSET),
  }));
}

/** Changes a box's width (clamped). */
export function resizeBox(content: PageContent, id: string, width: number): PageContent {
  return mapBox(content, id, (box) => ({
    ...box,
    width: clamp(width, MIN_BOX_WIDTH, MAX_BOX_WIDTH),
  }));
}

/** Replaces a box's document. */
export function setBoxDoc(content: PageContent, id: string, doc: PageDoc): PageContent {
  return mapBox(content, id, (box) => ({ ...box, doc }));
}

/** Removes a box. */
export function removeBox(content: PageContent, id: string): PageContent {
  return { boxes: content.boxes.filter((box) => box.id !== id) };
}

/** Puts a removed box back where it was in the stacking order (undo). */
export function restoreBox(content: PageContent, box: PageBox, index: number): PageContent {
  if (content.boxes.some((b) => b.id === box.id)) return content;
  const boxes = [...content.boxes];
  boxes.splice(Math.min(index, boxes.length), 0, box);
  return { boxes };
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
 * How large the page's area must be to hold every box with room to add
 * more: right and below the furthest box.
 */
export function pageExtent(content: PageContent): { width: number; height: number } {
  let right = 0;
  let bottom = 0;
  for (const box of content.boxes) {
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y);
  }
  return { width: right + 480, height: bottom + 960 };
}

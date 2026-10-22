/**
 * The rules of a page's content on the device: the twin of
 * `backend/planbox/modules/knowledge/content.py`.
 */
import { textLength, ValidationFailed } from "../../../core/device/errors";

const MAX_CONTENT = 2_000_000;
const MAX_DEPTH = 64;
const NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);
const MARK_TYPES = new Set(["bold", "italic", "underline", "strike", "code", "link", "highlight"]);
const IMAGE_SRC = /^\/api\/knowledge\/images\/[0-9a-f-]{36}\.(?:png|jpg|gif|webp)$/u;
const HREF = /^(?:https?:\/\/|mailto:)\S+$/iu;

type Node = Record<string, unknown>;

/** A box as the schema has validated it. */
export interface DeviceBox {
  id: string;
  x: number;
  y: number;
  width: number;
  doc: Node;
}

/** Page content as the schema has validated it. */
export interface DeviceContent {
  boxes: DeviceBox[];
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attr(attrs: unknown, name: string): unknown {
  return isNode(attrs) ? attrs[name] : undefined;
}

function matches(pattern: RegExp, value: unknown): boolean {
  return typeof value === "string" && pattern.test(value);
}

function checkNode(node: unknown, depth: number): void {
  if (depth > MAX_DEPTH) throw new ValidationFailed("A box's document is nested too deeply.");
  if (!isNode(node)) throw new ValidationFailed("Document nodes must be objects.");
  const kind = node.type;
  if (typeof kind !== "string" || !NODE_TYPES.has(kind)) {
    throw new ValidationFailed(`Unknown document node: ${pyRepr(kind)}.`);
  }
  if (kind === "image" && !matches(IMAGE_SRC, attr(node.attrs, "src"))) {
    throw new ValidationFailed("Images must be uploaded to PlanBox.");
  }
  if (kind === "text" && typeof node.text !== "string") {
    throw new ValidationFailed("Text nodes need text.");
  }
  const marks = node.marks ?? [];
  if (!Array.isArray(marks)) throw new ValidationFailed("Marks must be a list.");
  for (const mark of marks) {
    const markKind = isNode(mark) ? mark.type : undefined;
    if (typeof markKind !== "string" || !MARK_TYPES.has(markKind)) {
      throw new ValidationFailed(`Unknown text mark: ${pyRepr(markKind)}.`);
    }
    if (markKind === "link" && !matches(HREF, attr((mark as Node).attrs, "href"))) {
      throw new ValidationFailed("Links need an http(s) or mailto address.");
    }
  }
  const children = node.content ?? [];
  if (!Array.isArray(children)) throw new ValidationFailed("Node content must be a list.");
  for (const child of children) checkNode(child, depth + 1);
}

/** How Python's f-string shows a value the rules refuse (None for a missing type). */
function pyRepr(value: unknown): string {
  if (value === undefined || value === null) return "None";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Checks every box's document; throws `ValidationFailed` like the server. */
export function checkContent(content: DeviceContent): void {
  const ids = content.boxes.map((box) => box.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationFailed("Box ids must be unique within a page.");
  }
  for (const box of content.boxes) {
    if (!isNode(box.doc) || box.doc.type !== "doc") {
      throw new ValidationFailed("Each box holds one document.");
    }
    checkNode(box.doc, 0);
  }
}

/** The stored form: compact JSON with the box fields in the server's order. */
export function serializeContent(content: DeviceContent): string {
  const text = JSON.stringify({
    boxes: content.boxes.map(({ id, x, y, width, doc }) => ({ id, x, y, width, doc })),
  });
  if (textLength(text) > MAX_CONTENT) {
    throw new ValidationFailed("A page holds at most 2 MB of text.");
  }
  return text;
}

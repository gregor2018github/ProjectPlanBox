/**
 * A page's plain text (for search, previews and optimistic updates): the
 * twin of `page_text` in `backend/planbox/modules/knowledge/content.py`.
 */

/** Blocks whose inline content forms one line of the plain text. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** The part of a page's content the text depends on. */
export interface PageLike {
  boxes: readonly { doc: Readonly<Record<string, unknown>> }[];
}

function children(node: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>[] {
  const content = node.content;
  return Array.isArray(content) ? (content as Readonly<Record<string, unknown>>[]) : [];
}

function collect(
  node: Readonly<Record<string, unknown>>,
  lines: string[],
  line: string[] | null,
): void {
  const type = node.type;
  if (type === "text") {
    line?.push(typeof node.text === "string" ? node.text : "");
    return;
  }
  if (type === "hardBreak") {
    line?.push("\n");
    return;
  }
  if (typeof type === "string" && TEXT_BLOCKS.has(type)) {
    const parts: string[] = [];
    for (const child of children(node)) collect(child, lines, parts);
    lines.push(parts.join(""));
    return;
  }
  for (const child of children(node)) collect(child, lines, line);
}

/**
 * Each paragraph, heading or code block is one line; a box's lines are
 * joined by newlines, and boxes (empty ones skipped) by one more.
 */
export function pageText(content: PageLike): string {
  const texts: string[] = [];
  for (const box of content.boxes) {
    const lines: string[] = [];
    collect(box.doc, lines, null);
    const text = lines.join("\n");
    if (text !== "") texts.push(text);
  }
  return texts.join("\n");
}

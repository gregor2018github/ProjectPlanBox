/** Builders for knowledge test rows. */
import { pageText } from "./pageText";
import type { Collection, Entry, PageBox, PageContent } from "./types";

let counter = 0;

/** A box holding one paragraph per line of `text` (override any field). */
export function textBox(text: string, fields: Partial<PageBox> = {}): PageBox {
  counter += 1;
  const content = text
    .split("\n")
    .map((line) =>
      line === ""
        ? { type: "paragraph" }
        : { type: "paragraph", content: [{ type: "text", text: line }] },
    );
  return {
    id: `box-${String(counter)}`,
    x: 0,
    y: 0,
    width: 400,
    doc: { type: "doc", content },
    ...fields,
  };
}

/** A page (override any field); `content` also sets the derived `body`. */
export function makeEntry(fields: Partial<Entry> = {}): Entry {
  counter += 1;
  const stamp = `2026-10-0${String(1 + (counter % 8))}T10:00:00.000Z`;
  const content: PageContent = fields.content ?? { boxes: [] };
  return {
    id: `entry-${String(counter)}`,
    collection_id: null,
    title: `Entry ${String(counter)}`,
    content,
    body: pageText(content),
    created_at: stamp,
    updated_at: stamp,
    tag_ids: [],
    ...fields,
  };
}

/** A collection (override any field). */
export function makeCollection(fields: Partial<Collection> = {}): Collection {
  counter += 1;
  return {
    id: `collection-${String(counter)}`,
    name: `Collection ${String(counter)}`,
    position: "a0",
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...fields,
  };
}

import { describe, expect, it } from "vitest";

import {
  addBox,
  emptyDoc,
  isEmptyDoc,
  MIN_BOX_WIDTH,
  moveBox,
  newBox,
  pageExtent,
  removeBox,
  resizeBox,
  restoreBox,
  setBoxDoc,
} from "./pageContent";
import { pageText } from "./pageText";
import { textBox } from "./testData";

describe("page content edits", () => {
  it("adds boxes at whole pixels on the page", () => {
    const content = addBox({ boxes: [] }, newBox("a", 12.6, -40));
    expect(content.boxes[0]).toMatchObject({ id: "a", x: 13, y: 0, width: 480 });
    expect(isEmptyDoc(content.boxes[0]?.doc ?? {})).toBe(true);
  });

  it("moves, resizes and replaces one box without touching the others", () => {
    const a = textBox("a", { id: "a" });
    const b = textBox("b", { id: "b" });
    let content = { boxes: [a, b] };

    content = moveBox(content, "a", 100.4, 250);
    content = resizeBox(content, "a", 10);
    content = setBoxDoc(content, "b", textBox("bee").doc);

    expect(content.boxes[0]).toMatchObject({ x: 100, y: 250, width: MIN_BOX_WIDTH });
    expect(content.boxes[1]?.x).toBe(0);
    expect(pageText(content)).toBe("a\nbee");
  });

  it("removes a box and puts it back in its place", () => {
    const [a, b, c] = [textBox("a"), textBox("b"), textBox("c")];
    const without = removeBox({ boxes: [a, b, c] }, b.id);
    expect(without.boxes).toEqual([a, c]);
    expect(restoreBox(without, b, 1).boxes).toEqual([a, b, c]);
    expect(restoreBox({ boxes: [a, b, c] }, b, 1).boxes).toHaveLength(3);
  });

  it("knows empty documents", () => {
    expect(isEmptyDoc(emptyDoc())).toBe(true);
    expect(isEmptyDoc({ type: "doc", content: [] })).toBe(true);
    expect(isEmptyDoc(textBox("x").doc)).toBe(false);
    expect(isEmptyDoc({ type: "doc", content: [{ type: "image", attrs: { src: "/x" } }] })).toBe(
      false,
    );
  });

  it("leaves room right of and below the furthest box", () => {
    const content = { boxes: [textBox("a", { x: 100, y: 300, width: 400 })] };
    expect(pageExtent(content)).toEqual({ width: 980, height: 1260 });
    expect(pageExtent({ boxes: [] })).toEqual({ width: 480, height: 960 });
  });
});

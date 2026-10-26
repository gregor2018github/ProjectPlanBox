import { describe, expect, it } from "vitest";

import {
  addBox,
  emptyDoc,
  isEmptyDoc,
  MIN_BOX_HEIGHT,
  MIN_BOX_WIDTH,
  moveBox,
  newBox,
  pageExtent,
  removeBox,
  resizeBounds,
  setBoxBounds,
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
    content = setBoxBounds(content, "a", { x: 100.4, y: 250, width: 10, height: 5 });
    content = setBoxDoc(content, "b", textBox("bee").doc);

    expect(content.boxes[0]).toMatchObject({
      x: 100,
      y: 250,
      width: MIN_BOX_WIDTH,
      height: MIN_BOX_HEIGHT,
    });
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

  it("resizes from every side and corner, keeping the opposite side in place", () => {
    const start = { x: 100, y: 100, width: 300, height: 200 };
    expect(resizeBounds(start, "e", 50, 99)).toEqual({ ...start, width: 350 });
    expect(resizeBounds(start, "s", 99, 50)).toEqual({ ...start, height: 250 });
    expect(resizeBounds(start, "w", 40, 0)).toEqual({ ...start, x: 140, width: 260 });
    expect(resizeBounds(start, "n", 0, -30)).toEqual({ ...start, y: 70, height: 230 });
    expect(resizeBounds(start, "se", 10, 20)).toEqual({ ...start, width: 310, height: 220 });
    expect(resizeBounds(start, "nw", -10, -20)).toEqual({ x: 90, y: 80, width: 310, height: 220 });
    expect(resizeBounds(start, "ne", 10, 20)).toEqual({ x: 100, y: 120, width: 310, height: 180 });
    expect(resizeBounds(start, "sw", 10, 20)).toEqual({ x: 110, y: 100, width: 290, height: 220 });
  });

  it("stops at the size limits and the page's top and left edges", () => {
    const start = { x: 100, y: 50, width: 300, height: 200 };
    expect(resizeBounds(start, "w", 1000, 0)).toEqual({ ...start, x: 280, width: MIN_BOX_WIDTH });
    expect(resizeBounds(start, "w", -1000, 0)).toEqual({ ...start, x: 0, width: 400 });
    expect(resizeBounds(start, "n", 0, -1000)).toEqual({ ...start, y: 0, height: 250 });
    expect(resizeBounds(start, "s", 0, -1000)).toEqual({ ...start, height: MIN_BOX_HEIGHT });
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
    const tall = { boxes: [textBox("a", { x: 0, y: 300, width: 400, height: 500 })] };
    expect(pageExtent(tall).height).toBe(1760);
    expect(pageExtent({ boxes: [] })).toEqual({ width: 480, height: 960 });
  });
});

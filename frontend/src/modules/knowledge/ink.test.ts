import { describe, expect, it } from "vitest";

import {
  addStroke,
  cleanPath,
  drawingBounds,
  eraseAt,
  JOIN_GAP,
  moveDrawing,
  putBackDrawings,
  removeDrawing,
  removeLastStroke,
  restackDrawing,
  strokePath,
} from "./ink";
import { addBox, newBox, pageExtent } from "./pageContent";
import type { PageContent } from "./types";

const pen = { color: "red", width: 4 } as const;
const empty: PageContent = { boxes: [] };

describe("ink", () => {
  it("cleans a pointer path: whole pixels on the page, no repeats, straight runs simplified", () => {
    const path = [
      { x: 10.4, y: 10.4 },
      { x: 10.2, y: 9.8 },
      { x: 20, y: 10 },
      { x: 30, y: 10.2 },
      { x: -5, y: 40 },
    ];
    expect(cleanPath(path)).toEqual([
      [10, 10],
      [30, 10],
      [0, 40],
    ]);
  });

  it("starts a drawing at the top left of its first stroke", () => {
    const { content, drawingId } = addStroke(
      empty,
      [
        [50, 80],
        [70, 60],
      ],
      pen,
      null,
      "d1",
    );
    expect(drawingId).toBe("d1");
    expect(content.drawings).toEqual([
      { id: "d1", x: 50, y: 60, strokes: [{ color: "red", width: 4, points: [0, 20, 20, 0] }] },
    ]);
  });

  it("joins a nearby stroke to the drawing just drawn, growing it up and left", () => {
    const first = addStroke(empty, [[100, 100]], pen, null, "d1").content;
    const near = addStroke(
      first,
      [
        [90, 90],
        [100, 95],
      ],
      { color: "blue", width: 2 },
      "d1",
      "d2",
    );
    expect(near.drawingId).toBe("d1");
    const drawing = near.content.drawings?.[0];
    expect(drawing).toMatchObject({ id: "d1", x: 90, y: 90 });
    expect(drawing?.strokes.map((s) => s.points)).toEqual([
      [10, 10],
      [0, 0, 10, 5],
    ]);
    expect(drawingBounds(drawing!)).toEqual({ x: 90, y: 90, width: 10, height: 10 });

    const far = addStroke(near.content, [[100 + JOIN_GAP + 20, 100]], pen, "d1", "d3");
    expect(far.drawingId).toBe("d3");
    expect(far.content.drawings?.map((d) => d.id)).toEqual(["d1", "d3"]);
  });

  it("keeps the boxes when drawing, and the drawings when editing boxes", () => {
    const withBox = addBox(empty, newBox("b", 0, 0));
    const drawn = addStroke(withBox, [[5, 5]], pen, null, "d1").content;
    expect(drawn.boxes).toHaveLength(1);
    expect(addBox(drawn, newBox("c", 9, 9)).drawings).toHaveLength(1);
  });

  it("undoes the last stroke only while it is still the last one", () => {
    const one = addStroke(empty, [[100, 100]], pen, null, "d1").content;
    const two = addStroke(one, [[90, 90]], pen, "d1", "x").content;
    const undone = removeLastStroke(two, "d1", 2);
    expect(undone.drawings?.[0]).toMatchObject({ x: 100, y: 100 });
    expect(undone.drawings?.[0]?.strokes).toHaveLength(1);
    expect(removeLastStroke(undone, "d1", 2)).toBe(undone);
    expect(removeLastStroke(undone, "d1", 1).drawings).toEqual([]);
  });

  it("moves a drawing by its points' top left, kept on the page", () => {
    const content = addStroke(
      empty,
      [
        [10, 10],
        [30, 40],
      ],
      pen,
      null,
      "d1",
    ).content;
    const moved = moveDrawing(content, "d1", 200, 300);
    expect(drawingBounds(moved.drawings![0]!)).toMatchObject({ x: 200, y: 300 });
    expect(moved.drawings?.[0]?.strokes).toBe(content.drawings?.[0]?.strokes);
    expect(drawingBounds(moveDrawing(content, "d1", -50, -50).drawings![0]!)).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("erases the strokes it touches; an emptied drawing goes and comes back on undo", () => {
    let content = addStroke(
      empty,
      [
        [0, 0],
        [100, 0],
      ],
      pen,
      null,
      "d1",
    ).content;
    content = addStroke(
      content,
      [
        [0, 30],
        [100, 30],
      ],
      pen,
      "d1",
      "x",
    ).content;
    content = addStroke(content, [[500, 500]], pen, null, "d2").content;

    const missed = eraseAt(content, 50, 15, 4);
    expect(missed.content).toBe(content);

    const once = eraseAt(content, 50, 31, 4);
    expect(once.content.drawings?.[0]?.strokes).toHaveLength(1);
    const twice = eraseAt(once.content, 502, 501, 4);
    expect(twice.content.drawings?.map((d) => d.id)).toEqual(["d1"]);

    const back = putBackDrawings(twice.content, [...once.before, ...twice.before]);
    expect(back.drawings).toEqual(content.drawings);
  });

  it("restacks and removes drawings", () => {
    let content = addStroke(empty, [[0, 0]], pen, null, "a").content;
    content = addStroke(content, [[900, 900]], pen, null, "b").content;
    expect(restackDrawing(content, "a", "front").drawings?.map((d) => d.id)).toEqual(["b", "a"]);
    expect(restackDrawing(content, "a", "back")).toBe(content);
    expect(removeDrawing(content, "a").drawings?.map((d) => d.id)).toEqual(["b"]);
  });

  it("draws smooth paths, and a single point as a dot", () => {
    expect(strokePath([4, 5])).toBe("M4 5l0 0");
    expect(strokePath([0, 0, 10, 0])).toBe("M0 0L10 0");
    expect(strokePath([0, 0, 10, 0, 10, 10])).toBe("M0 0L5 0Q10 0 10 5L10 10");
  });

  it("grows the page with its drawings", () => {
    const content = addStroke(
      empty,
      [
        [100, 2000],
        [300, 2100],
      ],
      pen,
      null,
      "d",
    ).content;
    expect(pageExtent(content)).toEqual({ width: 300 + 480, height: 2100 + 960 });
  });
});

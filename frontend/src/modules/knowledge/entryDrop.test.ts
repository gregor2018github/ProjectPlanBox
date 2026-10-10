import { describe, expect, it } from "vitest";

import type { DropInfo } from "../../ui/dnd";
import { collectionDropData, collectionMove, droppedCollection } from "./entryDrop";

function drop(fields: Partial<DropInfo>): DropInfo {
  return {
    canceled: false,
    target: null,
    group: null,
    index: null,
    initialGroup: null,
    initialIndex: null,
    ...fields,
  };
}

describe("droppedCollection", () => {
  it("reads the collection (or Unsorted) a row was dropped on", () => {
    const onRecipes = drop({ target: { id: "x", data: { ...collectionDropData("recipes") } } });
    const onUnsorted = drop({ target: { id: "y", data: { ...collectionDropData(null) } } });
    expect(droppedCollection(onRecipes)).toBe("recipes");
    expect(droppedCollection(onUnsorted)).toBeNull();
  });

  it("ignores cancelled drops and other targets", () => {
    const target = { id: "x", data: { ...collectionDropData("recipes") } };
    expect(droppedCollection(drop({ canceled: true, target }))).toBeUndefined();
    expect(
      droppedCollection(drop({ target: { id: "d", data: { kind: "date" } } })),
    ).toBeUndefined();
  });
});

describe("collectionMove", () => {
  const ids = ["a", "b", "c"];

  it("names the new neighbours", () => {
    expect(collectionMove("c", ids, drop({ initialIndex: 2, index: 0 }))).toEqual({
      after_id: null,
      before_id: "a",
    });
    expect(collectionMove("a", ids, drop({ initialIndex: 0, index: 1 }))).toEqual({
      after_id: "b",
      before_id: "c",
    });
  });

  it("does nothing when the collection stays put", () => {
    expect(collectionMove("b", ids, drop({ initialIndex: 1, index: 1 }))).toBeNull();
  });
});

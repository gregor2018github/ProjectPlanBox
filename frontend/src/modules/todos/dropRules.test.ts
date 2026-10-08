import { describe, expect, it } from "vitest";

import type { DropInfo } from "../../ui/dnd";
import { groupKey, resolveContainerDrop, resolveTodoDrop } from "./dropRules";
import { INBOX } from "./types";

const LIST = { list_id: "L", section_id: null, parent_id: null };

function drop(overrides: Partial<DropInfo>): DropInfo {
  return {
    canceled: false,
    target: null,
    group: groupKey(INBOX),
    index: 0,
    initialGroup: groupKey(INBOX),
    initialIndex: 0,
    ...overrides,
  };
}

describe("resolveTodoDrop", () => {
  it("ignores cancelled drags and drops back in place", () => {
    const target = { id: "b", data: { kind: "todo-row", placement: INBOX, ids: ["a", "b"] } };
    expect(resolveTodoDrop("a", drop({ canceled: true, target }))).toBeNull();
    expect(resolveTodoDrop("a", drop({ target }))).toBeNull();
  });

  it("reorders within a group using the new index", () => {
    const target = { id: "c", data: { kind: "todo-row", placement: INBOX, ids: ["a", "b", "c"] } };
    expect(resolveTodoDrop("a", drop({ target, index: 2 }))).toEqual({
      target: INBOX,
      after_id: "c",
      before_id: null,
    });
    expect(resolveTodoDrop("c", drop({ target, index: 0, initialIndex: 2 }))).toEqual({
      target: INBOX,
      after_id: null,
      before_id: "a",
    });
  });

  it("moves into another group between the right neighbours", () => {
    const target = { id: "y", data: { kind: "todo-row", placement: LIST, ids: ["x", "y"] } };
    const result = resolveTodoDrop("a", drop({ target, group: groupKey(LIST), index: 1 }));
    expect(result).toEqual({ target: LIST, after_id: "x", before_id: "y" });
  });

  it("appends when dropped on a destination such as a sidebar list", () => {
    const target = { id: "dest", data: { kind: "todo-destination", placement: LIST } };
    expect(resolveTodoDrop("a", drop({ target, group: null, index: null }))).toEqual({
      target: LIST,
      before_id: null,
      after_id: null,
    });
  });
});

describe("resolveContainerDrop", () => {
  it("moves a list into another area between neighbours", () => {
    const target = { id: "l2", data: { kind: "container-row", parentId: "A", ids: ["l1", "l2"] } };
    const info = drop({ target, group: "lists:A", initialGroup: "lists:loose", index: 1 });
    expect(resolveContainerDrop("x", info)).toEqual({
      parentId: "A",
      after_id: "l1",
      before_id: "l2",
    });
  });

  it("appends to an area dropped on its heading", () => {
    const target = { id: "area", data: { kind: "container-destination", parentId: "A" } };
    expect(resolveContainerDrop("x", drop({ target }))).toEqual({
      parentId: "A",
      before_id: null,
      after_id: null,
    });
  });
});

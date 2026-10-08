import { describe, expect, it } from "vitest";

import vectors from "../../../shared/ordering-vectors.json";
import { byPosition, keyBetween, placeAmong } from "./ordering";

interface Case {
  a: string | null;
  b: string | null;
  key: string;
}

describe("keyBetween", () => {
  it("reproduces every vector shared with the backend", () => {
    for (const c of vectors.cases as Case[]) {
      expect(keyBetween(c.a, c.b), JSON.stringify(c)).toBe(c.key);
    }
  });

  it("rejects reversed bounds and trailing zeros", () => {
    expect(() => keyBetween("a1", "a0")).toThrow();
    expect(() => keyBetween("a00", null)).toThrow();
  });
});

describe("placeAmong", () => {
  const siblings = [
    { id: "x", position: "a0" },
    { id: "y", position: "a1" },
    { id: "z", position: "a2" },
  ];

  it("places between neighbours, at the start, and at the end", () => {
    expect(placeAmong(siblings, "y", "x")).toBe(keyBetween("a0", "a1"));
    expect(placeAmong(siblings, "x", null)).toBe(keyBetween(null, "a0"));
    expect(placeAmong(siblings, null, null)).toBe(keyBetween("a2", null));
    expect(placeAmong(siblings, null, "y")).toBe(keyBetween("a1", "a2"));
  });

  it("sorts like the server", () => {
    const items = [
      { id: "b", position: "a1" },
      { id: "a", position: "a1" },
      { id: "c", position: "a0" },
    ];
    expect([...items].sort(byPosition).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

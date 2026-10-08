import { describe, expect, it, vi } from "vitest";

import { fuzzyScore, rank } from "./fuzzy";
import { CommandRegistry, type Command } from "./registry";

describe("fuzzyScore", () => {
  it("requires the characters in order", () => {
    expect(fuzzyScore("tsb", "Toggle sidebar")).not.toBeNull();
    expect(fuzzyScore("bst", "Toggle sidebar")).toBeNull();
  });

  it("prefers prefixes and word starts", () => {
    const prefix = fuzzyScore("tog", "Toggle sidebar") ?? 0;
    const inner = fuzzyScore("tog", "Photography") ?? 0;
    expect(prefix).toBeGreaterThan(inner);
  });
});

describe("rank", () => {
  const items = [
    { title: "Show keyboard shortcuts" },
    { title: "Toggle sidebar" },
    { title: "Theme: dark", keywords: ["night"] },
  ];

  it("returns everything for an empty query", () => {
    expect(rank(items, " ")).toEqual(items);
  });

  it("matches keywords and orders by score", () => {
    expect(rank(items, "night").map((i) => i.title)).toEqual(["Theme: dark"]);
    expect(rank(items, "side")[0]?.title).toBe("Toggle sidebar");
  });
});

describe("CommandRegistry", () => {
  const command = (id: string): Command => ({ id, title: id, group: "G", run: vi.fn() });

  it("replaces commands by id and unregisters its own batch", () => {
    const registry = new CommandRegistry();
    const first = registry.register([command("a"), command("b")]);
    const replacement = command("a");
    registry.register([replacement]);

    expect(registry.list().map((c) => c.id)).toEqual(["b", "a"]);
    first();
    expect(registry.list()).toEqual([replacement]);
  });
});

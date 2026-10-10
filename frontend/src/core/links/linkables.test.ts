import { FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { entityTypeOf, LinkableRegistry, type LinkableSource } from "./linkables";

const source = (entityType: string, titles: string[]): LinkableSource => ({
  entityType,
  noun: "Thing",
  icon: FileText,
  items: titles.map((title, i) => ({ ref: `${entityType}:${String(i)}`, title })),
});

describe("LinkableRegistry", () => {
  it("keeps one source per entity type and withdraws exactly what was registered", () => {
    const registry = new LinkableRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);

    const first = source("todos.todo", ["A"]);
    const withdrawFirst = registry.register(first);
    const second = source("todos.todo", ["A", "B"]);
    registry.register(second);
    withdrawFirst();

    expect(registry.list()).toEqual([second]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("entityTypeOf", () => {
  it("splits at the first colon", () => {
    expect(entityTypeOf("knowledge.entry:0192-abc")).toBe("knowledge.entry");
  });
});

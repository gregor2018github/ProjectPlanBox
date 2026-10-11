import { describe, expect, it } from "vitest";

import type { ModuleManifest } from "../core/module";
import { greeting, homeSections } from "./home";

const Card = () => null;
const manifest = (id: string, homeOrder?: number, card = true): ModuleManifest => ({
  id,
  label: id,
  routes: () => [],
  ...(card && { HomeSection: Card }),
  ...(homeOrder !== undefined && { homeOrder }),
});

describe("home", () => {
  it("greets by the hour", () => {
    expect([2, 5, 11, 12, 17, 18, 23].map(greeting)).toEqual([
      "Good night",
      "Good morning",
      "Good morning",
      "Good afternoon",
      "Good afternoon",
      "Good evening",
      "Good evening",
    ]);
  });

  it("orders cards by homeOrder, then the rest in sidebar order", () => {
    const modules = [
      manifest("a"),
      manifest("b", 2),
      manifest("c", undefined, false),
      manifest("d", 1),
      manifest("e"),
    ];
    expect(homeSections(modules).map((m) => m.id)).toEqual(["d", "b", "a", "e"]);
  });
});

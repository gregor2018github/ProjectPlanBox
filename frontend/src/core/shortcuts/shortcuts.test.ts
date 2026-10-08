import { describe, expect, it, vi } from "vitest";

import { chordMatches, formatKeys, isTypingTarget, parseKeys, type KeyEventLike } from "./keys";
import { SEQUENCE_TIMEOUT_MS, ShortcutRegistry, type ShortcutEvent } from "./registry";

function key(k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

function press(k: string, mods: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { ...key(k), target: document.body, ...mods };
}

describe("parseKeys", () => {
  it("parses modifiers, aliases and sequences", () => {
    expect(parseKeys("Ctrl+K")).toEqual([
      { key: "k", ctrl: true, alt: false, shift: false, meta: false },
    ]);
    expect(parseKeys("Alt+Up")[0]?.key).toBe("ArrowUp");
    expect(parseKeys("G I").map((c) => c.key)).toEqual(["g", "i"]);
    expect(parseKeys("Space")[0]?.key).toBe(" ");
  });

  it("rejects specs without a key", () => {
    expect(() => parseKeys("Ctrl+")).toThrow();
  });
});

describe("chordMatches", () => {
  it("matches letters case-insensitively but respects Shift", () => {
    const [q] = parseKeys("Q");
    const [shiftQ] = parseKeys("Shift+Q");
    expect(chordMatches(q!, key("q"))).toBe(true);
    expect(chordMatches(q!, key("Q", { shiftKey: true }))).toBe(false);
    expect(chordMatches(shiftQ!, key("Q", { shiftKey: true }))).toBe(true);
  });

  it("requires exactly the listed modifiers", () => {
    const [ctrlK] = parseKeys("Ctrl+K");
    expect(chordMatches(ctrlK!, key("k", { ctrlKey: true }))).toBe(true);
    expect(chordMatches(ctrlK!, key("k"))).toBe(false);
    expect(chordMatches(ctrlK!, key("k", { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("accepts symbols typed with Shift or AltGr (German layout)", () => {
    const [question] = parseKeys("?");
    const [bracket] = parseKeys("[");
    expect(chordMatches(question!, key("?", { shiftKey: true }))).toBe(true);
    expect(chordMatches(bracket!, key("[", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(chordMatches(bracket!, key("[", { ctrlKey: true }))).toBe(false);
  });
});

describe("formatKeys", () => {
  it("produces key caps per chord", () => {
    expect(formatKeys("Ctrl+K")).toEqual([["Ctrl", "K"]]);
    expect(formatKeys("G I")).toEqual([["G"], ["I"]]);
    expect(formatKeys("Alt+ArrowUp")).toEqual([["Alt", "↑"]]);
  });
});

describe("isTypingTarget", () => {
  it("treats text fields as typing, checkboxes not", () => {
    const text = document.createElement("input");
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});

describe("ShortcutRegistry", () => {
  it("runs a matching shortcut and reports consumption", () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: "a", keys: "Q", description: "", group: "", run });

    expect(registry.handle(press("q"))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(registry.handle(press("w"))).toBe(false);
  });

  it("skips plain keys while typing unless allowed", () => {
    const registry = new ShortcutRegistry();
    const plain = vi.fn();
    const palette = vi.fn();
    registry.register({ id: "q", keys: "Q", description: "", group: "", run: plain });
    registry.register({
      id: "k",
      keys: "Ctrl+K",
      description: "",
      group: "",
      allowInInput: true,
      run: palette,
    });
    const input = document.createElement("input");

    registry.handle(press("q", { target: input }));
    registry.handle(press("k", { ctrlKey: true, target: input }));

    expect(plain).not.toHaveBeenCalled();
    expect(palette).toHaveBeenCalledOnce();
  });

  it("completes sequences within the timeout only", () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: "gi", keys: "G I", description: "", group: "", run });

    expect(registry.handle(press("g"), 0)).toBe(true);
    registry.handle(press("i"), 500);
    expect(run).toHaveBeenCalledOnce();

    registry.handle(press("g"), 1000);
    registry.handle(press("i"), 1000 + SEQUENCE_TIMEOUT_MS + 1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("lets the latest registration win and unregisters cleanly", () => {
    const registry = new ShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.register({ id: "one", keys: "X", description: "", group: "", run: first });
    const off = registry.register({
      id: "two",
      keys: "X",
      description: "",
      group: "",
      run: second,
    });

    registry.handle(press("x"));
    off();
    registry.handle(press("x"));

    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
  });

  it("notifies subscribers with a stable snapshot", () => {
    const registry = new ShortcutRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const before = registry.list();

    registry.register({ id: "a", keys: "A", description: "Do A", group: "G", run: vi.fn() });

    expect(listener).toHaveBeenCalledOnce();
    expect(registry.list()).not.toBe(before);
    expect(registry.list()).toBe(registry.list());
    expect(registry.list().map((s) => s.id)).toEqual(["a"]);
  });
});

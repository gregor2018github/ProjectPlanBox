import { describe, expect, it } from "vitest";

import { QUOTES } from "./quoteList";
import { pickQuoteIndex } from "./quotes";

describe("quotes", () => {
  it("never repeats the previous start's quote", () => {
    const picks = [0, 0.3, 0.5, 0.99].map((r) => pickQuoteIndex(5, 2, () => r));
    expect(picks).toEqual([0, 1, 3, 4]);
  });

  it("can pick any quote when there is no previous one", () => {
    expect(pickQuoteIndex(5, null, () => 0)).toBe(0);
    expect(pickQuoteIndex(5, null, () => 0.99)).toBe(4);
    expect(pickQuoteIndex(5, 9, () => 0.99)).toBe(4);
  });

  it("handles a single quote", () => {
    expect(pickQuoteIndex(1, 0, () => 0.5)).toBe(0);
  });

  it("has no empty or duplicate quotes, and every one names its source", () => {
    const texts = QUOTES.map((q) => q.text);
    const blank = QUOTES.filter((q) => [q.text, q.author, q.source].some((s) => s.trim() === ""));
    expect(blank).toEqual([]);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

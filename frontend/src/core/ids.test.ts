import { describe, expect, it } from "vitest";

import { isValidId, newId } from "./ids";

describe("newId", () => {
  it("produces valid UUIDv7 strings", () => {
    const id = newId();
    expect(isValidId(id)).toBe(true);
  });

  it("is monotonic, even within one millisecond", () => {
    const ids = Array.from({ length: 5000 }, () => newId(() => 1_760_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    // Later than any instant used above: ids never go backwards within a page.
    const ms = 1_900_000_000_000;
    const id = newId(() => ms);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(ms);
  });
});

describe("isValidId", () => {
  it("rejects other versions and uppercase", () => {
    expect(isValidId("01a11c71-6563-473d-8602-c5617ab6aaed")).toBe(false);
    expect(isValidId("01A11C71-6563-773D-8602-C5617AB6AAED")).toBe(false);
  });
});

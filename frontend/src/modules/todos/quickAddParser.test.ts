import { describe, expect, it } from "vitest";

import { parseQuickAdd, type ParseContext } from "./quickAddParser";

// Thursday, 8 October 2026.
const ctx: ParseContext = {
  today: "2026-10-08",
  lists: [
    { id: "home", name: "Home" },
    { id: "reno", name: "Home Renovation" },
  ],
  sections: [
    { id: "bills", list_id: "home", name: "Bills" },
    { id: "next", list_id: "reno", name: "Next steps" },
  ],
  tags: [{ id: "money", name: "Money" }],
};

const parse = (text: string) => parseQuickAdd(text, ctx);

describe("dates", () => {
  it.each([
    ["Call mom today", "2026-10-08"],
    ["Call mom tomorrow", "2026-10-09"],
    ["Call mom tmr", "2026-10-09"],
    ["Call mom fri", "2026-10-09"],
    ["Call mom thursday", "2026-10-15"],
    ["Call mom mon", "2026-10-12"],
    ["Call mom next week", "2026-10-12"],
    ["Call mom in 3 days", "2026-10-11"],
    ["Call mom in a week", "2026-10-15"],
    ["Call mom in 2 weeks", "2026-10-22"],
    ["Call mom 24.12", "2026-12-24"],
    ["Call mom 1.2", "2027-02-01"],
    ["Call mom 3.4.2027", "2027-04-03"],
    ["Call mom 2026-11-30", "2026-11-30"],
  ])("%s → %s", (text, due) => {
    const result = parse(text);
    expect(result.due_date).toBe(due);
    expect(result.title).toBe("Call mom");
  });

  it("ignores impossible dates and keeps only the first date", () => {
    expect(parse("Pay 31.2").due_date).toBeNull();
    const twice = parse("Plan today tomorrow");
    expect(twice.due_date).toBe("2026-10-08");
    expect(twice.title).toBe("Plan tomorrow");
  });
});

describe("priority, tags and place", () => {
  it("reads priorities", () => {
    expect(parse("Fix leak !1").priority).toBe(3);
    expect(parse("Fix leak !3").priority).toBe(1);
    expect(parse("Fix leak").priority).toBeNull();
  });

  it("resolves known tags and collects new ones", () => {
    const result = parse("Pay rent @money @urgent");
    expect(result.tag_ids).toEqual(["money"]);
    expect(result.new_tags).toEqual(["urgent"]);
    expect(result.title).toBe("Pay rent");
  });

  it("matches the longest list name and optional section", () => {
    expect(parse("Buy paint #Home Renovation").place).toEqual({
      list_id: "reno",
      section_id: null,
    });
    expect(parse("Pay #home/bills now").place).toEqual({ list_id: "home", section_id: "bills" });
    const spaced = parse("Call #Home Renovation/Next steps soon");
    expect(spaced.place).toEqual({ list_id: "reno", section_id: "next" });
    expect(spaced.title).toBe("Call soon");
  });

  it("leaves unknown #words in the title", () => {
    const result = parse("Learn #rust");
    expect(result.place).toBeNull();
    expect(result.title).toBe("Learn #rust");
  });

  it("produces chips for everything it understood", () => {
    expect(parse("Pay rent fri !1 @money #Home/Bills").tokens.map((t) => t.kind)).toEqual([
      "due",
      "priority",
      "tag",
      "place",
    ]);
  });
});

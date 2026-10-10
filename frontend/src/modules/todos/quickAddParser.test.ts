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

describe("repeats", () => {
  it.each([
    ["Stretch every day", "FREQ=DAILY", "2026-10-08"],
    ["Water every 3 days", "FREQ=DAILY;INTERVAL=3", "2026-10-08"],
    ["Review every other week", "FREQ=WEEKLY;INTERVAL=2", "2026-10-08"],
    ["Backup every month", "FREQ=MONTHLY", "2026-10-08"],
    ["Standup every weekday", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-08"],
    ["Bins every monday", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12"],
    ["Gym every tue, fri", "FREQ=WEEKLY;BYDAY=TU,FR", "2026-10-09"],
    ["Gym every fri and mon", "FREQ=WEEKLY;BYDAY=MO,FR", "2026-10-09"],
    ["Gym every mon,thu", "FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-08"],
    ["Pay every 1st and 15th", "FREQ=MONTHLY;BYMONTHDAY=1,15", "2026-10-15"],
    ["Invoice every last day", "FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31"],
  ])("%s → %s from %s", (text, rule, due) => {
    const result = parse(text);
    expect(result.rrule).toBe(rule);
    expect(result.due_date).toBe(due);
    expect(result.repeat_from).toBe("due");
    expect(result.title).toBe(text.split(" ")[0]);
  });

  it("counts a plain interval from completion with 'after done'", () => {
    const result = parse("Haircut every 4 weeks after done !2");
    expect(result.rrule).toBe("FREQ=WEEKLY;INTERVAL=4");
    expect(result.repeat_from).toBe("completion");
    expect(result.priority).toBe(2);
    expect(result.title).toBe("Haircut");
    expect(result.tokens.find((t) => t.kind === "repeat")?.label).toBe(
      "Every 4 weeks after completion",
    );
  });

  it("keeps an explicit date as the first one, wherever it is typed", () => {
    const result = parse("Bins every monday 2026-10-19");
    expect(result.due_date).toBe("2026-10-19");
    expect(parse("Bins 2026-10-19 every monday").rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("leaves 'every' alone when no repeat follows", () => {
    const result = parse("Read every chapter");
    expect(result.rrule).toBeNull();
    expect(result.title).toBe("Read every chapter");
    expect(parse("Call mom every mon and dad").title).toBe("Call mom and dad");
  });

  it("describes the repeat in the chip", () => {
    expect(parse("Bins every monday").tokens).toContainEqual({
      kind: "repeat",
      text: "every monday",
      label: "Every week on Mon",
    });
  });
});

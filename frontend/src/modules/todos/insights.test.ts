import { describe, expect, it } from "vitest";

import { completionsByWeekday, peakHour, punchcardColumns, weekColumns } from "./insights";

function emptyCard(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

describe("weekColumns", () => {
  it("puts completed first and labels the week a month starts in", () => {
    const columns = weekColumns([
      { start: "2026-09-21", added: 4, completed: 2, deleted: 0 },
      { start: "2026-09-28", added: 1, completed: 3, deleted: 1 },
    ]);
    expect(columns.map((c) => [c.label, c.tick, c.values])).toEqual([
      ["Week of Mon 21 Sep", undefined, [2, 4]],
      ["Week of Mon 28 Sep", "Oct", [3, 1]],
    ]);
  });
});

describe("punch card", () => {
  const card = emptyCard();
  card[1]![9] = 4; // Tuesday 09:00
  card[3]![14] = 1; // Thursday 14:00

  it("turns hours into columns with weekdays as rows", () => {
    const columns = punchcardColumns(card);
    expect(columns).toHaveLength(24);
    expect(columns[9]!.cells[1]).toMatchObject({
      value: 4,
      label: "Tue 09:00–10:00 · 4 completed",
    });
    expect(columns[9]!.tick).toBe("09");
  });

  it("finds the peak and sums weekdays", () => {
    expect(peakHour(card)).toEqual([1, 9]);
    expect(peakHour(emptyCard())).toBeNull();
    expect(completionsByWeekday(card)).toEqual([0, 4, 0, 1, 0, 0, 0]);
  });
});

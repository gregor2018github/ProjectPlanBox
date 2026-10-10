import { describe, expect, it } from "vitest";

import { draftFromItem, draftTiming, newDraft, newTimedDraft, withStart } from "./draft";
import { itemOf, makeAllDay, makeEvent, TZ } from "./testData";

describe("event drafts", () => {
  it("starts new events as all-day or at the given times", () => {
    expect(newDraft("2026-10-08")).toMatchObject({ allDay: true, startDate: "2026-10-08" });
    expect(newDraft("2026-10-08", { start: 1380, end: 1440 })).toMatchObject({
      allDay: false,
      endDate: "2026-10-09",
      endMinutes: 0,
    });
  });

  it("suggests the next full hour today and 09:00 on other days", () => {
    const now = { date: "2026-10-08", minutes: 14 * 60 + 20 };
    expect(newTimedDraft("2026-10-08", now)).toMatchObject({ startMinutes: 900, endMinutes: 960 });
    expect(newTimedDraft("2026-10-09", now)).toMatchObject({ startMinutes: 540 });
  });

  it("reads an occurrence in local time and writes it back unchanged", () => {
    const item = itemOf(makeEvent());
    const draft = draftFromItem(item, TZ);
    expect(draft).toMatchObject({ startDate: "2026-10-08", startMinutes: 540, endMinutes: 600 });
    expect(draftTiming(draft, TZ)).toEqual({
      all_day: false,
      start_at: item.event.start_at,
      end_at: item.event.end_at,
      start_date: null,
      end_date: null,
    });
    const allDay = draftFromItem(itemOf(makeAllDay("2026-10-08", "2026-10-09")), TZ);
    expect(draftTiming(allDay, TZ)).toMatchObject({
      start_date: "2026-10-08",
      end_date: "2026-10-09",
    });
  });

  it("explains an inverted range instead of saving it", () => {
    const draft = { ...newDraft("2026-10-08", { start: 600, end: 660 }), endMinutes: 540 };
    expect(draftTiming(draft, TZ)).toBe("The event must end after it starts.");
  });

  it("drags the end along when the start moves", () => {
    const draft = newDraft("2026-10-08", { start: 600, end: 690 });
    expect(withStart(draft, "2026-10-08", 1380)).toMatchObject({
      startMinutes: 1380,
      endDate: "2026-10-09",
      endMinutes: 30,
    });
    expect(withStart(draft, "2026-10-12", 600)).toMatchObject({ endDate: "2026-10-12" });
  });
});

import { describe, expect, it } from "vitest";

import { occurrenceTimeLabel, segmentLabel } from "./format";
import { segmentsOf } from "./selectors";
import { itemOf, makeAllDay, makeEvent, TZ } from "./testData";

describe("occurrenceTimeLabel", () => {
  it("reads the whole range of a multi-day event", () => {
    const timed = makeEvent({
      title: "Trip",
      start_at: "2026-10-12T04:00:00.000Z",
      end_at: "2026-10-15T20:00:00.000Z",
    });
    const [first] = segmentsOf(itemOf(timed), TZ);
    expect(first && occurrenceTimeLabel(first)).toBe("Mon 12 Oct 06:00 – Thu 15 Oct 22:00");
    expect(first && segmentLabel(first)).toBe("Trip, Mon 12 Oct 06:00 – Thu 15 Oct 22:00");

    const [day] = segmentsOf(itemOf(makeAllDay("2026-10-12", "2026-10-14")), TZ);
    expect(day && occurrenceTimeLabel(day)).toBe("Mon 12 Oct – Wed 14 Oct");
  });

  it("keeps the day's times for a single-day event", () => {
    const [segment] = segmentsOf(itemOf(makeEvent()), TZ);
    expect(segment && occurrenceTimeLabel(segment)).toBe("09:00–10:00");
  });
});

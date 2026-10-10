import { describe, expect, it } from "vitest";

import {
  applyAdd,
  applyDetach,
  applyRemoveFrom,
  applyRemoveOccurrence,
  applyReplace,
  applySplit,
} from "./apply";
import { makeAllDay, makeEvent, TZ } from "./testData";
import { occurrenceTiming, placeLike, retime, seriesTimingFor, singleOccurrence } from "./timing";
import type { CalendarEvent, CalendarRange, Occurrence } from "./types";

/** A weekly Monday 09:00 series with occurrences on 5, 12, 19 and 26 October. */
function weekly(): { series: CalendarEvent; range: CalendarRange } {
  const series = makeEvent({
    start_at: "2026-10-05T07:00:00.000Z",
    end_at: "2026-10-05T08:00:00.000Z",
    rrule: "FREQ=WEEKLY",
  });
  const occurrences: Occurrence[] = ["05", "12", "19", "26"].map((d) => ({
    ...placeLike(series, `2026-10-${d}`, TZ),
    event_id: series.id,
    occurrence_date: `2026-10-${d}`,
  }));
  return { series, range: { events: [series], occurrences } };
}

const dates = (range: CalendarRange, id: string) =>
  range.occurrences.filter((o) => o.event_id === id).map((o) => o.occurrence_date);

describe("timing", () => {
  it("keeps local time when an occurrence moves across the DST change", () => {
    const { range } = weekly();
    const last = range.occurrences[3];
    expect(last?.start_at).toBe("2026-10-26T08:00:00.000Z");
  });

  it("moves the series start the way one occurrence moved", () => {
    const { series, range } = weekly();
    const occurrence = occurrenceTiming(
      series,
      range.occurrences[2] ?? singleOccurrence(series, TZ),
    );
    const moved = placeLike(occurrence, "2026-10-20", TZ); // Monday 19 -> Tuesday 20
    const next = seriesTimingFor(series, occurrence, moved, TZ);
    expect(next.start_at).toBe("2026-10-06T07:00:00.000Z");
  });

  it("retimes an all-day occurrence by whole days", () => {
    const before = makeAllDay("2026-10-08", "2026-10-09");
    const after = { ...before, start_date: "2026-10-10", end_date: "2026-10-10" };
    const o = retime(singleOccurrence(before, TZ), before, after, TZ);
    expect([o.occurrence_date, o.start_date, o.end_date]).toEqual([
      "2026-10-10",
      "2026-10-10",
      "2026-10-10",
    ]);
  });
});

describe("optimistic patches", () => {
  it("adds a new event with its occurrence", () => {
    const event = makeEvent();
    const range = applyAdd({ events: [], occurrences: [] }, event, TZ);
    expect(dates(range, event.id)).toEqual(["2026-10-08"]);
  });

  it("moves every occurrence when the whole series changes time", () => {
    const { series, range } = weekly();
    const after = {
      ...series,
      start_at: "2026-10-05T08:00:00.000Z",
      end_at: "2026-10-05T09:00:00.000Z",
    };
    const next = applyReplace(range, series, after, TZ);
    expect(next.occurrences.map((o) => o.start_at)).toEqual([
      "2026-10-05T08:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
      "2026-10-19T08:00:00.000Z",
      "2026-10-26T09:00:00.000Z",
    ]);
  });

  it("detaches one occurrence into a single event", () => {
    const { series, range } = weekly();
    const detached = {
      ...series,
      id: "split",
      rrule: null,
      start_at: "2026-10-13T07:00:00.000Z",
      end_at: "2026-10-13T08:00:00.000Z",
    };
    const next = applyDetach(range, series.id, "2026-10-12", detached, TZ);
    expect(dates(next, series.id)).toEqual(["2026-10-05", "2026-10-19", "2026-10-26"]);
    expect(dates(next, "split")).toEqual(["2026-10-13"]);
  });

  it("splits a series: later occurrences move to the new one", () => {
    const { series, range } = weekly();
    const before = occurrenceTiming(series, range.occurrences[2] ?? singleOccurrence(series, TZ));
    const tail = {
      ...series,
      id: "tail",
      title: "Sync",
      start_at: "2026-10-19T08:00:00.000Z",
      end_at: "2026-10-19T09:00:00.000Z",
    };
    const next = applySplit(range, series.id, "2026-10-19", before, tail, TZ);
    expect(dates(next, series.id)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(dates(next, "tail")).toEqual(["2026-10-19", "2026-10-26"]);
  });

  it("removes one, the following, or all occurrences", () => {
    const { series, range } = weekly();
    expect(dates(applyRemoveOccurrence(range, series.id, "2026-10-12"), series.id)).toHaveLength(3);
    expect(dates(applyRemoveFrom(range, series.id, "2026-10-19"), series.id)).toEqual([
      "2026-10-05",
      "2026-10-12",
    ]);
    const gone = applyRemoveFrom(range, series.id);
    expect(gone).toEqual({ events: [], occurrences: [] });
  });
});

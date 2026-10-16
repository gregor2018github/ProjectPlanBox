import { describe, expect, it } from "vitest";

import vectors from "../../../../shared/recurrence-vectors.json";
import * as recurrence from "./recurrence";
import { dateDay, DAY_MS, isoDate, midnight, toIso } from "./time";

const ZONE = vectors.zone;

interface Case {
  rule: string;
  error?: boolean;
  normalized?: string;
  first?: string[][];
  between?: { start: string; end: string; skip: string[]; spans: string[][] };
  on?: Record<string, string[] | null>;
  count_before?: number;
  end_before?: string;
  remaining?: string;
}

function naiveIso(ms: number): string {
  // Python's isoformat() of a naive midnight datetime: 2026-10-14T00:00:00
  return new Date(ms).toISOString().slice(0, 19);
}

function spanText(span: recurrence.Span, allDay: boolean): string[] {
  return allDay
    ? [isoDate(span.occurrenceDate), naiveIso(span.start), naiveIso(span.end)]
    : [isoDate(span.occurrenceDate), toIso(span.start), toIso(span.end)];
}

function check(c: Case, anchor: recurrence.Anchor, allDay: boolean): void {
  if (c.error === true) {
    expect(() => recurrence.normalize(c.rule, anchor, ZONE), c.rule).toThrow(
      recurrence.RecurrenceError,
    );
    return;
  }
  const text = recurrence.normalize(c.rule, anchor, ZONE);
  expect(text, c.rule).toBe(c.normalized);
  const first: string[][] = [];
  for (const span of recurrence.iterate(text, anchor)) {
    if (first.length >= 15) break;
    first.push(spanText(span, allDay));
  }
  expect(first, `${c.rule} first`).toEqual(c.first);

  const between = c.between;
  if (between === undefined) throw new Error("missing between");
  const lo = dateDay(between.start);
  const hi = dateDay(between.end);
  const range = allDay ? [lo * DAY_MS, hi * DAY_MS] : [midnight(lo, ZONE), midnight(hi, ZONE)];
  const spans = recurrence.between(
    text,
    anchor,
    range[0] ?? 0,
    range[1] ?? 0,
    new Set(between.skip.map(dateDay)),
  );
  expect(
    spans.map((s) => spanText(s, allDay)),
    `${c.rule} between`,
  ).toEqual(between.spans);

  for (const [day, expected] of Object.entries(c.on ?? {})) {
    const found = recurrence.occurrenceOn(text, anchor, dateDay(day), ZONE);
    expect(found === null ? null : spanText(found, allDay), `${c.rule} on ${day}`).toEqual(
      expected,
    );
  }
  const cut = Object.keys(c.on ?? {})[3] ?? "";
  expect(recurrence.countBefore(text, anchor, dateDay(cut)), `${c.rule} count`).toBe(
    c.count_before,
  );
  expect(recurrence.endBefore(text, anchor, dateDay(cut), ZONE), `${c.rule} end`).toBe(
    c.end_before,
  );
  expect(recurrence.remaining(text, anchor, dateDay(cut)), `${c.rule} remaining`).toBe(c.remaining);
}

describe("recurrence matches dateutil", () => {
  it("timed anchors", () => {
    for (const c of vectors.timed as (Case & { start_at: string; end_at: string })[]) {
      const anchor = recurrence.timedAnchor(Date.parse(c.start_at), Date.parse(c.end_at), ZONE);
      check(c, anchor, false);
    }
  });

  it("all-day anchors", () => {
    for (const c of vectors.all_day as (Case & { start_date: string; end_date: string })[]) {
      const anchor = recurrence.allDayAnchor(dateDay(c.start_date), dateDay(c.end_date));
      check(c, anchor, true);
    }
  });

  it("floating-date helpers", () => {
    for (const raw of vectors.floating) {
      const c = raw as Record<string, unknown> & { rule: string; start: string };
      const start = dateDay(c.start);
      const anchor = recurrence.allDayAnchor(start, start);
      if (c.error === true) continue;
      const text = recurrence.normalize(c.rule, anchor, ZONE);
      expect(text).toBe(c.normalized);
      for (const [day, expected] of Object.entries(c.date_after as Record<string, string | null>)) {
        const found = recurrence.dateAfter(text, start, dateDay(day));
        expect(found === null ? null : isoDate(found), `${c.rule} after ${day}`).toBe(expected);
      }
      const series = c.series as { after: string; first: string; last: string; dates: string[] };
      expect(
        recurrence
          .seriesDates(
            text,
            start,
            dateDay(series.after),
            dateDay(series.first),
            dateDay(series.last),
            25,
          )
          .map(isoDate),
        `${c.rule} series`,
      ).toEqual(series.dates);
      expect(recurrence.isPlain(text)).toBe(c.plain);
      if (c.plain === true) {
        expect(isoDate(recurrence.step(text, start)), `${c.rule} step`).toBe(c.step);
        const stepped = recurrence.stepAfter(text, start);
        expect(stepped === null ? null : [isoDate(stepped[0]), stepped[1]]).toEqual(c.step_after);
        expect(
          recurrence
            .steppedDates(text, start, dateDay(series.first), dateDay(series.last), 25)
            .map(isoDate),
        ).toEqual(c.stepped);
        const until = recurrence.floatingUntil(text);
        expect(until === null ? null : isoDate(until)).toBe(c.floating_until);
      }
    }
  });
});

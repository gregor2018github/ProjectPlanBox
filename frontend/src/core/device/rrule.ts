/**
 * RRULE expansion with python-dateutil's semantics, for the parts PlanBox
 * accepts (FREQ, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST,
 * COUNT, UNTIL). `shared/recurrence-vectors.json`, written by dateutil,
 * checks that both sides produce the same dates.
 *
 * Every occurrence happens at the anchor's time of day, so expansion is
 * about days: each period (a day, week, month or year from the anchor's)
 * offers its days, the BY parts filter them, BYSETPOS picks among the rest.
 */
import { addMonths, dayOf, isLeap, monthLength, weekday, ymd, type Day } from "./time";

/** RRULE frequencies, in dateutil's order (YEARLY is 0). */
export type Frequency = "YEARLY" | "MONTHLY" | "WEEKLY" | "DAILY";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const MAX_YEAR = 9999;

/** A parsed rule. `until` is checked by the caller's moment function. */
export interface Rule {
  freq: Frequency;
  interval: number;
  count: number | null;
  byDay: { weekday: number; n: number }[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  wkst: number;
}

/** Thrown for parts dateutil would reject. */
export class RuleError extends Error {}

function ints(value: string, what: string): number[] {
  return value.split(",").map((piece) => {
    if (!/^[+-]?\d+$/.test(piece)) throw new RuleError(`invalid ${what}: ${piece}`);
    return Number(piece);
  });
}

/** Builds a rule from validated parts (see `recurrence.parse`). */
export function buildRule(parts: ReadonlyMap<string, string>): Rule {
  const freq = parts.get("FREQ") as Frequency;
  const byDay = (parts.get("BYDAY")?.split(",") ?? []).map((piece) => {
    const match = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(piece);
    if (match === null) throw new RuleError(`invalid weekday: ${piece}`);
    const n = match[1] === undefined ? 0 : Number(match[1]);
    if (n === 0 && match[1] !== undefined) throw new RuleError(`invalid weekday: ${piece}`);
    return { weekday: WEEKDAYS.indexOf(match[2] ?? ""), n };
  });
  const bySetPos = parts.has("BYSETPOS") ? ints(parts.get("BYSETPOS") ?? "", "BYSETPOS") : [];
  for (const pos of bySetPos) {
    if (pos === 0 || Math.abs(pos) > 366) {
      throw new RuleError("bysetpos must be between 1 and 366, or between -366 and -1");
    }
  }
  const wkstText = parts.get("WKST");
  const wkst = wkstText === undefined ? 0 : WEEKDAYS.indexOf(wkstText);
  if (wkst < 0) throw new RuleError(`invalid WKST: ${wkstText ?? ""}`);
  return {
    freq,
    interval: Number(parts.get("INTERVAL") ?? "1"),
    count: parts.has("COUNT") ? Number(parts.get("COUNT")) : null,
    byDay,
    byMonthDay: parts.has("BYMONTHDAY") ? ints(parts.get("BYMONTHDAY") ?? "", "BYMONTHDAY") : [],
    byMonth: parts.has("BYMONTH") ? ints(parts.get("BYMONTH") ?? "", "BYMONTH") : [],
    bySetPos,
    wkst,
  };
}

/**
 * The dates of a series anchored on `start`, in order, from the anchor on.
 * `stop(day)` ends the series (UNTIL); COUNT counts what was yielded.
 */
export function* expand(rule: Rule, start: Day, stop: (day: Day) => boolean): Generator<Day> {
  const first = ymd(start);
  let byMonth = rule.byMonth;
  let byMonthDay = rule.byMonthDay;
  let byDay = rule.byDay;
  // dateutil's defaults when no day is named: the anchor's own.
  if (byDay.length === 0 && byMonthDay.length === 0) {
    if (rule.freq === "YEARLY") {
      if (byMonth.length === 0) byMonth = [first.month];
      byMonthDay = [first.day];
    } else if (rule.freq === "MONTHLY") {
      byMonthDay = [first.day];
    } else if (rule.freq === "WEEKLY") {
      byDay = [{ weekday: weekday(start), n: 0 }];
    }
  }
  const ordinalsApply = rule.freq === "YEARLY" || rule.freq === "MONTHLY";
  const plainDays = new Set(byDay.filter((d) => d.n === 0 || !ordinalsApply).map((d) => d.weekday));
  const nthDays = ordinalsApply ? byDay.filter((d) => d.n !== 0) : [];
  const months = new Set(byMonth);
  const positiveMonthDays = new Set(byMonthDay.filter((d) => d > 0));
  const negativeMonthDays = new Set(byMonthDay.filter((d) => d < 0));

  let emitted = 0;
  for (let period = 0; ; period += 1) {
    const span = periodDays(rule, start, period);
    if (span === null) return;
    const [lo, hi] = span;
    const nth = nthDays.length > 0 ? nthMask(rule, nthDays, lo, hi, byMonth) : null;
    let days: Day[] = [];
    for (let day = lo; day <= hi; day += 1) {
      const date = ymd(day);
      if (months.size > 0 && !months.has(date.month)) continue;
      if (plainDays.size > 0 && !plainDays.has(weekday(day))) continue;
      if (nth !== null && !nth.has(day)) continue;
      if (positiveMonthDays.size > 0 || negativeMonthDays.size > 0) {
        const fromEnd = date.day - monthLength(date.year, date.month) - 1;
        if (!positiveMonthDays.has(date.day) && !negativeMonthDays.has(fromEnd)) continue;
      }
      days.push(day);
    }
    if (rule.bySetPos.length > 0) {
      const picked = new Set<Day>();
      for (const pos of rule.bySetPos) {
        const found = pos > 0 ? days[pos - 1] : days[days.length + pos];
        if (found !== undefined) picked.add(found);
      }
      days = [...picked].sort((a, b) => a - b);
    }
    for (const day of days) {
      if (day < start) continue;
      if (stop(day)) return;
      yield day;
      emitted += 1;
      if (rule.count !== null && emitted >= rule.count) return;
    }
  }
}

/** The first and last day of a period, or null past year 9999. */
function periodDays(rule: Rule, start: Day, period: number): [Day, Day] | null {
  const step = period * rule.interval;
  const first = ymd(start);
  switch (rule.freq) {
    case "DAILY": {
      const day = start + step;
      return ymd(day).year > MAX_YEAR ? null : [day, day];
    }
    case "WEEKLY": {
      const weekStart = start - ((weekday(start) - rule.wkst + 7) % 7) + 7 * step;
      return ymd(weekStart).year > MAX_YEAR ? null : [weekStart, weekStart + 6];
    }
    case "MONTHLY": {
      const index = first.year * 12 + first.month - 1 + step;
      const year = Math.floor(index / 12);
      const month = index - year * 12 + 1;
      if (year > MAX_YEAR) return null;
      const lo = dayOf(year, month, 1);
      return [lo, lo + monthLength(year, month) - 1];
    }
    case "YEARLY": {
      const year = first.year + step;
      if (year > MAX_YEAR) return null;
      const lo = dayOf(year, 1, 1);
      return [lo, lo + (isLeap(year) ? 365 : 364)];
    }
  }
}

/** The days matching ordinal weekdays (2TU, -1FR) within a month or year period. */
function nthMask(
  rule: Rule,
  nthDays: readonly { weekday: number; n: number }[],
  lo: Day,
  hi: Day,
  byMonth: readonly number[],
): Set<Day> {
  const ranges: [Day, Day][] = [];
  if (rule.freq === "YEARLY" && byMonth.length > 0) {
    const year = ymd(lo).year;
    for (const month of byMonth) {
      if (month < 1 || month > 12) continue;
      const first = dayOf(year, month, 1);
      ranges.push([first, first + monthLength(year, month) - 1]);
    }
  } else {
    ranges.push([lo, hi]);
  }
  const mask = new Set<Day>();
  for (const [first, last] of ranges) {
    for (const { weekday: wd, n } of nthDays) {
      let day: Day;
      if (n < 0) {
        day = last + (n + 1) * 7;
        day -= (weekday(day) - wd + 7) % 7;
      } else {
        day = first + (n - 1) * 7;
        day += (7 - weekday(day) + wd) % 7;
      }
      if (day >= first && day <= last) mask.add(day);
    }
  }
  return mask;
}

/** Re-exported for callers stepping plain rules. */
export { addMonths };

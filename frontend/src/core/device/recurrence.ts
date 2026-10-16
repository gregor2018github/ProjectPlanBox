/**
 * Recurrence rules (RFC 5545 RRULE): validation, normalisation and expansion.
 * The device twin of `backend/planbox/core/recurrence.py`; keep them in step.
 *
 * Rules are stored without DTSTART; the owner's own start is the anchor.
 * Timed events expand in the configured zone (a weekly 09:00 meeting stays
 * at 09:00 across DST); all-day events and todos expand on floating dates.
 * Moments are numbers: UTC milliseconds for timed anchors, "naive"
 * milliseconds (day × 86 400 000 + time) for all-day ones, as Python
 * compares aware or naive datetimes.
 */
import { textLength } from "./errors";
import { buildRule, expand, RuleError } from "./rrule";
import { addMonths, compactDate, DAY_MS, dayOf, fromLocal, toLocal, type Day } from "./time";

const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const PART_ORDER = ["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "BYSETPOS", "WKST"];
const END_PARTS = ["COUNT", "UNTIL"];
const ALLOWED = new Set([...PART_ORDER, ...END_PARTS]);
const MAX_RULE_LENGTH = 500;
const MAX_COUNT = 1000;
const MAX_INTERVAL = 999;

/** RRULE parts by name, in insertion order. */
export type Parts = Map<string, string>;

/** The rule is malformed or uses something PlanBox does not support. */
export class RecurrenceError extends Error {}

/** Where a series starts and how long each occurrence lasts. */
export interface Anchor {
  /** The local start date. */
  day: Day;
  /** Milliseconds after local midnight (0 for all-day). */
  time: number;
  /** Length of one occurrence. */
  duration: number;
  allDay: boolean;
  /** The configured zone (timed anchors). */
  zone: string;
}

/** One occurrence: its local start date and its bounds (moments, see above). */
export interface Span {
  occurrenceDate: Day;
  start: number;
  end: number;
}

/** The anchor of a timed event: its start in `zone` and its duration. */
export function timedAnchor(startUtc: number, endUtc: number, zone: string): Anchor {
  const local = toLocal(startUtc, zone);
  return { day: local.day, time: local.ms, duration: endUtc - startUtc, allDay: false, zone };
}

/** The anchor of an all-day event (`endInclusive` is the last day). */
export function allDayAnchor(start: Day, endInclusive: Day): Anchor {
  return {
    day: start,
    time: 0,
    duration: (endInclusive - start + 1) * DAY_MS,
    allDay: true,
    zone: "UTC",
  };
}

/** The moment an occurrence on `day` starts. */
function momentOf(anchor: Anchor, day: Day): number {
  if (anchor.allDay) return day * DAY_MS + anchor.time;
  return fromLocal({ day, ms: anchor.time }, anchor.zone);
}

// ------------------------------------------------------------------- parsing

/** Splits a rule into parts and checks that PlanBox supports it. */
export function parse(rule: string): Parts {
  let text = rule.trim().toUpperCase();
  if (text.startsWith("RRULE:")) text = text.slice("RRULE:".length);
  if (!text) throw new RecurrenceError("The repeat rule is empty.");
  if (textLength(text) > MAX_RULE_LENGTH || /[\r\n]/.test(text)) {
    throw new RecurrenceError("The repeat rule is too long or spans lines.");
  }
  const parts: Parts = new Map();
  for (const chunk of text.split(";")) {
    if (!chunk) continue;
    const eq = chunk.indexOf("=");
    const key = eq < 0 ? chunk : chunk.slice(0, eq);
    const value = eq < 0 ? "" : chunk.slice(eq + 1);
    if (eq < 0 || !value) throw new RecurrenceError(`Cannot read '${chunk}' in the repeat rule.`);
    if (!ALLOWED.has(key)) throw new RecurrenceError(`Repeat rules with ${key} are not supported.`);
    if (parts.has(key)) throw new RecurrenceError(`${key} appears twice in the repeat rule.`);
    parts.set(key, value);
  }
  if (!FREQUENCIES.has(parts.get("FREQ") ?? "")) {
    throw new RecurrenceError("Repeat daily, weekly, monthly or yearly.");
  }
  if (parts.has("COUNT") && parts.has("UNTIL")) {
    throw new RecurrenceError("A repeat rule ends either after a count or on a date, not both.");
  }
  checkInt(parts, "INTERVAL", 1, MAX_INTERVAL);
  checkInt(parts, "COUNT", 1, MAX_COUNT);
  return parts;
}

function checkInt(parts: Parts, key: string, low: number, high: number): void {
  const value = parts.get(key);
  if (value === undefined) return;
  if (!/^\d+$/.test(value) || Number(value) < low || Number(value) > high) {
    throw new RecurrenceError(
      `${key} must be a whole number from ${String(low)} to ${String(high)}.`,
    );
  }
}

/** Joins parts in a canonical order (so equal rules compare equal). */
export function formatRule(parts: Parts): string {
  return [...PART_ORDER, ...END_PARTS]
    .filter((key) => parts.has(key))
    .map((key) => `${key}=${parts.get(key) ?? ""}`)
    .join(";");
}

/** Validates a rule against its anchor and returns its canonical text. */
export function normalize(rule: string, anchor: Anchor, zone: string): string {
  const parts = parse(rule);
  const until = parts.get("UNTIL");
  if (until !== undefined) parts.set("UNTIL", normalizeUntil(until, anchor, zone));
  const text = formatRule(parts);
  if (iterate(text, anchor).next().done === true) {
    throw new RecurrenceError("This repeat rule never produces an occurrence.");
  }
  return text;
}

const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const COMPACT_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function compactDay(year: string, month: string, day: string): Day {
  return dayOf(Number(year), Number(month), Number(day));
}

function normalizeUntil(value: string, anchor: Anchor, zone: string): string {
  const bad = new RecurrenceError("UNTIL must be a date (YYYYMMDD) or a time.");
  try {
    if (value.length === 8) {
      const match = COMPACT_DATE.exec(value);
      if (match === null) throw bad;
      const day = compactDay(match[1] ?? "", match[2] ?? "", match[3] ?? "");
      if (anchor.allDay) return value;
      return untilUtc(fromLocal({ day, ms: (23 * 3600 + 59 * 60 + 59) * 1000 }, zone));
    }
    const match = COMPACT_TIME.exec(value);
    if (match === null) throw bad;
    const [, y, mo, d, h, mi, s, z] = match;
    const day = compactDay(y ?? "", mo ?? "", d ?? "");
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(s);
    if (hour > 23 || minute > 59 || second > 59) throw bad;
    const ms = ((hour * 60 + minute) * 60 + second) * 1000;
    const instant = z === "Z" ? day * DAY_MS + ms : fromLocal({ day, ms }, zone);
    if (anchor.allDay) return compactDate(toLocal(instant, zone).day);
    return untilUtc(instant);
  } catch (error) {
    if (error instanceof RecurrenceError) throw error;
    throw bad;
  }
}

function untilUtc(instant: number): string {
  const iso = new Date(instant).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/** The moment after which a rule's UNTIL stops it (null: no UNTIL). */
function untilMoment(parts: Parts, anchor: Anchor): number | null {
  const value = parts.get("UNTIL");
  if (value === undefined) return null;
  const time = COMPACT_TIME.exec(value);
  if (time !== null) {
    const [, y, mo, d, h, mi, s, z] = time;
    const day = compactDay(y ?? "", mo ?? "", d ?? "");
    const ms = ((Number(h) * 60 + Number(mi)) * 60 + Number(s)) * 1000;
    if (z === "Z" || !anchor.allDay)
      return z === "Z" ? day * DAY_MS + ms : fromLocal({ day, ms }, anchor.zone);
    return day * DAY_MS + ms;
  }
  const date = COMPACT_DATE.exec(value);
  if (date === null) throw new RecurrenceError("UNTIL must be a date (YYYYMMDD) or a time.");
  const day = compactDay(date[1] ?? "", date[2] ?? "", date[3] ?? "");
  // dateutil reads a plain date as midnight (local for a timed anchor).
  return anchor.allDay ? day * DAY_MS : fromLocal({ day, ms: 0 }, anchor.zone);
}

/** The dates of a series, in order (unbounded rules never stop). */
function* dates(rule: string, anchor: Anchor): Generator<Day> {
  let parts: Parts;
  try {
    parts = parse(rule);
  } catch (error) {
    if (error instanceof RecurrenceError)
      throw new RecurrenceError(`Cannot use this repeat rule: ${error.message}`);
    throw error;
  }
  let built;
  try {
    built = buildRule(parts);
  } catch (error) {
    if (error instanceof RuleError)
      throw new RecurrenceError(`Cannot use this repeat rule: ${error.message}`);
    throw error;
  }
  const until = untilMoment(parts, anchor);
  yield* expand(built, anchor.day, (day) => until !== null && momentOf(anchor, day) > until);
}

// ----------------------------------------------------------------- expansion

function span(anchor: Anchor, day: Day): Span {
  const start = momentOf(anchor, day);
  return { occurrenceDate: day, start, end: start + anchor.duration };
}

/** Every occurrence from the anchor on (unbounded rules never stop). */
export function* iterate(rule: string, anchor: Anchor): Generator<Span> {
  for (const day of dates(rule, anchor)) yield span(anchor, day);
}

/** Occurrences whose moment is in `[low, high]` (dateutil's `between(..., inc=True)`). */
function* within(rule: string, anchor: Anchor, low: number, high: number): Generator<Span> {
  for (const day of dates(rule, anchor)) {
    const moment = momentOf(anchor, day);
    if (moment > high) return;
    if (moment >= low) yield span(anchor, day);
  }
}

/** Occurrences overlapping `[rangeStart, rangeEnd)`, without the skipped dates. */
export function between(
  rule: string,
  anchor: Anchor,
  rangeStart: number,
  rangeEnd: number,
  skip: ReadonlySet<Day> = new Set(),
): Span[] {
  // An occurrence that started before the range can still reach into it.
  return [...within(rule, anchor, rangeStart - anchor.duration, rangeEnd)].filter(
    (s) => !skip.has(s.occurrenceDate) && s.start < rangeEnd && rangeStart < s.end,
  );
}

/** The occurrence whose local start date is `day`, if the series has one. */
export function occurrenceOn(rule: string, anchor: Anchor, day: Day, zone: string): Span | null {
  const start = anchor.allDay ? day * DAY_MS : fromLocal({ day, ms: 0 }, zone);
  const end = anchor.allDay ? (day + 1) * DAY_MS : fromLocal({ day: day + 1, ms: 0 }, zone);
  for (const found of within(rule, anchor, start, end)) {
    if (found.occurrenceDate === day) return found;
  }
  return null;
}

/** The first date of a floating-date series (anchored on `start`) after `day`. */
export function dateAfter(rule: string, start: Day, day: Day): Day | null {
  for (const found of dates(rule, allDayAnchor(start, start))) {
    if (found > day) return found;
  }
  return null;
}

/** How many occurrences start on a local date before `day`. */
export function countBefore(rule: string, anchor: Anchor, day: Day): number {
  let count = 0;
  for (const found of dates(rule, anchor)) {
    if (found >= day) break;
    count += 1;
  }
  return count;
}

/** The rule cut so that its last occurrence starts before `day`. */
export function endBefore(rule: string, anchor: Anchor, day: Day, zone: string): string {
  const parts = parse(rule);
  parts.delete("COUNT");
  if (anchor.allDay) {
    parts.set("UNTIL", compactDate(day - 1));
  } else {
    parts.set("UNTIL", untilUtc(fromLocal({ day, ms: 0 }, zone) - 1000));
  }
  return formatRule(parts);
}

/** The rule for a series continuing from `day`: COUNT minus what already happened. */
export function remaining(rule: string, anchor: Anchor, day: Day): string {
  const parts = parse(rule);
  const count = parts.get("COUNT");
  if (count !== undefined) {
    const left = Number(count) - countBefore(rule, anchor, day);
    parts.set("COUNT", String(Math.max(left, 1)));
  }
  return formatRule(parts);
}

// ------------------------------------------------- repeating after completion

const PLAIN_PARTS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL"]);

/** Whether a rule is only "every N days/weeks/months/years" (with an optional end). */
export function isPlain(rule: string): boolean {
  return [...parse(rule).keys()].every((key) => PLAIN_PARTS.has(key));
}

/** `day` plus one interval of a plain rule (months clamp to the month's end). */
export function step(rule: string, day: Day): Day {
  const parts = parse(rule);
  const interval = Number(parts.get("INTERVAL") ?? "1");
  switch (parts.get("FREQ")) {
    case "DAILY":
      return day + interval;
    case "WEEKLY":
      return day + 7 * interval;
    case "MONTHLY":
      return addMonths(day, interval);
    default:
      return addMonths(day, 12 * interval);
  }
}

/** The last allowed date of a floating-date rule (its UNTIL), if any. */
export function floatingUntil(rule: string): Day | null {
  const value = parse(rule).get("UNTIL");
  if (value === undefined) return null;
  return compactDay(value.slice(0, 4), value.slice(4, 6), value.slice(6, 8));
}

/** The rule with COUNT replaced (only if it has one). */
export function withCount(rule: string, count: number): string {
  const parts = parse(rule);
  if (parts.has("COUNT")) parts.set("COUNT", String(count));
  return formatRule(parts);
}

/** The next date of a plain rule one interval after `day`, and the rule left for it. */
export function stepAfter(rule: string, day: Day): [Day, string] | null {
  const parts = parse(rule);
  if (parts.get("COUNT") === "1") return null;
  const following = step(rule, day);
  const until = floatingUntil(rule);
  if (until !== null && following > until) return null;
  const count = parts.get("COUNT");
  return [following, count !== undefined ? withCount(rule, Number(count) - 1) : rule];
}

/** Dates of a plain rule repeated from `base` (excluded) within `[first, last]`. */
export function steppedDates(rule: string, base: Day, first: Day, last: Day, limit: number): Day[] {
  const found: Day[] = [];
  let day = base;
  let left = rule;
  while (found.length < limit) {
    const stepped = stepAfter(left, day);
    if (stepped === null || stepped[0] > last) break;
    [day, left] = stepped;
    if (day >= first) found.push(day);
  }
  return found;
}

/** Dates of a floating-date series within `[first, last]`, after `after`. */
export function seriesDates(
  rule: string,
  start: Day,
  after: Day,
  first: Day,
  last: Day,
  limit: number,
): Day[] {
  const low = Math.max(first, after + 1);
  if (low > last) return [];
  const found: Day[] = [];
  for (const day of dates(rule, allDayAnchor(start, start))) {
    if (day < low) continue;
    if (day > last || found.length >= limit) break;
    found.push(day);
  }
  return found;
}

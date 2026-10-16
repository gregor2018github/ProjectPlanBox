/**
 * Dates, instants and zones for the device backend, with Python's semantics.
 *
 * The backend twin must agree with `datetime`/`zoneinfo` to the day: floating
 * dates are whole day numbers, instants are UTC milliseconds, and a local
 * wall time turns into an instant the way `datetime(..., tzinfo=zone)`
 * (fold 0) does: an ambiguous time takes the earlier offset, a time in a
 * DST gap takes the offset from before the gap.
 */

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;

/** A floating date as days since 1970-01-01 (negative before). */
export type Day = number;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the epoch of a calendar date; invalid dates throw. */
export function dayOf(year: number, month: number, day: number): Day {
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    throw new RangeError(`invalid date ${String(year)}-${String(month)}-${String(day)}`);
  }
  return Math.round(ms / DAY_MS);
}

/** Parses `YYYY-MM-DD`; returns null when it is not a real date. */
export function parseDate(text: string): Day | null {
  const match = DATE_RE.exec(text);
  if (match === null) return null;
  try {
    return dayOf(Number(match[1]), Number(match[2]), Number(match[3]));
  } catch {
    return null;
  }
}

/** Parses `YYYY-MM-DD` that is known to be valid (stored data). */
export function dateDay(text: string): Day {
  const day = parseDate(text);
  if (day === null) throw new RangeError(`not a date: ${text}`);
  return day;
}

/** The parts of a day. */
export function ymd(day: Day): { year: number; month: number; day: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Formats a day as `YYYY-MM-DD`. */
export function isoDate(day: Day): string {
  const { year, month, day: dom } = ymd(day);
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(dom)}`;
}

/** Formats a day as `YYYYMMDD` (RRULE dates). */
export function compactDate(day: Day): string {
  return isoDate(day).replaceAll("-", "");
}

/** Python's `weekday()`: Monday 0 .. Sunday 6. */
export function weekday(day: Day): number {
  // 1970-01-01 was a Thursday (3).
  return (((day + 3) % 7) + 7) % 7;
}

/** Days in a month. */
export function monthLength(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whether a year has 29 February. */
export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `day` plus whole months, the day of month clamped to the month's length. */
export function addMonths(day: Day, months: number): Day {
  const { year, month, day: dom } = ymd(day);
  const index = year * 12 + month - 1 + months;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return dayOf(y, m, Math.min(dom, monthLength(y, m)));
}

/** ISO year and week of a day (Python's `isocalendar()[:2]`). */
export function isoWeek(day: Day): [number, number] {
  const thursday = day - weekday(day) + 3;
  const { year } = ymd(thursday);
  const firstThursday = dayOf(year, 1, 1);
  return [year, Math.floor((thursday - firstThursday) / 7) + 1];
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

// ---------------------------------------------------------------- instants

/** Formats UTC milliseconds as fixed-width ISO-8601 with ms and a Z (`to_iso`). */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

const INSTANT_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses an ISO-8601 date-time (Python's `fromisoformat`, plus Pydantic's
 * forms). Returns the UTC milliseconds and whether it carried a zone, or
 * null when it is not a date-time. Without a zone it is read as UTC.
 */
export function parseInstant(text: string): { ms: number; aware: boolean } | null {
  const match = INSTANT_RE.exec(text.trim());
  if (match === null) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const dom = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  let day: Day;
  try {
    day = dayOf(year, month, dom);
  } catch {
    return null;
  }
  const millis = Math.floor(Number(`0.${frac ?? "0"}`) * 1000);
  let ms = day * DAY_MS + ((hour * 60 + minute) * 60 + second) * 1000 + millis;
  if (zone !== undefined && zone.toUpperCase() !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60_000;
  }
  return { ms, aware: zone !== undefined };
}

/** Parses a stored instant (always valid, fixed width). */
export function instantMs(text: string): number {
  const parsed = parseInstant(text);
  if (parsed === null) throw new RangeError(`not an instant: ${text}`);
  return parsed.ms;
}

// ---------------------------------------------------------------- zones

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let found = formatters.get(zone);
  if (found === undefined) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, found);
  }
  return found;
}

/** Whether `zone` is a time zone this runtime knows. */
export function isKnownZone(zone: string): boolean {
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

/** Offsets per zone and quarter hour (zones only change offset on quarter hours). */
const offsets = new Map<string, number>();
const QUARTER_HOUR = 900_000;

/** The zone's UTC offset at an instant, in milliseconds (east positive). */
export function offsetAt(zone: string, utcMs: number): number {
  const key = `${zone}|${String(Math.floor(utcMs / QUARTER_HOUR))}`;
  const cached = offsets.get(key);
  if (cached !== undefined) return cached;
  if (offsets.size > 100_000) offsets.clear();
  const offset = computeOffset(zone, utcMs);
  offsets.set(key, offset);
  return offset;
}

function computeOffset(zone: string, utcMs: number): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(new Date(whole))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return wall - whole;
}

/** A local wall time: a day and milliseconds since its midnight. */
export interface Wall {
  day: Day;
  ms: number;
}

/** Where an instant falls in a zone (`astimezone`). */
export function toLocal(utcMs: number, zone: string): Wall {
  const local = utcMs + offsetAt(zone, utcMs);
  const day = Math.floor(local / DAY_MS);
  return { day, ms: local - day * DAY_MS };
}

/** The instant of a local wall time, as `datetime(..., tzinfo=zone)` with fold 0. */
export function fromLocal(wall: Wall, zone: string): number {
  const local = wall.day * DAY_MS + wall.ms;
  const before = offsetAt(zone, local - DAY_MS);
  const after = offsetAt(zone, local + DAY_MS);
  const early = local - before;
  if (before === after || offsetAt(zone, early) === before) return early;
  const late = local - after;
  if (offsetAt(zone, late) === after) return late;
  return early; // In a DST gap: the offset from before it.
}

/** The local date of an instant. */
export function localDay(utcMs: number, zone: string): Day {
  return toLocal(utcMs, zone).day;
}

/** The instant a local day starts in a zone. */
export function midnight(day: Day, zone: string): number {
  return fromLocal({ day, ms: 0 }, zone);
}

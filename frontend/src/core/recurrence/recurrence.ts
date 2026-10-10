/**
 * Repeat rules (RFC 5545 RRULE text) as the event dialog and the todo repeat
 * picker edit them. The server validates, normalises and expands rules; this
 * side only reads and writes the subset the editor offers and describes any
 * rule in words.
 */
import { format, getDaysInMonth, parseISO } from "date-fns";

import { addDays, isoWeekday, zonedParts, type IsoDate } from "../time";

/** How often a series repeats. */
export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** RFC 5545 weekday codes, Monday first. */
export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** A weekday code. */
export type Weekday = (typeof WEEKDAYS)[number];

/** When a series stops. */
export type RecurrenceEnd =
  { kind: "never" } | { kind: "count"; count: number } | { kind: "until"; date: IsoDate };

/** What the dialog can express. */
export interface RecurrenceSpec {
  freq: Frequency;
  interval: number;
  /** Weekly only; empty means the start's weekday. */
  byDay: Weekday[];
  /** Monthly only: on the start's day of the month, or on its nth weekday ("2nd Thursday"). */
  monthly: "day" | "weekday";
  end: RecurrenceEnd;
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};
const ORDINALS: Record<string, string> = {
  "1": "first",
  "2": "second",
  "3": "third",
  "4": "fourth",
  "5": "fifth",
  "-1": "last",
};
const UNITS: Record<Frequency, [string, string]> = {
  DAILY: ["day", "days"],
  WEEKLY: ["week", "weeks"],
  MONTHLY: ["month", "months"],
  YEARLY: ["year", "years"],
};

/** The weekday code of a date. */
export function weekdayOf(date: IsoDate): Weekday {
  return WEEKDAYS[isoWeekday(date) - 1] ?? "MO";
}

/** Which occurrence of its weekday a date is in its month: 1..4, or -1 for the last. */
export function nthWeekdayOf(date: IsoDate): number {
  const day = Number(date.slice(8));
  if (day + 7 > getDaysInMonth(parseISO(date))) return -1;
  return Math.ceil(day / 7);
}

function partsOf(rule: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const chunk of rule.replace(/^RRULE:/i, "").split(";")) {
    const [key, value] = chunk.split("=");
    if (key && value) parts.set(key.toUpperCase(), value.toUpperCase());
  }
  return parts;
}

function untilDate(value: string, timeZone: string): IsoDate {
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (!value.endsWith("Z")) return date;
  const instant = `${date}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  return zonedParts(instant, timeZone).date;
}

/** A sensible starting point for a series that starts on `start`. */
export function defaultSpec(freq: Frequency, start: IsoDate): RecurrenceSpec {
  return {
    freq,
    interval: 1,
    byDay: freq === "WEEKLY" ? [weekdayOf(start)] : [],
    monthly: "day",
    end: { kind: "never" },
  };
}

/**
 * Reads a rule the dialog can edit, or null for anything else (such a rule
 * is kept as is and only described).
 */
export function parseRule(rule: string, start: IsoDate, timeZone: string): RecurrenceSpec | null {
  const parts = partsOf(rule);
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }
  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL"]);
  if ([...parts.keys()].some((key) => !known.has(key))) return null;
  const interval = Number(parts.get("INTERVAL") ?? "1");
  const byDayRaw = parts.get("BYDAY");
  const spec: RecurrenceSpec = { ...defaultSpec(freq, start), interval };
  if (byDayRaw !== undefined) {
    if (freq === "WEEKLY") {
      const days = byDayRaw.split(",");
      if (!days.every((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d))) {
        return null;
      }
      spec.byDay = days;
    } else if (freq === "MONTHLY") {
      const expected = `${String(nthWeekdayOf(start))}${weekdayOf(start)}`;
      if (byDayRaw !== expected) return null;
      spec.monthly = "weekday";
    } else {
      return null;
    }
  }
  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  if (count !== undefined) spec.end = { kind: "count", count: Number(count) };
  if (until !== undefined) spec.end = { kind: "until", date: untilDate(until, timeZone) };
  return spec;
}

/** Writes a spec as rule text for a series starting on `start`. */
export function buildRule(spec: RecurrenceSpec, start: IsoDate): string {
  const parts = [`FREQ=${spec.freq}`];
  if (spec.interval > 1) parts.push(`INTERVAL=${String(spec.interval)}`);
  if (spec.freq === "WEEKLY") {
    const days = WEEKDAYS.filter((d) => spec.byDay.includes(d));
    if (days.length > 0 && !(days.length === 1 && days[0] === weekdayOf(start))) {
      parts.push(`BYDAY=${days.join(",")}`);
    }
  }
  if (spec.freq === "MONTHLY" && spec.monthly === "weekday") {
    parts.push(`BYDAY=${String(nthWeekdayOf(start))}${weekdayOf(start)}`);
  }
  if (spec.end.kind === "count") parts.push(`COUNT=${String(spec.end.count)}`);
  if (spec.end.kind === "until") parts.push(`UNTIL=${spec.end.date.replaceAll("-", "")}`);
  return parts.join(";");
}

/** Describes any rule in words: "Every 2 weeks on Mon, Wed, until 31 Dec 2026". */
export function describeRule(rule: string, start: IsoDate, timeZone: string): string {
  const parts = partsOf(rule);
  const freq = parts.get("FREQ") as Frequency | undefined;
  if (freq === undefined || !(freq in UNITS)) return "Custom repeat";
  const interval = Number(parts.get("INTERVAL") ?? "1");
  const [one, many] = UNITS[freq];
  let text = interval === 1 ? `Every ${one}` : `Every ${String(interval)} ${many}`;

  const byDay = parts.get("BYDAY");
  if (freq === "WEEKLY") {
    const days = (byDay ?? weekdayOf(start)).split(",") as Weekday[];
    const workweek = ["MO", "TU", "WE", "TH", "FR"];
    text +=
      days.length === 5 && workweek.every((d) => days.includes(d as Weekday))
        ? " on weekdays"
        : ` on ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}`;
  } else if (freq === "MONTHLY") {
    const match = /^(-?\d)([A-Z]{2})$/.exec(byDay ?? "");
    const ordinal = match ? ORDINALS[match[1] ?? ""] : undefined;
    const name = match ? WEEKDAY_NAMES[match[2] as Weekday] : undefined;
    text +=
      ordinal !== undefined && name !== undefined
        ? ` on the ${ordinal} ${name}`
        : ` on day ${String(Number(start.slice(8)))}`;
  } else if (freq === "YEARLY") {
    text += ` on ${format(parseISO(start), "d MMM")}`;
  }

  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  if (count !== undefined) text += `, ${count} times`;
  if (until !== undefined) {
    text += `, until ${format(parseISO(untilDate(until, timeZone)), "d MMM yyyy")}`;
  }
  return text;
}

/**
 * Moves a rule's weekdays (and month days) by `days`, for when a whole
 * series is dragged to another day: "every Monday" becomes "every Tuesday".
 */
export function shiftRule(rule: string, days: number): string {
  if (days === 0) return rule;
  const parts = partsOf(rule);
  const byDay = parts.get("BYDAY");
  if (byDay !== undefined) {
    parts.set(
      "BYDAY",
      byDay
        .split(",")
        .map((token) => {
          const match = /^([+-]?\d*)([A-Z]{2})$/.exec(token);
          const index = WEEKDAYS.indexOf((match?.[2] ?? "") as Weekday);
          if (!match || index === -1) return token;
          const shifted = WEEKDAYS[(((index + days) % 7) + 7) % 7] ?? "MO";
          return `${match[1] ?? ""}${shifted}`;
        })
        .join(","),
    );
  }
  const byMonthDay = parts.get("BYMONTHDAY");
  if (byMonthDay !== undefined) {
    parts.set(
      "BYMONTHDAY",
      byMonthDay
        .split(",")
        .map((d) => {
          const n = Number(d);
          return n > 0 ? String(Math.min(Math.max(n + days, 1), 31)) : d;
        })
        .join(","),
    );
  }
  return [...parts].map(([key, value]) => `${key}=${value}`).join(";");
}

/** A default "until" date for a new end: a month after the start. */
export function untilDefault(start: IsoDate): IsoDate {
  return addDays(start, 30);
}

/** The dialog's repeat choice: none, an editable spec, or a rule it can only keep. */
export type Repeat =
  { kind: "none" } | { kind: "spec"; spec: RecurrenceSpec } | { kind: "custom"; rule: string };

/** Reads a stored rule into a dialog choice. */
export function repeatOf(rule: string | null, start: IsoDate, timeZone: string): Repeat {
  if (rule === null) return { kind: "none" };
  const spec = parseRule(rule, start, timeZone);
  return spec === null ? { kind: "custom", rule } : { kind: "spec", spec };
}

/** The rule a dialog choice stands for (null: does not repeat). */
export function ruleOf(repeat: Repeat, start: IsoDate): string | null {
  if (repeat.kind === "none") return null;
  if (repeat.kind === "custom") return repeat.rule;
  return buildRule(repeat.spec, start);
}

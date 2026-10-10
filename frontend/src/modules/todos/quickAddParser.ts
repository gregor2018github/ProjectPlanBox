/**
 * Parses quick-add text such as `Pay rent fri !1 @money #Home/Bills`.
 *
 * - Dates: today, tomorrow (tmr), weekdays (mon…sunday: the next one after
 *   today), "next week" (next Monday), "in 3 days", "in 2 weeks", "in a week",
 *   12.10 or 12.10.2026 (day.month), 2026-10-12.
 * - Priority: !1 high, !2 medium, !3 low, !0 none.
 * - Tags: `@word` (existing tags match case-insensitively; others are created).
 * - Place: #List or #List/Section; names may contain spaces and match the
 *   longest known name. Unknown #words stay in the title.
 * - Repeat (always after "every"): every day/week/month/year, every 3 days,
 *   every other week, every weekday, every mon / every mon, thu / every
 *   monday and friday, every 1st / every 1st and 15th / every last day. A
 *   plain interval may end in "after done" (counted from completion).
 *   Without a date the todo is due on the repeat's first date from today.
 * Only the first date, repeat and priority count; recognised parts leave the
 * title.
 */
import {
  describeRule,
  LAST_DAY,
  sortMonthDays,
  WEEKDAYS as RULE_WEEKDAYS,
} from "../../core/recurrence/recurrence";
import { addDays, isoWeekday, type IsoDate } from "../../core/time";
import type { RepeatFrom } from "./types";

/** Known names the parser can resolve. */
export interface ParseContext {
  today: IsoDate;
  lists: readonly { id: string; name: string }[];
  sections: readonly { id: string; list_id: string; name: string }[];
  tags: readonly { id: string; name: string }[];
}

/** A recognised part, for the chips under the input. */
export interface ParsedToken {
  kind: "due" | "priority" | "place" | "tag" | "repeat";
  /** The text as typed. */
  text: string;
  /** What it means, e.g. "Fri 9 Oct" or "Home / Bills". */
  label: string;
}

/** The result of parsing. */
export interface ParsedTodo {
  title: string;
  due_date: IsoDate | null;
  priority: number | null;
  /** Set when a #list was recognised. */
  place: { list_id: string; section_id: string | null } | null;
  tag_ids: string[];
  /** Tag words (`@name`) without an existing tag; created on submit. */
  new_tags: string[];
  /** A repeat rule (RRULE text); `due_date` is then always set. */
  rrule: string | null;
  repeat_from: RepeatFrom;
  tokens: ParsedToken[];
}

const WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

const PRIORITIES: Record<string, number> = { "!1": 3, "!2": 2, "!3": 1, "!0": 0 };
const PRIORITY_NAMES = ["No priority", "Low priority", "Medium priority", "High priority"];

/** Parses quick-add text against the known lists, sections and tags. */
export function parseQuickAdd(input: string, ctx: ParseContext): ParsedTodo {
  const result: ParsedTodo = {
    title: "",
    due_date: null,
    priority: null,
    place: null,
    tag_ids: [],
    new_tags: [],
    rrule: null,
    repeat_from: "due",
    tokens: [],
  };
  const words = input.split(/\s+/).filter((w) => w !== "");
  const kept: string[] = [];
  let repeat: RepeatMatch | null = null;
  let repeatToken: ParsedToken | null = null;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    const lower = word.toLowerCase();

    if (repeat === null && lower === "every") {
      repeat = matchRepeat(words, i);
      if (repeat !== null) {
        repeatToken = {
          kind: "repeat",
          text: words.slice(i, i + repeat.length).join(" "),
          label: "",
        };
        result.tokens.push(repeatToken);
        i += repeat.length - 1;
        continue;
      }
    }

    if (result.due_date === null) {
      const date = matchDate(words, i, ctx.today);
      if (date !== null) {
        result.due_date = date.value;
        result.tokens.push({
          kind: "due",
          text: words.slice(i, i + date.length).join(" "),
          label: date.value,
        });
        i += date.length - 1;
        continue;
      }
    }

    if (result.priority === null && lower in PRIORITIES) {
      const priority = PRIORITIES[lower] ?? 0;
      result.priority = priority;
      result.tokens.push({ kind: "priority", text: word, label: PRIORITY_NAMES[priority] ?? "" });
      continue;
    }

    if (word.startsWith("@") && word.length > 1) {
      const name = word.slice(1);
      const existing = ctx.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        if (!result.tag_ids.includes(existing.id)) result.tag_ids.push(existing.id);
      } else if (!result.new_tags.some((n) => n.toLowerCase() === name.toLowerCase())) {
        result.new_tags.push(name);
      }
      result.tokens.push({ kind: "tag", text: word, label: existing?.name ?? name });
      continue;
    }

    if (result.place === null && word.startsWith("#") && word.length > 1) {
      const place = matchPlace(words, i, ctx);
      if (place !== null) {
        result.place = { list_id: place.list_id, section_id: place.section_id };
        result.tokens.push({
          kind: "place",
          text: words.slice(i, i + place.length).join(" "),
          label: place.label,
        });
        i += place.length - 1;
        continue;
      }
    }

    kept.push(word);
  }

  result.title = kept.join(" ");
  if (repeat !== null && repeatToken !== null) {
    const due = result.due_date ?? firstDate(repeat, ctx.today);
    result.due_date = due;
    result.rrule = repeat.rule;
    result.repeat_from = repeat.afterCompletion ? "completion" : "due";
    repeatToken.label = describeRule(repeat.rule, due, "UTC", repeat.afterCompletion);
  }
  return result;
}

interface RepeatMatch {
  rule: string;
  /** Weekly on these ISO weekdays (1 = Monday), when chosen. */
  weekdays: number[];
  /** Monthly on these days ({@link LAST_DAY} = the last), when chosen. */
  monthDays: number[];
  afterCompletion: boolean;
  /** How many words it consumed, "every" included. */
  length: number;
}

const UNIT_FREQ: Record<string, string> = {
  day: "DAILY",
  days: "DAILY",
  week: "WEEKLY",
  weeks: "WEEKLY",
  month: "MONTHLY",
  months: "MONTHLY",
  year: "YEARLY",
  years: "YEARLY",
};

/** Matches a repeat phrase whose "every" is `words[i]`. */
function matchRepeat(words: readonly string[], i: number): RepeatMatch | null {
  const at = (n: number) => (words[i + n] ?? "").toLowerCase();
  const fixed = { afterCompletion: false, weekdays: [], monthDays: [] };
  const plain = (unit: string, interval: number, used: number): RepeatMatch => {
    const freq = UNIT_FREQ[unit] ?? "DAILY";
    const completion = at(used) === "after" && /^(done|completion|completing)$/.test(at(used + 1));
    return {
      ...fixed,
      rule: interval > 1 ? `FREQ=${freq};INTERVAL=${String(interval)}` : `FREQ=${freq}`,
      afterCompletion: completion,
      length: used + (completion ? 2 : 0),
    };
  };

  const singular = (w: string) => w in UNIT_FREQ && !w.endsWith("s");
  if (singular(at(1))) return plain(at(1), 1, 2);
  if (at(1) === "other" && singular(at(2))) return plain(at(2), 2, 3);
  if (/^\d{1,2}$/.test(at(1)) && Number(at(1)) >= 1 && at(2) in UNIT_FREQ) {
    return plain(at(2), Number(at(1)), 3);
  }
  if (at(1) === "weekday" || at(1) === "workday") {
    const weekdays = [1, 2, 3, 4, 5];
    return { ...fixed, rule: weeklyRule(weekdays), weekdays, length: 2 };
  }
  if (at(1) === "last" && at(2) === "day") {
    const monthDays = [LAST_DAY];
    return { ...fixed, rule: monthlyRule(monthDays), monthDays, length: 3 };
  }
  const weekdays = matchList(words, i + 1, (w) => WEEKDAYS[w] ?? null);
  if (weekdays !== null) {
    return {
      ...fixed,
      rule: weeklyRule(weekdays.values),
      weekdays: weekdays.values,
      length: weekdays.length + 1,
    };
  }
  const monthDays = matchList(words, i + 1, readMonthDay);
  if (monthDays !== null) {
    const days = sortMonthDays(monthDays.values);
    return { ...fixed, rule: monthlyRule(days), monthDays: days, length: monthDays.length + 1 };
  }
  return null;
}

/**
 * Reads a list such as "mon, wed and fri" or "1st,15th" from `words[from]`
 * on, with `read` turning one item into a value. Stops at the first word
 * that is neither an item nor "and"/"&".
 */
function matchList(
  words: readonly string[],
  from: number,
  read: (word: string) => number | null,
): { values: number[]; length: number } | null {
  const values: number[] = [];
  let lastWord = -1;
  for (let j = from; j < words.length; j += 1) {
    const parts = (words[j] ?? "")
      .toLowerCase()
      .split(",")
      .filter((p) => p !== "");
    if (values.length > 0 && parts.length === 1 && (parts[0] === "and" || parts[0] === "&")) {
      continue;
    }
    const items = parts.map(read);
    if (parts.length === 0 || items.some((v) => v === null)) break;
    for (const v of items) if (v !== null && !values.includes(v)) values.push(v);
    lastWord = j;
  }
  return values.length === 0 ? null : { values, length: lastWord - from + 1 };
}

function readMonthDay(word: string): number | null {
  const match = /^(\d{1,2})(st|nd|rd|th)$/.exec(word);
  const day = Number(match?.[1]);
  return match && day >= 1 && day <= 31 ? day : null;
}

function weeklyRule(weekdays: readonly number[]): string {
  const codes = [...weekdays].sort((a, b) => a - b).map((d) => RULE_WEEKDAYS[d - 1] ?? "MO");
  return `FREQ=WEEKLY;BYDAY=${codes.join(",")}`;
}

function monthlyRule(days: readonly number[]): string {
  return `FREQ=MONTHLY;BYMONTHDAY=${days.join(",")}`;
}

/** The repeat's first date from today (inclusive). */
function firstDate(repeat: RepeatMatch, today: IsoDate): IsoDate {
  if (repeat.weekdays.length === 0 && repeat.monthDays.length === 0) return today;
  for (let n = 0; n < 62; n += 1) {
    const day = addDays(today, n);
    const lastOfMonth = addDays(day, 1).endsWith("-01");
    const matches =
      repeat.weekdays.includes(isoWeekday(day)) ||
      repeat.monthDays.includes(Number(day.slice(8))) ||
      (lastOfMonth && repeat.monthDays.includes(LAST_DAY));
    if (matches) return day;
  }
  return today;
}

interface DateMatch {
  value: IsoDate;
  /** How many words it consumed. */
  length: number;
}

function matchDate(words: readonly string[], i: number, today: IsoDate): DateMatch | null {
  const w = (words[i] ?? "").toLowerCase();
  const next = (words[i + 1] ?? "").toLowerCase();
  const after = (words[i + 2] ?? "").toLowerCase();

  if (w === "today" || w === "tod") return { value: today, length: 1 };
  if (w === "tomorrow" || w === "tmr" || w === "tom")
    return { value: addDays(today, 1), length: 1 };
  if (w in WEEKDAYS) {
    const target = WEEKDAYS[w] ?? 1;
    const delta = (target - isoWeekday(today) + 7) % 7 || 7;
    return { value: addDays(today, delta), length: 1 };
  }
  if (w === "next" && next === "week") {
    const delta = 8 - isoWeekday(today);
    return { value: addDays(today, delta), length: 2 };
  }
  if (w === "in") {
    const count = next === "a" || next === "an" ? 1 : /^\d{1,3}$/.test(next) ? Number(next) : null;
    if (count !== null) {
      if (/^days?$/.test(after)) return { value: addDays(today, count), length: 3 };
      if (/^weeks?$/.test(after)) return { value: addDays(today, count * 7), length: 3 };
    }
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (iso && isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return { value: w, length: 1 };
  }
  const dotted = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4})?)?$/.exec(w);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    let year = dotted[3] !== undefined ? Number(dotted[3]) : Number(today.slice(0, 4));
    if (!isRealDate(year, month, day)) return null;
    let value = toIso(year, month, day);
    if (dotted[3] === undefined && value < today) {
      year += 1;
      if (!isRealDate(year, month, day)) return null;
      value = toIso(year, month, day);
    }
    return { value, length: 1 };
  }
  return null;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toIso(year: number, month: number, day: number): IsoDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface PlaceMatch {
  list_id: string;
  section_id: string | null;
  label: string;
  length: number;
}

/** Matches "#List" or "#List/Section" (names may span words); longest names win. */
function matchPlace(words: readonly string[], i: number, ctx: ParseContext): PlaceMatch | null {
  const rest = words.slice(i).join(" ").slice(1);
  const restLower = rest.toLowerCase();
  const lists = [...ctx.lists].sort((a, b) => b.name.length - a.name.length);
  for (const list of lists) {
    const name = list.name.toLowerCase();
    if (!restLower.startsWith(name)) continue;
    const boundary = restLower.charAt(name.length);
    if (boundary !== "" && boundary !== " " && boundary !== "/") continue;

    let consumed = name.length;
    let section: { id: string; name: string } | null = null;
    if (boundary === "/") {
      const afterSlash = restLower.slice(name.length + 1);
      const sections = ctx.sections
        .filter((s) => s.list_id === list.id)
        .sort((a, b) => b.name.length - a.name.length);
      section =
        sections.find((s) => {
          const sName = s.name.toLowerCase();
          const end = afterSlash.charAt(sName.length);
          return afterSlash.startsWith(sName) && (end === "" || end === " ");
        }) ?? null;
      if (section === null) continue;
      consumed += 1 + section.name.length;
    }
    // Count the words the match spans ("#" + consumed characters).
    const matched = rest.slice(0, consumed);
    const length = matched.split(" ").length;
    return {
      list_id: list.id,
      section_id: section?.id ?? null,
      label: section ? `${list.name} / ${section.name}` : list.name,
      length,
    };
  }
  return null;
}

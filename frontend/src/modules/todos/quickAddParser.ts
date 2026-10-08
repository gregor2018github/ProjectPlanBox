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
 * Only the first date and priority count; recognised parts leave the title.
 */
import { addDays, isoWeekday, type IsoDate } from "../../core/time";

/** Known names the parser can resolve. */
export interface ParseContext {
  today: IsoDate;
  lists: readonly { id: string; name: string }[];
  sections: readonly { id: string; list_id: string; name: string }[];
  tags: readonly { id: string; name: string }[];
}

/** A recognised part, for the chips under the input. */
export interface ParsedToken {
  kind: "due" | "priority" | "place" | "tag";
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
    tokens: [],
  };
  const words = input.split(/\s+/).filter((w) => w !== "");
  const kept: string[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    const lower = word.toLowerCase();

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
  return result;
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

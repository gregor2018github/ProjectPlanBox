/**
 * Statistics over every todo, for the Insights page: the twin of
 * `backend/planbox/modules/todos/stats.py`. Pure: no SQL, no clock.
 */
import type { components } from "../../../core/api/schema";
import { dateDay, instantMs, isoDate, toLocal, weekday, type Day } from "../../../core/device/time";
import type { Area, Todo, TodoList } from "./repository";

/** The statistics as the API returns them. */
export type TodoStats = components["schemas"]["TodoStatsOut"];
type Bucket = components["schemas"]["StatsBucketOut"];

const WEEKS = 26;
const OLDEST_COUNT = 5;
const AGE_BUCKETS: readonly [string, number][] = [
  ["Under a day", 1],
  ["1–2 days", 3],
  ["3–7 days", 8],
  ["1–2 weeks", 15],
  ["2–4 weeks", 29],
  ["1–3 months", 91],
  ["3+ months", Infinity],
];
const PRIORITIES = [3, 2, 1, 0];
const DAY_MS = 86_400_000;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function countBy<T>(items: Iterable<T>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function lower(text: string): string {
  return text.toLowerCase();
}

function compare(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

class Snapshot {
  readonly today: Day;
  readonly live: Todo[];
  readonly open: Todo[];
  readonly done: Todo[];
  readonly overdueIds: Set<string>;
  readonly addedDays: Day[];
  readonly completedDays: Day[];
  readonly subtaskCompletedDays: Day[];
  readonly deletedDays: Day[];
  readonly ages: number[];

  constructor(
    todos: readonly Todo[],
    readonly now: number,
    readonly zone: string,
  ) {
    this.today = toLocal(now, zone).day;
    this.live = todos.filter((t) => t.deleted_at === null);
    this.open = this.live.filter((t) => t.completed_at === null);
    this.done = this.live.filter((t) => t.completed_at !== null);
    const todayIso = isoDate(this.today);
    this.overdueIds = new Set(
      this.open.filter((t) => t.due_date !== null && t.due_date < todayIso).map((t) => t.id),
    );
    this.addedDays = todos
      .filter((t) => t.recurs_from_id === null)
      .map((t) => this.day(t.created_at));
    this.completedDays = todos.flatMap((t) => (t.completed_at ? [this.day(t.completed_at)] : []));
    this.subtaskCompletedDays = todos.flatMap((t) =>
      t.completed_at && t.parent_id !== null ? [this.day(t.completed_at)] : [],
    );
    this.deletedDays = todos.flatMap((t) => (t.deleted_at ? [this.day(t.deleted_at)] : []));
    this.ages = this.open.map((t) => this.age(t)).sort((a, b) => a - b);
  }

  day(instant: string): Day {
    return toLocal(instantMs(instant), this.zone).day;
  }

  age(todo: Todo): number {
    return Math.max(0, days(todo.created_at, this.now));
  }
}

function days(start: string, end: number): number {
  return (end - instantMs(start)) / DAY_MS;
}

class Places {
  readonly lists: Map<string, TodoList>;
  readonly areas: Map<string, Area>;

  constructor(lists: readonly TodoList[], areas: readonly Area[]) {
    this.lists = new Map(lists.map((l) => [l.id, l]));
    this.areas = new Map(areas.map((a) => [a.id, a]));
  }

  listOf(todo: Todo): TodoList | undefined {
    return todo.list_id === null ? undefined : this.lists.get(todo.list_id);
  }

  listName(todo: Todo): string {
    return this.listOf(todo)?.name ?? "Inbox";
  }

  areaId(todo: Todo): string | null {
    return this.listOf(todo)?.area_id ?? null;
  }
}

function buckets(values: Iterable<number>): Bucket[] {
  const counts = countBy(
    [...values].map((v) => AGE_BUCKETS.find(([, bound]) => v < bound)?.[0] ?? ""),
  );
  return AGE_BUCKETS.map(([label]) => ({ label, count: counts.get(label) ?? 0 }));
}

function percentile(sorted: readonly number[], share: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] as number;
}

function streaks(daysList: readonly Day[], today: Day): TodoStats["streaks"] {
  const perDay = countBy(daysList);
  if (perDay.size === 0) return { current: 0, longest: 0, active_days: 0, best_day: null };
  let current = 0;
  let cursor = perDay.has(today) ? today : today - 1;
  while (perDay.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  let longest = 0;
  let run = 0;
  let previous: Day | null = null;
  for (const d of [...perDay.keys()].sort((a, b) => a - b)) {
    run = previous !== null && d - previous === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d;
  }
  let best: [Day, number] | null = null;
  for (const [d, count] of perDay) {
    if (best === null || count > best[1] || (count === best[1] && d > best[0])) best = [d, count];
  }
  return {
    current,
    longest,
    active_days: perDay.size,
    best_day: best === null ? null : { date: isoDate(best[0]), count: best[1] },
  };
}

/** Computes every todo statistic (see the Python twin for what each means). */
export function computeStats(
  todos: readonly Todo[],
  options: {
    lists: readonly TodoList[];
    areas: readonly Area[];
    tagIds: ReadonlyMap<string, readonly string[]>;
    now: number;
    zone: string;
  },
): TodoStats {
  const s = new Snapshot(todos, options.now, options.zone);
  const places = new Places(options.lists, options.areas);
  const todayIso = isoDate(s.today);

  const within = (list: readonly Day[], first: number, last: number) =>
    list.filter((d) => d >= s.today - last && d <= s.today - first).length;

  const firstMonday = s.today - weekday(s.today) - 7 * (WEEKS - 1);
  const perWeek = (list: readonly Day[]) =>
    countBy(list.filter((d) => d >= firstMonday).map((d) => d - weekday(d)));
  const added = perWeek(s.addedDays);
  const completed = perWeek(s.completedDays);
  const removed = perWeek(s.deletedDays);

  const oneOff = s.done.filter((t) => t.rrule === null && t.recurs_from_id === null);
  const lead = new Map(
    oneOff.map((t) => [t.id, Math.max(0, days(t.created_at, instantMs(String(t.completed_at))))]),
  );
  const leadValues = [...lead.values()].sort((a, b) => a - b);

  const since30 = s.today - 29;
  const listRows = [null, ...places.lists.keys()].flatMap((listId) => {
    const members = s.live.filter((t) => t.list_id === listId);
    if (listId !== null && members.length === 0) return [];
    const found = listId === null ? undefined : places.lists.get(listId);
    const area = found?.area_id == null ? undefined : places.areas.get(found.area_id);
    return [
      {
        id: listId,
        name: found?.name ?? "Inbox",
        area_name: area?.name ?? null,
        open: members.filter((t) => t.completed_at === null).length,
        overdue: members.filter((t) => s.overdueIds.has(t.id)).length,
        completed: members.filter((t) => t.completed_at !== null).length,
        completed_30: members.filter(
          (t) => t.completed_at !== null && s.day(t.completed_at) >= since30,
        ).length,
      },
    ];
  });
  listRows.sort(
    (a, b) => b.open - a.open || b.completed - a.completed || compare(lower(a.name), lower(b.name)),
  );

  const areaRows = [null, ...places.areas.keys()]
    .map((areaId) => ({
      id: areaId,
      name: areaId === null ? "No area" : (places.areas.get(areaId)?.name ?? ""),
      open: s.open.filter((t) => places.areaId(t) === areaId).length,
      completed: s.done.filter((t) => places.areaId(t) === areaId).length,
    }))
    .filter((r) => r.open > 0 || r.completed > 0)
    .sort(
      (a, b) =>
        b.open - a.open || b.completed - a.completed || compare(lower(a.name), lower(b.name)),
    );

  const stillOpen = new Map<string, number>();
  const doneTags = new Map<string, number>();
  for (const t of s.live) {
    const target = t.completed_at === null ? stillOpen : doneTags;
    for (const tag of options.tagIds.get(t.id) ?? []) target.set(tag, (target.get(tag) ?? 0) + 1);
  }
  const tagRows = [...new Set([...stillOpen.keys(), ...doneTags.keys()])]
    .map((tag) => ({
      tag_id: tag,
      open: stillOpen.get(tag) ?? 0,
      completed: doneTags.get(tag) ?? 0,
    }))
    .sort((a, b) => b.open + b.completed - (a.open + a.completed) || compare(a.tag_id, b.tag_id));

  const punchcard = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const t of s.done) {
    const local = toLocal(instantMs(String(t.completed_at)), s.zone);
    const row = punchcard[weekday(local.day)] as number[];
    const hour = Math.floor(local.ms / 3_600_000);
    row[hour] = (row[hour] ?? 0) + 1;
  }

  const withDue = s.done.filter((t) => t.due_date !== null);
  const lateness = withDue.map((t) => s.day(String(t.completed_at)) - dateDay(String(t.due_date)));
  const late = lateness.filter((d) => d > 0);

  const weekAhead = s.today + 7;
  return {
    today: todayIso,
    totals: {
      open: s.open.length,
      overdue: s.overdueIds.size,
      due_today: s.open.filter((t) => t.due_date === todayIso).length,
      due_next_7: s.open.filter(
        (t) =>
          t.due_date !== null && dateDay(t.due_date) > s.today && dateDay(t.due_date) <= weekAhead,
      ).length,
      no_due_date: s.open.filter((t) => t.due_date === null).length,
      inbox: s.open.filter((t) => t.list_id === null).length,
      repeating: s.open.filter((t) => t.rrule !== null).length,
      subtasks_open: s.open.filter((t) => t.parent_id !== null).length,
      completed: s.done.length,
      subtasks_completed: s.done.filter((t) => t.parent_id !== null).length,
      added: s.addedDays.length,
      deleted: s.deletedDays.length,
    },
    recent: {
      added_7: within(s.addedDays, 0, 6),
      completed_7: within(s.completedDays, 0, 6),
      added_prev_7: within(s.addedDays, 7, 13),
      completed_prev_7: within(s.completedDays, 7, 13),
      added_30: within(s.addedDays, 0, 29),
      completed_30: within(s.completedDays, 0, 29),
      subtasks_completed_7: within(s.subtaskCompletedDays, 0, 6),
    },
    weeks: Array.from({ length: WEEKS }, (_, i) => {
      const start = firstMonday + 7 * i;
      return {
        start: isoDate(start),
        added: added.get(start) ?? 0,
        completed: completed.get(start) ?? 0,
        deleted: removed.get(start) ?? 0,
      };
    }),
    lead_time: {
      count: leadValues.length,
      mean_days: mean(leadValues),
      median_days: median(leadValues),
      p90_days: percentile(leadValues, 0.9),
      buckets: buckets(leadValues),
      by_priority: PRIORITIES.map((p) => {
        const mine = oneOff.filter((t) => t.priority === p).map((t) => lead.get(t.id) ?? 0);
        return { priority: p, count: mine.length, median_days: median(mine) };
      }),
    },
    open_age: { median_days: median(s.ages), buckets: buckets(s.ages) },
    oldest_open: [...s.open]
      .sort((a, b) => compare(a.created_at, b.created_at) || compare(a.id, b.id))
      .slice(0, OLDEST_COUNT)
      .map((t) => ({
        id: t.id,
        title: t.title,
        created_at: t.created_at,
        age_days: Math.trunc(s.age(t)),
        place: places.listName(t),
      })),
    priorities: PRIORITIES.map((p) => ({
      priority: p,
      open: s.open.filter((t) => t.priority === p).length,
      completed: s.done.filter((t) => t.priority === p).length,
      overdue: s.open.filter((t) => t.priority === p && s.overdueIds.has(t.id)).length,
    })),
    lists: listRows,
    areas: areaRows,
    tags: tagRows,
    punchcard,
    due: {
      with_due_date: withDue.length,
      on_time: lateness.length - late.length,
      late: late.length,
      mean_days_late: mean(late),
    },
    streaks: streaks(
      s.done.map((t) => s.day(String(t.completed_at))),
      s.today,
    ),
  };
}

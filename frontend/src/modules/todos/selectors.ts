/**
 * Views derived from the single cached todo array (ARCHITECTURE §8). Pure
 * and memoisable; every view stays right after any optimistic update.
 */
import { byPosition } from "../../core/ordering";
import { matchesTagFilter } from "../../core/tags/tagFilter";
import type { IsoDate } from "../../core/time";
import type { Area, Section, Todo, TodoList } from "./types";

const isOpen = (t: Todo) => t.completed_at === null;
const isTopLevel = (t: Todo) => t.parent_id === null;

/** Higher priority first, then manual order. */
function byPriorityThenPosition(a: Todo, b: Todo): number {
  return b.priority - a.priority || byPosition(a, b);
}

/**
 * The todos the global tag filter leaves visible: those carrying every
 * filter tag, plus the subtasks of such a todo and the parent of such a
 * subtask, so a match is never shown without its context.
 */
export function filterTodosByTags(todos: readonly Todo[], tagIds: readonly string[]): Todo[] {
  if (tagIds.length === 0) return [...todos];
  const matching = new Set(
    todos.filter((t) => matchesTagFilter(t.tag_ids, tagIds)).map((t) => t.id),
  );
  const parentsOfMatches = new Set(
    todos.filter((t) => t.parent_id !== null && matching.has(t.id)).map((t) => t.parent_id),
  );
  return todos.filter(
    (t) =>
      matching.has(t.id) ||
      parentsOfMatches.has(t.id) ||
      (t.parent_id !== null && matching.has(t.parent_id)),
  );
}

/** Open top-level todos plus those completed today, split. */
export interface OpenAndDone {
  open: Todo[];
  done: Todo[];
}

function split(todos: Todo[]): OpenAndDone {
  const sorted = [...todos].sort(byPosition);
  return { open: sorted.filter(isOpen), done: sorted.filter((t) => !isOpen(t)) };
}

/** The Inbox: top-level todos without a list. */
export function inboxView(todos: readonly Todo[]): OpenAndDone {
  return split(todos.filter((t) => t.list_id === null && isTopLevel(t)));
}

/** Subtasks of a todo, in order (open and completed). */
export function childrenOf(todos: readonly Todo[], parentId: string): Todo[] {
  return todos.filter((t) => t.parent_id === parentId).sort(byPosition);
}

/** One section of a list view; `section` null is the part above the first heading. */
export interface SectionGroup {
  section: Section | null;
  todos: Todo[];
}

/** A list: open top-level todos per section, plus completed ones at the end. */
export interface ListViewData {
  groups: SectionGroup[];
  done: Todo[];
}

/** Builds a list view. */
export function listView(
  todos: readonly Todo[],
  sections: readonly Section[],
  listId: string,
): ListViewData {
  const inList = todos.filter((t) => t.list_id === listId && isTopLevel(t));
  const own = sections.filter((s) => s.list_id === listId).sort(byPosition);
  const open = inList.filter(isOpen).sort(byPosition);
  return {
    groups: [
      { section: null, todos: open.filter((t) => t.section_id === null) },
      ...own.map((section) => ({
        section,
        todos: open.filter((t) => t.section_id === section.id),
      })),
    ],
    done: inList.filter((t) => !isOpen(t)).sort(byPosition),
  };
}

/** Today: overdue first, then due today, then what was completed today. */
export interface TodayViewData {
  overdue: Todo[];
  today: Todo[];
  done: Todo[];
}

/** Overdue fallback order: oldest due date first, then priority. */
function byDueThenPriority(a: Todo, b: Todo): number {
  return (a.due_date ?? "").localeCompare(b.due_date ?? "") || byPriorityThenPosition(a, b);
}

/**
 * Today's order inside one group: todos placed by hand (`today_position`)
 * first, in that order; the rest below, auto-sorted by `fallback`.
 */
export function byTodayOrder(fallback: (a: Todo, b: Todo) => number) {
  return (a: Todo, b: Todo): number => {
    const ka = a.today_position;
    const kb = b.today_position;
    if (ka !== null && kb !== null && ka !== kb) return ka < kb ? -1 : 1;
    if ((ka === null) !== (kb === null)) return ka === null ? 1 : -1;
    return fallback(a, b);
  };
}

/** Order of the "Overdue" group in Today. */
export const overdueOrder = byTodayOrder(byDueThenPriority);
/** Order of the "Due today" group in Today. */
export const dueTodayOrder = byTodayOrder(byPriorityThenPosition);

/** Builds Today (subtasks with a due date appear on their own). */
export function todayView(todos: readonly Todo[], today: IsoDate): TodayViewData {
  const dated = todos.filter((t) => t.due_date !== null && t.due_date <= today);
  return {
    overdue: dated.filter((t) => isOpen(t) && (t.due_date ?? "") < today).sort(overdueOrder),
    today: dated.filter((t) => isOpen(t) && t.due_date === today).sort(dueTodayOrder),
    done: dated.filter((t) => !isOpen(t)).sort(byPriorityThenPosition),
  };
}

/** One day in Upcoming. */
export interface DayGroup {
  date: IsoDate;
  todos: Todo[];
}

/** Upcoming: open todos due after today, grouped by day. */
export function upcomingView(todos: readonly Todo[], today: IsoDate): DayGroup[] {
  const future = todos.filter((t) => isOpen(t) && t.due_date !== null && t.due_date > today);
  const days = [...new Set(future.map((t) => t.due_date as IsoDate))].sort();
  return days.map((date) => ({
    date,
    todos: future.filter((t) => t.due_date === date).sort(byPriorityThenPosition),
  }));
}

/** Sidebar badge numbers. */
export interface Counts {
  /** Every open top-level todo (the "All todos" badge). */
  open: number;
  inbox: number;
  today: number;
  overdue: number;
  lists: Record<string, number>;
}

/** Open counts for the sidebar (Today counts subtasks with a due date too). */
export function counts(todos: readonly Todo[], today: IsoDate | null): Counts {
  const result: Counts = { open: 0, inbox: 0, today: 0, overdue: 0, lists: {} };
  for (const t of todos) {
    if (!isOpen(t)) continue;
    if (isTopLevel(t)) {
      result.open += 1;
      if (t.list_id === null) result.inbox += 1;
      else result.lists[t.list_id] = (result.lists[t.list_id] ?? 0) + 1;
    }
    if (today !== null && t.due_date !== null && t.due_date <= today) {
      result.today += 1;
      if (t.due_date < today) result.overdue += 1;
    }
  }
  return result;
}

/** Lists outside any area, then each area with its lists, all in order. */
export interface Tree {
  loose: TodoList[];
  areas: { area: Area; lists: TodoList[] }[];
}

/** Builds the sidebar tree. */
export function listTree(areas: readonly Area[], lists: readonly TodoList[]): Tree {
  return {
    loose: lists.filter((l) => l.area_id === null).sort(byPosition),
    areas: [...areas].sort(byPosition).map((area) => ({
      area,
      lists: lists.filter((l) => l.area_id === area.id).sort(byPosition),
    })),
  };
}

/** The visible order of a view's top-level rows with their open subtasks (for keyboard nav). */
export function flattenWithChildren(
  rows: readonly Todo[],
  todos: readonly Todo[],
  expanded: ReadonlySet<string>,
): Todo[] {
  return rows.flatMap((row) =>
    expanded.has(row.id) ? [row, ...childrenOf(todos, row.id)] : [row],
  );
}

/** One place in the "All todos" view: the Inbox or a list (with its area). */
export interface PlaceGroup {
  /** "inbox", a list id, or "elsewhere" for todos whose list is not loaded. */
  key: string;
  list: TodoList | null;
  area: Area | null;
  /** Open top-level todos, in the list's order (sections in order). */
  todos: Todo[];
}

/** Everything open, by place, plus the totals the header shows. */
export interface AllViewData {
  groups: PlaceGroup[];
  /** Top-level todos completed today. */
  done: Todo[];
  open: number;
  subtasksOpen: number;
}

/**
 * All todos at once: the Inbox, the lists outside areas, then each area's
 * lists (sidebar order). Places without open todos are left out.
 */
export function allView(
  todos: readonly Todo[],
  areas: readonly Area[],
  lists: readonly TodoList[],
  sections: readonly Section[],
): AllViewData {
  const sectionRank = new Map(
    [...sections].sort(byPosition).map((section, index) => [section.id, index]),
  );
  const inListOrder = (a: Todo, b: Todo) =>
    (sectionRank.get(a.section_id ?? "") ?? -1) - (sectionRank.get(b.section_id ?? "") ?? -1) ||
    byPosition(a, b);
  const open = todos.filter((t) => isOpen(t) && isTopLevel(t));
  const tree = listTree(areas, lists);
  const places: { key: string; list: TodoList | null; area: Area | null }[] = [
    { key: "inbox", list: null, area: null },
    ...tree.loose.map((list) => ({ key: list.id, list, area: null })),
    ...tree.areas.flatMap(({ area, lists: own }) =>
      own.map((list) => ({ key: list.id, list, area })),
    ),
  ];
  const known = new Set(lists.map((l) => l.id));
  const groups = [
    ...places.map((place) => ({
      ...place,
      todos: open.filter((t) => t.list_id === (place.list?.id ?? null)).sort(inListOrder),
    })),
    {
      key: "elsewhere",
      list: null,
      area: null,
      todos: open.filter((t) => t.list_id !== null && !known.has(t.list_id)).sort(byPosition),
    },
  ].filter((g) => g.todos.length > 0);
  return {
    groups,
    done: todos.filter((t) => !isOpen(t) && isTopLevel(t)).sort(byPosition),
    open: open.length,
    subtasksOpen: todos.filter((t) => isOpen(t) && !isTopLevel(t)).length,
  };
}

/** "My order": ranked todos by their key (ids break ties, as on the server). */
export function byRank(a: Todo, b: Todo): number {
  const ka = a.rank_position ?? "";
  const kb = b.rank_position ?? "";
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The two parts of "My order" in All todos. */
export interface RankViewData {
  /** Todos not ranked yet (new ones, or taken out), in place order. */
  unsorted: Todo[];
  /** The ranked todos and subtasks, top to bottom. */
  ranked: Todo[];
}

/**
 * "My order": every open todo and subtask in one flat ranking, plus the
 * unsorted ones waiting to be pulled in. Unsorted todos follow the places
 * (as in the sidebar), each parent followed by its unsorted subtasks.
 * `keep` holds just-completed todos that stay in place for a moment.
 */
export function rankView(
  todos: readonly Todo[],
  areas: readonly Area[],
  lists: readonly TodoList[],
  sections: readonly Section[],
  keep: ReadonlySet<string> = new Set(),
): RankViewData {
  const shown = todos.filter((t) => isOpen(t) || keep.has(t.id));
  const ranked = shown.filter((t) => t.rank_position !== null).sort(byRank);
  // Place order through allView, which only looks at open todos.
  const asOpen = shown.map((t) => (isOpen(t) ? t : { ...t, completed_at: null }));
  const original = new Map(shown.map((t) => [t.id, t]));
  const placed = allView(asOpen, areas, lists, sections).groups.flatMap((g) =>
    g.todos.flatMap((t) => [t, ...childrenOf(asOpen, t.id)]),
  );
  const placedIds = new Set(placed.map((t) => t.id));
  const order = [
    ...placed,
    ...asOpen.filter((t) => !isTopLevel(t) && !placedIds.has(t.id)).sort(byPosition),
  ];
  const unsorted = order
    .map((t) => original.get(t.id))
    .filter((t): t is Todo => t?.rank_position === null);
  return { unsorted, ranked };
}

/** The ids of every open ranked todo, top to bottom (ignores any tag filter). */
export function rankedIds(todos: readonly Todo[]): string[] {
  return todos
    .filter((t) => isOpen(t) && t.rank_position !== null)
    .sort(byRank)
    .map((t) => t.id);
}

/**
 * The ranking `ids` with `id` placed right before `beforeId`, else right
 * after `afterId`, else at the end. The neighbours come from what is on
 * screen, which a tag filter can thin out; the rest keeps its order.
 */
export function placeInRanking(
  ids: readonly string[],
  id: string,
  beforeId: string | null,
  afterId: string | null,
): string[] {
  const rest = ids.filter((x) => x !== id);
  const before = beforeId === null ? -1 : rest.indexOf(beforeId);
  const after = afterId === null ? -1 : rest.indexOf(afterId);
  const at = before !== -1 ? before : after !== -1 ? after + 1 : rest.length;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

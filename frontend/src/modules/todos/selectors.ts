/**
 * Views derived from the single cached todo array (ARCHITECTURE §8). Pure
 * and memoisable; every view stays right after any optimistic update.
 */
import { byPosition } from "../../core/ordering";
import type { IsoDate } from "../../core/time";
import type { Area, Section, Todo, TodoList } from "./types";

const isOpen = (t: Todo) => t.completed_at === null;
const isTopLevel = (t: Todo) => t.parent_id === null;

/** Higher priority first, then manual order. */
function byPriorityThenPosition(a: Todo, b: Todo): number {
  return b.priority - a.priority || byPosition(a, b);
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

/** Builds Today (subtasks with a due date appear on their own). */
export function todayView(todos: readonly Todo[], today: IsoDate): TodayViewData {
  const dated = todos.filter((t) => t.due_date !== null && t.due_date <= today);
  return {
    overdue: dated
      .filter((t) => isOpen(t) && (t.due_date ?? "") < today)
      .sort(
        (a, b) =>
          (a.due_date ?? "").localeCompare(b.due_date ?? "") || byPriorityThenPosition(a, b),
      ),
    today: dated.filter((t) => isOpen(t) && t.due_date === today).sort(byPriorityThenPosition),
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
  inbox: number;
  today: number;
  overdue: number;
  lists: Record<string, number>;
}

/** Open counts for the sidebar (Today counts subtasks with a due date too). */
export function counts(todos: readonly Todo[], today: IsoDate | null): Counts {
  const result: Counts = { inbox: 0, today: 0, overdue: 0, lists: {} };
  for (const t of todos) {
    if (!isOpen(t)) continue;
    if (isTopLevel(t)) {
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

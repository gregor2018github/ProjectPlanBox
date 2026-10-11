import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { HomeCard } from "../../../core/home/HomeCard";
import { addDays } from "../../../core/time";
import { todoPaths } from "../paths";
import { counts, dueTodayOrder, todayView, upcomingView } from "../selectors";
import type { Todo } from "../types";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { EmptyHint } from "./EmptyHint";
import { HomeFigure } from "./HomeFigure";
import { TodoGroup } from "./TodoGroup";

/** How many open rows the card lists before pointing to Today. */
export const HOME_ROWS = 8;

/**
 * The todos card on Home: the overdue and due-today todos to work through
 * (completable in place), plus counts that lead to Inbox and Upcoming.
 */
export function TodoHome() {
  const data = useTodoData();
  const actions = useTodoActions();
  const today = data.today;

  const derived = useMemo(() => {
    if (today === null) return null;
    const view = todayView(data.todos, today);
    const weekEnd = addDays(today, 7);
    const nextWeek = upcomingView(data.todos, today)
      .filter((day) => day.date <= weekEnd)
      .reduce((sum, day) => sum + day.todos.length, 0);
    const overdue = view.overdue.slice(0, HOME_ROWS);
    const dueToday = view.today.slice(0, HOME_ROWS - overdue.length);
    return {
      view,
      overdue,
      dueToday,
      hidden: view.overdue.length + view.today.length - overdue.length - dueToday.length,
      inbox: counts(data.todos, today).inbox,
      nextWeek,
    };
  }, [data.todos, today]);

  if (derived === null) return <HomeCard title="Todos" to={todoPaths.today} />;
  const { view, overdue, dueToday, hidden } = derived;
  const open = view.overdue.length + view.today.length;
  const summary =
    open === 0 && view.done.length === 0
      ? "Nothing due today"
      : `${String(open)} to do today · ${String(view.done.length)} done`;
  const rowProps = { data, actions, showPlace: true, showParent: true, expandable: false };
  const dueOn = (t: Todo) => t.due_date === today;

  return (
    <HomeCard title="Todos" summary={summary} to={todoPaths.today}>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        <HomeFigure label="Overdue" value={view.overdue.length} to={todoPaths.today} danger />
        <HomeFigure label="Due today" value={view.today.length} to={todoPaths.today} />
        <HomeFigure label="Next 7 days" value={derived.nextWeek} to={todoPaths.upcoming} />
        <HomeFigure label="Inbox" value={derived.inbox} to={todoPaths.inbox} />
      </div>
      {!data.loading && open === 0 && (
        <EmptyHint text={view.done.length > 0 ? "All done for today." : "Nothing due today."} />
      )}
      {overdue.length > 0 && (
        <section>
          <h3 className="px-3 pb-1 text-sm font-medium text-danger">Overdue</h3>
          <TodoGroup todos={overdue} label="Overdue" {...rowProps} />
        </section>
      )}
      {/* Always mounted, so a todo just completed lingers in place (motion rule 4). */}
      <section>
        {overdue.length > 0 && dueToday.length > 0 && (
          <h3 className="px-3 pb-1 text-sm font-medium text-text-muted">Due today</h3>
        )}
        <TodoGroup
          todos={dueToday}
          label="Due today"
          includes={dueOn}
          sort={dueTodayOrder}
          hideDue
          {...rowProps}
        />
      </section>
      {hidden > 0 && (
        <Link
          to={todoPaths.today}
          className="self-start rounded-md px-3 py-1 text-sm text-accent transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11"
        >
          {String(hidden)} more in Today
        </Link>
      )}
    </HomeCard>
  );
}

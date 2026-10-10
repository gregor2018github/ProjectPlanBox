import { useMemo } from "react";

import { formatDayLong } from "../../../core/time";
import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { NewTodoInline } from "../components/NewTodoInline";
import { PageHeader } from "../../../ui/PageHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../../../ui/ViewLayout";
import { dueTodayOrder, todayView } from "../selectors";
import { INBOX, type Todo } from "../types";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** The rows of `group` with `todo` swapped with its neighbour, or null at an edge. */
function swapped(group: readonly Todo[], todo: Todo, direction: -1 | 1): string[] | null {
  const ids = group.map((t) => t.id);
  const i = ids.indexOf(todo.id);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
  return ids;
}

/**
 * Today: overdue first, then due today, then done. Both open groups can be
 * reordered by drag or Alt+↑/↓; todos not placed by hand yet sit below,
 * auto-sorted (overdue by date, due today by priority).
 */
export function TodayPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const today = data.today;
  const view = useMemo(
    () => (today === null ? { overdue: [], today: [], done: [] } : todayView(data.todos, today)),
    [data.todos, today],
  );
  const visible = useMemo(() => [...view.overdue, ...view.today, ...view.done], [view]);
  const shift = (todo: Todo, direction: -1 | 1) => {
    const group = view.overdue.includes(todo) ? view.overdue : view.today;
    const ids = swapped(group, todo, direction);
    if (ids)
      actions.reorderToday(
        ids,
        group.map((t) => t.id),
      );
  };
  useTodoKeyboard(visible, actions, { reorder: true, shift });
  const onReorder = (ids: string[], before: readonly string[]) => {
    actions.reorderToday(ids, before);
  };

  const dueToday = (t: Todo) => t.due_date === today;
  const rowProps = {
    data,
    actions,
    showPlace: true,
    showParent: true,
    hideDue: true,
    expandable: false,
  };

  return (
    <ViewLayout>
      <PageHeader title="Today" subtitle={today === null ? undefined : formatDayLong(today)} />
      {!data.loading && visible.length === 0 && <EmptyHint text="Nothing due today." />}
      {view.overdue.length > 0 && (
        <section className="mb-4">
          <h2 className="px-3 pb-1 text-sm font-medium text-danger">Overdue</h2>
          <TodoGroup
            todos={view.overdue}
            label="Overdue"
            reorder={{ group: "today:overdue", onReorder }}
            {...rowProps}
            hideDue={false}
          />
        </section>
      )}
      <TodoGroup
        todos={view.today}
        label="Due today"
        includes={dueToday}
        sort={dueTodayOrder}
        reorder={{ group: "today:due", onReorder }}
        {...rowProps}
      />
      {today !== null && (
        <NewTodoInline
          placement={INBOX}
          data={data}
          actions={actions}
          defaults={{ due_date: today }}
        />
      )}
      <CompletedGroup view="today" todos={view.done} data={data} actions={actions} showPlace />
    </ViewLayout>
  );
}

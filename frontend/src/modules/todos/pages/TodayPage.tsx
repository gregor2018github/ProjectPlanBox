import { useMemo } from "react";

import { formatDayLong } from "../../../core/time";
import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { NewTodoInline } from "../components/NewTodoInline";
import { PageHeader } from "../components/PageHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../components/ViewLayout";
import { todayView } from "../selectors";
import { INBOX, type Todo } from "../types";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

const byPriority = (a: Todo, b: Todo) =>
  b.priority - a.priority || (a.position < b.position ? -1 : 1);

/** Today: overdue first, then due today (auto-sorted by priority), then done. */
export function TodayPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const today = data.today;
  const view = useMemo(
    () => (today === null ? { overdue: [], today: [], done: [] } : todayView(data.todos, today)),
    [data.todos, today],
  );
  const visible = useMemo(() => [...view.overdue, ...view.today, ...view.done], [view]);
  useTodoKeyboard(visible, actions, { reorder: false });

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
          <TodoGroup todos={view.overdue} label="Overdue" {...rowProps} hideDue={false} />
        </section>
      )}
      <TodoGroup
        todos={view.today}
        label="Due today"
        includes={dueToday}
        sort={byPriority}
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
      <CompletedGroup todos={view.done} data={data} actions={actions} showPlace />
    </ViewLayout>
  );
}

import { useMemo } from "react";

import { useMeta } from "../../../core/api/coreQueries";
import { formatRelativeDay, todayIn } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { PageHeader } from "../components/PageHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../components/ViewLayout";
import { useLogbook } from "../queries";
import type { Todo } from "../types";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** Everything completed, newest first, grouped by the day it was done. */
export function LogbookPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const { data: meta } = useMeta();
  const logbook = useLogbook();

  const days = useMemo(() => {
    const todos = logbook.data?.pages.flatMap((p) => p.todos) ?? [];
    const zone = meta?.timezone ?? "UTC";
    const byDay = new Map<string, Todo[]>();
    for (const todo of todos) {
      const day = todayIn(zone, new Date(todo.completed_at ?? todo.updated_at));
      byDay.set(day, [...(byDay.get(day) ?? []), todo]);
    }
    return [...byDay.entries()];
  }, [logbook.data, meta]);
  const visible = useMemo(() => days.flatMap(([, todos]) => todos), [days]);
  useTodoKeyboard(visible, actions, { reorder: false });

  return (
    <ViewLayout>
      <PageHeader title="Logbook" subtitle="Everything you have completed." />
      {logbook.isSuccess && visible.length === 0 && (
        <p className="px-3 py-6 text-base text-text-muted">Nothing completed yet.</p>
      )}
      {data.today !== null &&
        days.map(([day, todos]) => (
          <section key={day} className="mb-5">
            <h2 className="px-3 pb-1 text-base font-semibold">
              {formatRelativeDay(day, data.today ?? day)}
            </h2>
            <TodoGroup
              todos={todos}
              data={data}
              actions={actions}
              label={day}
              showPlace
              showParent
              expandable={false}
            />
          </section>
        ))}
      {logbook.hasNextPage && (
        <Button
          variant="secondary"
          className="ml-3"
          disabled={logbook.isFetchingNextPage}
          onClick={() => {
            void logbook.fetchNextPage();
          }}
        >
          Show older
        </Button>
      )}
    </ViewLayout>
  );
}

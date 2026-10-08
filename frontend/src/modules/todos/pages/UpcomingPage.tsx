import { useMemo } from "react";

import { formatDayShort, formatRelativeDay } from "../../../core/time";
import { EmptyHint } from "../components/EmptyHint";
import { PageHeader } from "../components/PageHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../components/ViewLayout";
import { upcomingView } from "../selectors";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** Upcoming: everything due after today, grouped by day. */
export function UpcomingPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const today = data.today;
  const days = useMemo(
    () => (today === null ? [] : upcomingView(data.todos, today)),
    [data.todos, today],
  );
  const visible = useMemo(() => days.flatMap((d) => d.todos), [days]);
  useTodoKeyboard(visible, actions, { reorder: false });

  return (
    <ViewLayout>
      <PageHeader title="Upcoming" />
      {!data.loading && days.length === 0 && <EmptyHint text="Nothing scheduled after today." />}
      {today !== null &&
        days.map((day) => {
          const relative = formatRelativeDay(day.date, today);
          const short = formatDayShort(day.date);
          return (
            <section key={day.date} className="mb-5">
              <h2 className="flex items-baseline gap-2 px-3 pb-1">
                <span className="text-base font-semibold">{relative}</span>
                {relative !== short && <span className="text-sm text-text-muted">{short}</span>}
              </h2>
              <TodoGroup
                todos={day.todos}
                data={data}
                actions={actions}
                label={relative}
                showPlace
                showParent
                hideDue
                expandable={false}
              />
            </section>
          );
        })}
    </ViewLayout>
  );
}

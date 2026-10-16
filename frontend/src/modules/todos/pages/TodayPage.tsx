import { CalendarClock, ListOrdered } from "lucide-react";
import { useMemo } from "react";

import { formatDayLong } from "../../../core/time";
import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { MyOrderView } from "../components/MyOrderView";
import { NewTodoInline } from "../components/NewTodoInline";
import { TodayByDate } from "../components/TodayByDate";
import { PageHeader } from "../../../ui/PageHeader";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { ViewLayout } from "../../../ui/ViewLayout";
import { todayView } from "../selectors";
import { INBOX } from "../types";
import { useTodayMode, type TodayMode } from "../viewModes";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";

const MODES: readonly SegmentOption<TodayMode>[] = [
  { value: "date", label: "By date", icon: CalendarClock },
  { value: "ranked", label: "My order", icon: ListOrdered },
];

/**
 * Today: everything overdue or due today, then what was done today. "By
 * date" splits it into Overdue and Due today; "My order" is one hand-sorted
 * ranking of both, with an Unsorted box for todos new to Today. The switch
 * is remembered per browser.
 */
export function TodayPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const [mode, setMode] = useTodayMode();
  const today = data.today;
  const view = useMemo(
    () => (today === null ? { overdue: [], today: [], done: [] } : todayView(data.todos, today)),
    [data.todos, today],
  );
  const open = view.overdue.length + view.today.length;
  const unsorted = [...view.overdue, ...view.today].filter(
    (t) => t.today_rank_position === null,
  ).length;
  const subtitle =
    today === null
      ? undefined
      : mode === "ranked" && unsorted > 0
        ? `${formatDayLong(today)} · ${String(unsorted)} unsorted`
        : formatDayLong(today);

  return (
    <ViewLayout>
      <PageHeader
        title="Today"
        subtitle={subtitle}
        actions={
          <SegmentedControl
            label="Order"
            value={mode}
            onChange={setMode}
            options={MODES}
            showLabels
          />
        }
      />
      {!data.loading && open + view.done.length === 0 && <EmptyHint text="Nothing due today." />}
      {mode === "date" ? (
        <TodayByDate view={view} data={data} actions={actions} />
      ) : (
        open > 0 && <MyOrderView data={data} actions={actions} scope="today" />
      )}
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

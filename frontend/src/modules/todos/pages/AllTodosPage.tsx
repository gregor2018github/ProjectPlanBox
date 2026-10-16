import { LayoutList, ListOrdered } from "lucide-react";
import { useMemo } from "react";

import { plural } from "../../../core/insights/format";
import { PageHeader } from "../../../ui/PageHeader";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { ViewLayout } from "../../../ui/ViewLayout";
import { useAllTodosMode, type AllTodosMode } from "../viewModes";
import { AllByPlace } from "../components/AllByPlace";
import { EmptyHint } from "../components/EmptyHint";
import { MyOrderView } from "../components/MyOrderView";
import { allView } from "../selectors";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";

const MODES: readonly SegmentOption<AllTodosMode>[] = [
  { value: "place", label: "By place", icon: LayoutList },
  { value: "ranked", label: "My order", icon: ListOrdered },
];

/**
 * All todos: every open todo at once, either grouped by place (Inbox, then
 * the lists in sidebar order) or in the owner's own ranking ("My order").
 * The header counts what is open; the switch is remembered per browser.
 */
export function AllTodosPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const [mode, setMode] = useAllTodosMode();
  const view = useMemo(
    () => allView(data.todos, data.areas, data.lists, data.sections),
    [data.todos, data.areas, data.lists, data.sections],
  );

  const unsorted = data.todos.filter((t) => t.completed_at === null && t.rank_position === null);
  const open = view.open + view.subtasksOpen;
  const subtitle = data.loading
    ? undefined
    : mode === "place"
      ? `${plural(view.open, "open todo")} · ${plural(view.subtasksOpen, "open subtask")} · ${plural(view.groups.length, "place")}`
      : `${plural(open - unsorted.length, "todo")} in my order · ${String(unsorted.length)} unsorted`;

  return (
    <ViewLayout>
      <PageHeader
        title="All todos"
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
      {!data.loading && view.open === 0 && <EmptyHint text="Nothing open. Well done." />}
      {mode === "place" ? (
        <AllByPlace view={view} data={data} actions={actions} />
      ) : (
        view.open > 0 && <MyOrderView data={data} actions={actions} />
      )}
    </ViewLayout>
  );
}

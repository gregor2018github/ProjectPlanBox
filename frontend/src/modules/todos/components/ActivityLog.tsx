import { Circle, CircleCheck, ListTodo } from "lucide-react";
import { useMemo } from "react";

import { useMeta } from "../../../core/api/coreQueries";
import { matchesTagFilter, useTagFilter } from "../../../core/tags/tagFilter";
import { formatRelativeDay } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { activityDays, type ActivityKind } from "../activity";
import { useActivity } from "../queries";
import type { ActivityStatus } from "../types";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";
import { useActivityStatus } from "../viewModes";
import { TodoGroup } from "./TodoGroup";

const STATUSES: readonly SegmentOption<ActivityStatus>[] = [
  { value: "all", label: "All", icon: ListTodo },
  { value: "open", label: "Open", icon: Circle },
  { value: "completed", label: "Done", icon: CircleCheck },
];

const KIND_LABELS: Record<ActivityKind, string> = {
  added: "Added",
  changed: "Changed",
  completed: "Completed",
};

const EMPTY: Record<ActivityStatus, string> = {
  all: "No todos yet.",
  open: "No open todos.",
  completed: "Nothing completed yet.",
};

/**
 * The Logbook's activity feed: every todo on the day it was last added or
 * changed, newest first; all of them, or only the open or the done ones.
 */
export function ActivityLog() {
  const data = useTodoData();
  const actions = useTodoActions();
  const { data: meta } = useMeta();
  const [status, setStatus] = useActivityStatus();
  const activity = useActivity(status);
  const { tagIds } = useTagFilter();

  const days = useMemo(() => {
    // Prefer the main cache's copy: it already shows optimistic changes.
    const live = new Map(data.todos.map((t) => [t.id, t]));
    const todos = (activity.data?.pages.flatMap((p) => p.todos) ?? [])
      .map((t) => live.get(t.id) ?? t)
      .filter((t) => matchesTagFilter(t.tag_ids, tagIds));
    return activityDays(todos, meta?.timezone ?? "UTC");
  }, [activity.data, data.todos, meta, tagIds]);
  const visible = useMemo(() => days.flatMap((d) => d.groups.flatMap((g) => g.todos)), [days]);
  useTodoKeyboard(visible, actions, { reorder: false });

  return (
    <>
      <div className="mb-4 px-3">
        <SegmentedControl
          label="Show"
          value={status}
          onChange={setStatus}
          options={STATUSES}
          showLabels
        />
      </div>
      {activity.isSuccess && visible.length === 0 && (
        <p className="px-3 py-6 text-base text-text-muted">{EMPTY[status]}</p>
      )}
      {data.today !== null &&
        days.map(({ day, groups }) => (
          <section key={day} className="mb-5">
            <h2 className="px-3 pb-1 text-base font-semibold">
              {formatRelativeDay(day, data.today ?? day)}
            </h2>
            {groups.map(({ kind, todos }) => (
              <div key={kind} className="mb-2">
                <h3 className="px-3 pt-1 text-sm text-text-muted">{KIND_LABELS[kind]}</h3>
                <TodoGroup
                  todos={todos}
                  data={data}
                  actions={actions}
                  label={`${KIND_LABELS[kind]} ${day}`}
                  showPlace
                  showParent
                  expandable={false}
                />
              </div>
            ))}
          </section>
        ))}
      {activity.hasNextPage && (
        <Button
          variant="secondary"
          className="ml-3"
          disabled={activity.isFetchingNextPage}
          onClick={() => {
            void activity.fetchNextPage();
          }}
        >
          Show older
        </Button>
      )}
    </>
  );
}

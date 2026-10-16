import { dueTodayOrder, type TodayViewData } from "../selectors";
import type { Todo } from "../types";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";
import { TodoGroup } from "./TodoGroup";

/** The rows of `group` with `todo` swapped with its neighbour, or null at an edge. */
function swapped(group: readonly Todo[], todo: Todo, direction: -1 | 1): string[] | null {
  const ids = group.map((t) => t.id);
  const i = ids.indexOf(todo.id);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
  return ids;
}

/** Props for {@link TodayByDate}. */
export interface TodayByDateProps {
  view: TodayViewData;
  data: TodoData;
  actions: TodoActions;
}

/**
 * Today "By date": overdue first, then due today. Both groups can be
 * reordered by drag or Alt+↑/↓; todos not placed by hand yet sit below,
 * auto-sorted (overdue by date, due today by priority).
 */
export function TodayByDate({ view, data, actions }: TodayByDateProps) {
  const today = data.today;
  const shift = (todo: Todo, direction: -1 | 1) => {
    const group = view.overdue.includes(todo) ? view.overdue : view.today;
    const ids = swapped(group, todo, direction);
    if (ids)
      actions.reorderToday(
        ids,
        group.map((t) => t.id),
      );
  };
  useTodoKeyboard([...view.overdue, ...view.today, ...view.done], actions, {
    reorder: true,
    shift,
  });
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
    <>
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
    </>
  );
}

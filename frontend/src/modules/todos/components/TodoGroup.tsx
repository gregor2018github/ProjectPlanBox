import { AnimatePresence } from "motion/react";
import { useMemo } from "react";

import { byPosition } from "../../../core/ordering";
import { cx } from "../../../ui/cx";
import { useDropTarget } from "../../../ui/dnd";
import { groupKey } from "../dropRules";
import { childrenOf } from "../selectors";
import type { Placement, Todo } from "../types";
import { useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { SortableTodoItem } from "./SortableTodoItem";
import { TodoRow } from "./TodoRow";

/** Props for {@link TodoGroup}. */
export interface TodoGroupProps {
  /** The rows to show, already filtered for the view. */
  todos: readonly Todo[];
  data: TodoData;
  actions: TodoActions;
  /** Accessible name of the list. */
  label: string;
  /**
   * The container these rows live in. Setting it makes the group
   * reorderable by drag and drop (views with manual order only).
   */
  container?: Placement;
  /**
   * Whether a todo belongs here regardless of completion; lets a just
   * completed todo linger in place for a moment (motion rule 4).
   */
  includes?: (todo: Todo) => boolean;
  sort?: (a: Todo, b: Todo) => number;
  showPlace?: boolean;
  hideDue?: boolean;
  showParent?: boolean;
  /** Parents can expand their subtasks inline (list views). */
  expandable?: boolean;
}

/** An animated, optionally sortable list of todo rows with inline subtasks. */
export function TodoGroup({
  todos,
  data,
  actions,
  label,
  container,
  includes,
  sort = byPosition,
  showPlace,
  hideDue,
  showParent,
  expandable = true,
}: TodoGroupProps) {
  const lingering = useTodoUi((s) => s.lingering);
  const expanded = useTodoUi((s) => s.expanded);

  const rows = useMemo(() => {
    if (includes === undefined || lingering.size === 0) return [...todos];
    const shown = new Set(todos.map((t) => t.id));
    const extra = data.todos.filter(
      (t) => lingering.has(t.id) && !shown.has(t.id) && t.completed_at !== null && includes(t),
    );
    return [...todos, ...extra].sort(sort);
  }, [todos, includes, lingering, data.todos, sort]);

  const ids = rows.map((t) => t.id);
  const group = container ? groupKey(container) : null;
  const { ref: dropRef, isDropTarget } = useDropTarget({
    id: `empty:${group ?? label}`,
    accept: "todo",
    data: { kind: "todo-destination", placement: container ?? null },
    disabled: container === undefined || rows.length > 0,
  });
  const rowProps = { actions, lookup: data.lookup, today: data.today, showPlace, hideDue };

  return (
    <ul
      ref={dropRef}
      aria-label={label}
      className={cx(
        "flex flex-col rounded-md",
        container !== undefined && rows.length === 0 && "min-h-2",
        isDropTarget && "min-h-10 bg-accent-subtle",
      )}
    >
      <AnimatePresence initial={false}>
        {rows.map((todo, index) => {
          const children = expandable ? childrenOf(data.todos, todo.id) : [];
          const childContainer = container ? { ...container, parent_id: todo.id } : null;
          return (
            <SortableTodoItem
              key={todo.id}
              todo={todo}
              index={index}
              group={group}
              type="todo"
              data={{ kind: "todo-row", placement: container ?? todo, ids }}
              actions={actions}
            >
              <TodoRow
                todo={todo}
                {...rowProps}
                showParent={showParent}
                progress={{
                  done: children.filter((c) => c.completed_at !== null).length,
                  total: children.length,
                }}
              />
              {expandable && expanded.has(todo.id) && children.length > 0 && (
                <ul aria-label={`Subtasks of ${todo.title}`} className="flex flex-col pl-7">
                  {children.map((child, childIndex) => (
                    <SortableTodoItem
                      key={child.id}
                      todo={child}
                      index={childIndex}
                      group={childContainer ? groupKey(childContainer) : null}
                      type={`subtask:${todo.id}`}
                      data={{
                        kind: "todo-row",
                        placement: childContainer ?? child,
                        ids: children.map((c) => c.id),
                      }}
                      actions={actions}
                    >
                      <TodoRow todo={child} {...rowProps} hideDue={false} />
                    </SortableTodoItem>
                  ))}
                </ul>
              )}
            </SortableTodoItem>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

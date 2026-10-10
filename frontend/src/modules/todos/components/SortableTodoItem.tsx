import { motion } from "motion/react";
import type { ReactNode } from "react";

import { droppedDate } from "../../../core/calendar/dateDrop";
import { cx } from "../../../ui/cx";
import { useSortableItem } from "../../../ui/dnd";
import { durations, easings, springs } from "../../../ui/motion";
import { resolveTodoDrop, type TodoDropData } from "../dropRules";
import type { Todo } from "../types";
import type { TodoActions } from "../useTodoActions";

/** Props for {@link SortableTodoItem}. */
export interface SortableTodoItemProps {
  todo: Todo;
  index: number;
  /** Sortable group (null disables dragging, e.g. in auto-sorted views). */
  group: string | null;
  /** Items of the same type can be dropped together; subtasks only within their parent. */
  type: string;
  data: TodoDropData;
  actions: TodoActions;
  children: ReactNode;
}

const enter = { opacity: 0, y: -4 };
const visible = { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.out } };
const leave = { opacity: 0, transition: { duration: durations.exit, ease: easings.in } };

/** A list item that animates in/out and can be dragged to reorder or re-home its todo. */
export function SortableTodoItem({
  todo,
  index,
  group,
  type,
  data,
  actions,
  children,
}: SortableTodoItemProps) {
  const { ref, isDragging } = useSortableItem({
    id: todo.id,
    index,
    group: group ?? "static",
    type,
    accept: type,
    disabled: group === null,
    data: { ...data },
    onDragEnd: (info) => {
      // Dropped on a calendar day: that becomes the due date.
      const date = droppedDate(info);
      if (date !== null) {
        if (todo.due_date !== date) actions.setDue(todo, date);
        return;
      }
      const move = resolveTodoDrop(todo.id, info);
      if (move) actions.move(todo, move.target, move.before_id, move.after_id);
    },
  });

  return (
    <motion.li
      ref={ref}
      // dnd-kit animates sorting itself; Motion's layout springs would fight it mid-drag.
      layout={isDragging ? false : "position"}
      initial={enter}
      animate={visible}
      exit={leave}
      transition={springs.layout}
      className={cx(
        "touch-manipulation",
        isDragging && "relative z-10 rounded-md bg-surface shadow-md",
      )}
    >
      {children}
    </motion.li>
  );
}

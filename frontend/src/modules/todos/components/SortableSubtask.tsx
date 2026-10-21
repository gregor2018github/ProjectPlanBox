import { GripVertical } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { cx } from "../../../ui/cx";
import { useSortableItem } from "../../../ui/dnd";
import { resolveTodoDrop } from "../dropRules";
import type { Todo } from "../types";
import type { TodoActions } from "../useTodoActions";

/** Props for {@link SortableSubtask}. */
export interface SortableSubtaskProps {
  subtask: Todo;
  index: number;
  /** Ids of the parent's subtasks, in the order shown. */
  siblingIds: readonly string[];
  actions: TodoActions;
  children: ReactNode;
}

/**
 * A subtask row in the detail panel that can be dragged by its grip (or
 * moved with Alt+↑/↓) to reorder it among its parent's subtasks.
 */
export function SortableSubtask({
  subtask,
  index,
  siblingIds,
  actions,
  children,
}: SortableSubtaskProps) {
  const parentId = subtask.parent_id ?? "";
  const { ref, handleRef, isDragging } = useSortableItem({
    // Prefixed: the same subtask can be a sortable row in the list view too.
    id: `detail:${subtask.id}`,
    index,
    group: `detail-subtasks:${parentId}`,
    // Only this parent's subtasks take part; nothing else accepts the drop.
    type: `detail-subtask:${parentId}`,
    accept: `detail-subtask:${parentId}`,
    data: {
      kind: "todo-row",
      placement: {
        list_id: subtask.list_id,
        section_id: subtask.section_id,
        parent_id: subtask.parent_id,
      },
      ids: siblingIds,
    },
    onDragEnd: (info) => {
      const move = resolveTodoDrop(subtask.id, info);
      if (move) actions.move(subtask, move.target, move.before_id, move.after_id);
    },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    actions.shift(subtask, event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      ref={ref}
      onKeyDown={onKeyDown}
      className={cx(
        "group relative flex items-center gap-3 rounded-md px-1 py-1 hover:bg-hover",
        isDragging && "z-10 bg-surface shadow-md",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        tabIndex={-1}
        aria-label={`Drag to reorder “${subtask.title}”`}
        className="absolute top-1/2 -left-4 inline-flex h-6 w-4 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-sm text-text-subtle opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 coarse:static coarse:size-11 coarse:shrink-0 coarse:translate-y-0 coarse:opacity-100"
      >
        <GripVertical size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {children}
    </li>
  );
}

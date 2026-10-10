import { ChevronRight, CornerDownRight, FileText, Flag, ListChecks, Repeat } from "lucide-react";

import { formatRelativeDay, type IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import type { Todo } from "../types";
import type { TodoLookup } from "../useTodoData";

/** Props for {@link TodoMeta}. */
export interface TodoMetaProps {
  todo: Todo;
  today: IsoDate | null;
  lookup: TodoLookup;
  showPlace?: boolean | undefined;
  hideDue?: boolean | undefined;
  /** Shows the parent's title (views that list subtasks on their own). */
  showParent?: boolean | undefined;
  /** Subtask progress; clicking it expands the subtasks. */
  progress?: { done: number; total: number; expanded: boolean; onToggle: () => void } | null;
}

/** The small, muted facts after a todo's title. */
export function TodoMeta({
  todo,
  today,
  lookup,
  showPlace,
  hideDue,
  showParent,
  progress,
}: TodoMetaProps) {
  const overdue =
    today !== null && todo.due_date !== null && todo.due_date < today && todo.completed_at === null;
  const parentTitle = showParent === true ? lookup.todoTitle(todo.parent_id) : null;
  const section = lookup.sectionName(todo.section_id);

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-text-muted tabular-nums">
      {progress && (
        <button
          type="button"
          aria-expanded={progress.expanded}
          aria-label={`${progress.expanded ? "Hide" : "Show"} ${progress.total} subtasks`}
          onClick={(event) => {
            event.stopPropagation();
            progress.onToggle();
          }}
          className="inline-flex items-center gap-1 rounded-sm hover:text-text coarse:min-h-11"
        >
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className={cx(
              "transition-transform duration-(--duration-fast) ease-out",
              progress.expanded && "rotate-90",
            )}
          />
          <ListChecks size={14} strokeWidth={1.75} aria-hidden />
          {progress.done}/{progress.total}
        </button>
      )}
      {hideDue !== true && todo.due_date !== null && today !== null && (
        <span className={cx(overdue && "text-danger")}>
          {formatRelativeDay(todo.due_date, today)}
        </span>
      )}
      {todo.rrule !== null && <Repeat size={14} strokeWidth={1.75} aria-label="Repeats" />}
      {todo.priority > 0 && (
        <span
          className={cx(
            "inline-flex items-center",
            todo.priority === 3 && "text-danger",
            todo.priority === 2 && "text-warning",
          )}
          aria-label={`Priority ${["", "low", "medium", "high"][todo.priority] ?? ""}`}
        >
          <Flag size={14} strokeWidth={1.75} aria-hidden fill="currentColor" />
        </span>
      )}
      {todo.notes.trim() !== "" && <FileText size={14} strokeWidth={1.75} aria-label="Has notes" />}
      {todo.tag_ids.map((id) => (
        <span key={id}>@{lookup.tagName(id)}</span>
      ))}
      {parentTitle !== null && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <CornerDownRight size={14} strokeWidth={1.75} aria-hidden />
          <span className="truncate">{parentTitle}</span>
        </span>
      )}
      {showPlace === true && (
        <span className="truncate">
          {lookup.listName(todo.list_id)}
          {section !== null && ` / ${section}`}
        </span>
      )}
    </span>
  );
}

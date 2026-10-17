import { CornerDownRight, Flag, MoreHorizontal, Repeat } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { formatRelativeDay, type IsoDate } from "../../../core/time";
import { Checkbox } from "../../../ui/Checkbox";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import type { MenuEntry } from "../../../ui/menuTypes";
import { TintDot } from "../../../ui/TintDot";
import { isOwnControl } from "../rowClick";
import { todoMenuEntries } from "../todoMenu";
import type { Todo } from "../types";
import { useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoLookup } from "../useTodoData";

/** Props for {@link RankRow}. */
export interface RankRowProps {
  todo: Todo;
  actions: TodoActions;
  lookup: TodoLookup;
  today: IsoDate | null;
  /** Its place in "My order" (1-based), or null while unsorted. */
  rank: number | null;
  /** Ranking actions, listed in the menus before the usual ones. */
  rankEntries: MenuEntry[];
  /** A control before the ⋯ menu (e.g. "Add to my order"). */
  trailing?: ReactNode;
}

/**
 * One todo in "My order", always two lines so every row looks alike: the
 * title (a subtask as "Subtask ↳ Parent", since it can be ranked away from
 * its parent), then where it lives and its date and flags. Long text is cut
 * off rather than wrapped. Clicking the row opens the detail panel.
 */
export function RankRow({
  todo,
  actions,
  lookup,
  today,
  rank,
  rankEntries,
  trailing,
}: RankRowProps) {
  const selected = useTodoUi((s) => s.selectedId === todo.id);
  const ref = useRef<HTMLDivElement>(null);
  const done = todo.completed_at !== null;
  const entries = [
    ...rankEntries,
    { kind: "separator" as const, id: "rank" },
    ...todoMenuEntries(todo, actions),
  ];
  const parentTitle = lookup.todoTitle(todo.parent_id);
  const hue = lookup.listHue(todo.list_id);
  const section = lookup.sectionName(todo.section_id);
  const overdue = today !== null && todo.due_date !== null && todo.due_date < today && !done;

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <ContextMenu entries={entries} longPress={false}>
      <div
        ref={ref}
        data-todo-id={todo.id}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => {
          if (isOwnControl(event.target, event.currentTarget)) return;
          actions.open(todo);
        }}
        className={cx(
          "group flex items-center gap-3 rounded-md px-3 py-1.5 transition-colors duration-(--duration-fast) ease-out",
          selected ? "bg-selected" : "hover:bg-hover",
        )}
      >
        {rank !== null && (
          <span className="w-6 shrink-0 text-right text-sm text-text-muted tabular-nums">
            {rank}
          </span>
        )}
        <Checkbox
          checked={done}
          onCheckedChange={() => {
            actions.toggleComplete(todo);
          }}
          label={`${done ? "Reopen" : "Complete"} “${todo.title}”`}
          tone={todo.priority === 3 ? "danger" : todo.priority === 2 ? "warning" : "default"}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cx("min-w-0 truncate", done && "text-text-muted line-through")}>
              {todo.title}
            </span>
            {parentTitle !== null && (
              <span className="inline-flex max-w-1/2 shrink-0 items-center gap-1 text-text-muted">
                <CornerDownRight size={14} strokeWidth={1.75} aria-label="Subtask of" />
                <span className="truncate">{parentTitle}</span>
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-3 text-sm text-text-muted tabular-nums">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {hue !== null && <TintDot hue={hue} />}
              <span className="truncate">
                {lookup.listName(todo.list_id)}
                {section !== null && ` / ${section}`}
              </span>
            </span>
            {todo.due_date !== null && today !== null && (
              <span className={cx("shrink-0", overdue && "text-danger")}>
                {formatRelativeDay(todo.due_date, today)}
              </span>
            )}
            {todo.rrule !== null && (
              <Repeat size={14} strokeWidth={1.75} aria-label="Repeats" className="shrink-0" />
            )}
            {todo.priority > 0 && (
              <span
                className={cx(
                  "inline-flex shrink-0 items-center",
                  todo.priority === 3 && "text-danger",
                  todo.priority === 2 && "text-warning",
                )}
                aria-label={`Priority ${["", "low", "medium", "high"][todo.priority] ?? ""}`}
              >
                <Flag size={14} strokeWidth={1.75} aria-hidden fill="currentColor" />
              </span>
            )}
          </span>
        </span>
        {trailing}
        <Menu
          entries={entries}
          trigger={
            <button
              type="button"
              aria-label={`Actions for “${todo.title}”`}
              className={cx(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 coarse:size-11 coarse:opacity-100",
                selected ? "opacity-100" : "opacity-0",
              )}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
            </button>
          }
        />
      </div>
    </ContextMenu>
  );
}

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";

import type { IsoDate } from "../../../core/time";
import { Checkbox } from "../../../ui/Checkbox";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { todoMenuEntries } from "../todoMenu";
import type { Todo } from "../types";
import { todoUi, useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoLookup } from "../useTodoData";
import { TodoMeta } from "./TodoMeta";

/** Props for {@link TodoRow}. */
export interface TodoRowProps {
  todo: Todo;
  actions: TodoActions;
  lookup: TodoLookup;
  today: IsoDate | null;
  showPlace?: boolean | undefined;
  hideDue?: boolean | undefined;
  showParent?: boolean | undefined;
  /** Subtask progress of a parent row (null when it has none). */
  progress?: { done: number; total: number } | null;
}

/**
 * One todo: checkbox, title, metadata and a ⋯ menu. Clicking the row opens
 * it in the detail panel (clicks on its own controls don't); every action is
 * also in the context menu.
 */
export function TodoRow({
  todo,
  actions,
  lookup,
  today,
  showPlace,
  hideDue,
  showParent,
  progress,
}: TodoRowProps) {
  const selected = useTodoUi((s) => s.selectedId === todo.id);
  const expanded = useTodoUi((s) => s.expanded.has(todo.id));
  const ref = useRef<HTMLDivElement>(null);
  const done = todo.completed_at !== null;
  const entries = todoMenuEntries(todo, actions);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <ContextMenu entries={entries}>
      <div
        ref={ref}
        data-todo-id={todo.id}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => {
          if (isOwnControl(event.target, event.currentTarget)) return;
          actions.open(todo);
        }}
        className={cx(
          "group flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-(--duration-fast) ease-out",
          selected ? "bg-selected" : "hover:bg-hover",
        )}
      >
        <span className="flex h-5.5 items-center">
          <Checkbox
            checked={done}
            onCheckedChange={() => {
              actions.toggleComplete(todo);
            }}
            label={`${done ? "Reopen" : "Complete"} “${todo.title}”`}
            tone={todo.priority === 3 ? "danger" : todo.priority === 2 ? "warning" : "default"}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
          <span className={cx("min-w-0 break-words", done && "text-text-muted line-through")}>
            {todo.title}
          </span>
          <TodoMeta
            todo={todo}
            today={today}
            lookup={lookup}
            showPlace={showPlace}
            hideDue={hideDue}
            showParent={showParent}
            progress={
              progress && progress.total > 0
                ? {
                    ...progress,
                    expanded,
                    onToggle: () => {
                      todoUi.toggleExpanded(todo.id);
                    },
                  }
                : null
            }
          />
        </span>
        <Menu
          entries={entries}
          trigger={
            <button
              type="button"
              aria-label={`Actions for “${todo.title}”`}
              className={cx(
                "-my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 coarse:size-11 coarse:opacity-100",
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

/**
 * True when a click belongs to something other than the row itself: one of
 * its controls (checkbox, ⋯ menu, subtask toggle) or a portalled menu, whose
 * React events still bubble up here.
 */
function isOwnControl(target: EventTarget, row: HTMLElement): boolean {
  if (!(target instanceof Node) || !row.contains(target)) return true;
  const element = target instanceof Element ? target : target.parentElement;
  const control = element ? element.closest("button, a, input, [role='checkbox']") : null;
  return control !== null && control !== row;
}

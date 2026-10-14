import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";

import type { IsoDate } from "../../../core/time";
import { Checkbox } from "../../../ui/Checkbox";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { TintDot } from "../../../ui/TintDot";
import { todoMenuEntries } from "../todoMenu";
import type { Todo } from "../types";
import { todoUi, useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoLookup } from "../useTodoData";
import { isOwnControl } from "../rowClick";
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
  /**
   * Gives tags a column of their own, so they start at the same x on every
   * row of the list. The list turns it on when any of its rows has tags.
   */
  tagColumn?: boolean | undefined;
  /** Subtask progress of a parent row (null when it has none). */
  progress?: { done: number; total: number } | null;
}

/**
 * One todo: checkbox, title with its facts, tags, place and a ⋯ menu. In a
 * wide list (container query on the list) tags and place are fixed-width
 * columns at the right edge, so they line up across rows; in a narrow one
 * they wrap onto a second line under the title. Clicking the row opens it in
 * the detail panel (clicks on its own controls don't); every action is also
 * in the context menu.
 */
export function TodoRow({
  todo,
  actions,
  lookup,
  today,
  showPlace,
  hideDue,
  showParent,
  tagColumn,
  progress,
}: TodoRowProps) {
  const selected = useTodoUi((s) => s.selectedId === todo.id);
  const expanded = useTodoUi((s) => s.expanded.has(todo.id));
  const ref = useRef<HTMLDivElement>(null);
  const done = todo.completed_at !== null;
  const entries = todoMenuEntries(todo, actions);
  const placeHue = showPlace === true ? lookup.listHue(todo.list_id) : null;
  const section = showPlace === true ? lookup.sectionName(todo.section_id) : null;

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
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 @2xl:flex-nowrap">
          <span className="flex min-w-0 basis-full flex-wrap items-baseline gap-x-3 gap-y-0.5 @2xl:flex-1 @2xl:basis-0">
            <span className={cx("min-w-0 break-words", done && "text-text-muted line-through")}>
              {todo.title}
            </span>
            <TodoMeta
              todo={todo}
              today={today}
              lookup={lookup}
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
          {tagColumn === true && (
            <span
              data-column="tags"
              className={cx(
                "min-w-0 flex-wrap gap-x-2 text-sm text-text-muted @2xl:w-40 @2xl:shrink-0",
                todo.tag_ids.length === 0 ? "hidden @2xl:flex" : "flex",
              )}
            >
              {todo.tag_ids.map((id) => (
                <span key={id} className="min-w-0 truncate">
                  @{lookup.tagName(id)}
                </span>
              ))}
            </span>
          )}
          {showPlace === true && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-text-muted @2xl:w-40 @2xl:shrink-0">
              {placeHue !== null && <TintDot hue={placeHue} />}
              <span className="truncate">
                {lookup.listName(todo.list_id)}
                {section !== null && ` / ${section}`}
              </span>
            </span>
          )}
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

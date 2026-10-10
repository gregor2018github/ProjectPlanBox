import { ChevronRight } from "lucide-react";

import { cx } from "../../../ui/cx";
import type { Todo } from "../types";
import { todoUi, useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { TodoGroup } from "./TodoGroup";

/** Props for {@link CompletedGroup}. */
export interface CompletedGroupProps {
  /** Stable key of the view, so its open state survives navigating away. */
  view: string;
  todos: readonly Todo[];
  data: TodoData;
  actions: TodoActions;
  showPlace?: boolean;
}

/**
 * "Completed today" at the bottom of a view, struck through. Collapsed until
 * opened; the choice is remembered per view for the rest of the session.
 */
export function CompletedGroup({ view, todos, data, actions, showPlace }: CompletedGroupProps) {
  const open = useTodoUi((s) => s.openCompleted.has(view));
  if (todos.length === 0) return null;
  return (
    <section className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          todoUi.toggleCompleted(view);
        }}
        className="mb-1 inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium text-text-muted hover:bg-hover coarse:h-11"
      >
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className={cx(
            "transition-transform duration-(--duration-fast) ease-out",
            open && "rotate-90",
          )}
        />
        Completed today · {todos.length}
      </button>
      {open && (
        <TodoGroup
          todos={todos}
          data={data}
          actions={actions}
          label="Completed today"
          {...(showPlace !== undefined && { showPlace })}
          expandable={false}
        />
      )}
    </section>
  );
}

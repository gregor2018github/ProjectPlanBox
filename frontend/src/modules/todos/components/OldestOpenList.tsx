import { useNavigate } from "@tanstack/react-router";

import { plural } from "../../../core/insights/format";
import type { TodoStats } from "../types";
import { todoItemRef } from "../useTodoActions";

/** Props for {@link OldestOpenList}. */
export interface OldestOpenListProps {
  todos: TodoStats["oldest_open"];
}

/** The open todos that have waited longest; each opens in the detail panel. */
export function OldestOpenList({ todos }: OldestOpenListProps) {
  const navigate = useNavigate();
  if (todos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-medium text-text-muted">Waiting longest</h4>
      <ol className="flex flex-col">
        {todos.map((todo) => (
          <li key={todo.id}>
            <button
              type="button"
              onClick={() => {
                void navigate({
                  to: ".",
                  search: (prev: Record<string, unknown>) => ({
                    ...prev,
                    item: todoItemRef(todo.id),
                  }),
                });
              }}
              className="flex min-h-8 w-full items-baseline gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-hover coarse:min-h-11"
            >
              <span className="min-w-0 flex-1 truncate">{todo.title}</span>
              <span className="shrink-0 text-text-muted">
                {todo.place} · {plural(todo.age_days, "day")}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

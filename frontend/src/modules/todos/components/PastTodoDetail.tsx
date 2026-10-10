import { format, parseISO } from "date-fns";
import { RotateCcw } from "lucide-react";

import { useMeta } from "../../../core/api/coreQueries";
import { LinkedItems } from "../../../core/links/LinkedItems";
import { zonedParts } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { useTodo } from "../queries";
import { todoItemRef, useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";

/** Props for {@link PastTodoDetail}. */
export interface PastTodoDetailProps {
  id: string;
}

/**
 * The detail panel for a todo outside the main cache, i.e. completed before
 * today (search hits and links can point there). Read-only apart from
 * Reopen, which brings it back into the cache and the full panel.
 */
export function PastTodoDetail({ id }: PastTodoDetailProps) {
  const { data: todo, isPending } = useTodo(id, true);
  const { data: meta } = useMeta();
  const data = useTodoData();
  const actions = useTodoActions();

  if (isPending) return null;
  if (todo === undefined) {
    return <p className="pt-4 text-base text-text-muted">This todo is not here anymore.</p>;
  }

  const completed =
    todo.completed_at === null || meta === undefined
      ? null
      : format(parseISO(zonedParts(todo.completed_at, meta.timezone).date), "d MMM yyyy");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-muted line-through">{todo.title}</h1>
        <p className="text-sm text-text-muted">
          {completed !== null && `Completed ${completed} · `}
          {data.lookup.listName(todo.list_id)}
        </p>
      </div>
      {todo.completed_at !== null && (
        <div>
          <Button
            onClick={() => {
              actions.toggleComplete(todo);
            }}
          >
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            Reopen
          </Button>
        </div>
      )}
      {todo.notes !== "" && <p className="text-base whitespace-pre-wrap text-text">{todo.notes}</p>}
      <LinkedItems entity={todoItemRef(todo.id)} title={todo.title} />
    </div>
  );
}

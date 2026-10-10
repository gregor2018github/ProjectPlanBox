import { CheckSquare } from "lucide-react";
import { useMemo } from "react";

import { useLinkableSource } from "../../core/links/linkablesContext";
import { todoItemRef } from "./useTodoActions";
import type { TodoData } from "./useTodoData";

/** Offers the cached todos (open, and completed today) to the link picker. */
export function useTodoLinkables(data: TodoData): void {
  const source = useMemo(
    () => ({
      entityType: "todos.todo",
      noun: "Todo",
      icon: CheckSquare,
      items: data.todos.map((t) => ({
        ref: todoItemRef(t.id),
        title: t.title,
        hint: `Todo · ${data.lookup.listName(t.list_id)}`,
      })),
    }),
    [data],
  );
  useLinkableSource(source);
}

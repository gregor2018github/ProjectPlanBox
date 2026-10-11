import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { todoUi } from "./uiStore";
import { todoItemRef } from "./useTodoActions";

/**
 * Clears the todo selection when the detail panel stops showing the selected
 * todo (closed with ×, ], a click on empty space, or another item opened).
 * A selection made with the keyboard alone, without the panel, is left as is.
 */
export function useSelectionFollowsDetail(): void {
  const item = useRouterState({ select: (s) => itemOf(s.location.search) });
  const previous = useRef(item);
  useEffect(() => {
    const was = previous.current;
    previous.current = item;
    if (was === item) return;
    const { selectedId } = todoUi.get();
    if (selectedId !== null && was === todoItemRef(selectedId)) todoUi.select(null);
  }, [item]);
}

function itemOf(search: unknown): string | undefined {
  if (typeof search !== "object" || search === null || !("item" in search)) return undefined;
  return typeof search.item === "string" ? search.item : undefined;
}

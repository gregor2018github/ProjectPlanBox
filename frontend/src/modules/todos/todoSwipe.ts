import { SkipForward, Sun, SunDim, Trash2 } from "lucide-react";

import type { IsoDate } from "../../core/time";
import type { SwipeAction } from "../../ui/SwipeRow";
import { inToday } from "./selectors";
import type { Todo } from "./types";
import type { TodoActions } from "./useTodoActions";

/**
 * What swiping a todo row does on touch (owner request, 2026-10-17): to the
 * right it goes into Today, or out of it ({@link TodoActions.toggleToday});
 * to the left it is deleted, after the usual confirmation. A done todo only
 * deletes.
 */
export function todoSwipeActions(
  todo: Todo,
  actions: TodoActions,
  today: IsoDate | null,
): { swipeRight: SwipeAction | null; swipeLeft: SwipeAction } {
  const swipeLeft: SwipeAction = {
    label: "Delete",
    icon: Trash2,
    tone: "danger",
    onSwipe: () => {
      actions.remove(todo);
    },
  };
  if (today === null || todo.completed_at !== null) return { swipeRight: null, swipeLeft };
  const toggle = () => {
    actions.toggleToday(todo);
  };
  if (!inToday(todo, today)) {
    return {
      swipeRight: { label: "Add to Today", icon: Sun, tone: "accent", onSwipe: toggle },
      swipeLeft,
    };
  }
  return {
    swipeRight:
      todo.rrule === null
        ? { label: "Remove from Today", icon: SunDim, tone: "accent", onSwipe: toggle }
        : { label: "Skip this one", icon: SkipForward, tone: "accent", onSwipe: toggle },
    swipeLeft,
  };
}

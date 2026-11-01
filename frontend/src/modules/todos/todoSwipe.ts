import { ClipboardPlus, Trash2 } from "lucide-react";

import type { IsoDate } from "../../core/time";
import type { SwipeAction } from "../../ui/SwipeRow";
import { inPlan } from "./selectors";
import type { Todo } from "./types";
import type { TodoActions } from "./useTodoActions";

/**
 * What swiping a todo row does on touch (owner request, 2026-10-17; the
 * right swipe changed 2026-11-01): to the right it goes into the DayPlan
 * ({@link TodoActions.togglePlan}); to the left it is deleted, after the
 * usual confirmation. A done todo, or one already in the DayPlan, only
 * deletes, so rows in the DayPlan itself cannot be swiped to the right.
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
  if (today === null || todo.completed_at !== null || inPlan(todo, today)) {
    return { swipeRight: null, swipeLeft };
  }
  return {
    swipeRight: {
      label: "Add to DayPlan",
      icon: ClipboardPlus,
      tone: "accent",
      onSwipe: () => {
        actions.togglePlan(todo);
      },
    },
    swipeLeft,
  };
}

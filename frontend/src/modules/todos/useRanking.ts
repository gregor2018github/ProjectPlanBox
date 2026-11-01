/**
 * Changes to a "My order" ranking (All todos' or Today's) or to the day
 * plan, which is ordered the same way. Each one is
 * computed over the whole ranking (every open ranked todo, whatever the tag
 * filter hides), so reordering what is on screen never scrambles what is not.
 */
import { useMemo } from "react";

import { inPlan, placeInRanking, planIds, rankedIds } from "./selectors";
import { RANK_KEY, type RankScope, type Todo } from "./types";
import type { TodoActions } from "./useTodoActions";
import type { TodoData } from "./useTodoData";

/** Drag type shared by "My order" rows and the places they can be dropped. */
export const RANK_DRAG = "rank";

/** What {@link useRanking} and {@link useDayPlan} offer. */
export interface Ranking {
  /** Whether a todo has a place in this ranking (else it is unsorted, or a proposal). */
  isRanked(todo: Todo): boolean;
  /** Puts a todo right before `beforeId`, else right after `afterId`, else last. */
  place(id: string, beforeId: string | null, afterId: string | null): void;
  /** Puts a todo first. */
  toTop(id: string): void;
  /** Takes a todo out of the ranking, back to "Unsorted". */
  unrank(id: string): void;
  /** Adds todos at the end, in the given order. */
  append(ids: readonly string[]): void;
}

/** "My order" changes, each one undoable. */
export function useRanking(
  data: TodoData,
  actions: TodoActions,
  scope: RankScope = "all",
): Ranking {
  return useMemo(() => {
    const full = rankedIds(data.allTodos, scope, data.today);
    const reorder = (ids: string[], unranked: string[]) => {
      actions.reorderRanked(ids, unranked, full, scope);
    };
    const place = (id: string, beforeId: string | null, afterId: string | null) => {
      const next = placeInRanking(full, id, beforeId, afterId);
      if (next.join() !== full.join()) reorder(next, []);
    };
    return {
      isRanked: (todo) => todo[RANK_KEY[scope]] !== null,
      place,
      toTop(id) {
        place(id, full.find((x) => x !== id) ?? null, null);
      },
      unrank(id) {
        reorder([], [id]);
      },
      append(ids) {
        const added = ids.filter((id) => !full.includes(id));
        if (added.length > 0) reorder([...full, ...added], []);
      },
    };
  }, [data.allTodos, data.today, actions, scope]);
}

/** Day plan changes, each one undoable; "unranking" takes a todo out of the plan. */
export function useDayPlan(data: TodoData, actions: TodoActions): Ranking {
  return useMemo(() => {
    const today = data.today;
    const full = planIds(data.allTodos, today);
    const place = (id: string, beforeId: string | null, afterId: string | null) => {
      const next = placeInRanking(full, id, beforeId, afterId);
      if (next.join() !== full.join()) actions.reorderPlan(next, [], full);
    };
    return {
      isRanked: (todo) => inPlan(todo, today),
      place,
      toTop(id) {
        place(id, full.find((x) => x !== id) ?? null, null);
      },
      unrank(id) {
        actions.reorderPlan([], [id], full);
      },
      append(ids) {
        const added = ids.filter((id) => !full.includes(id));
        if (added.length > 0) actions.reorderPlan([...full, ...added], [], full);
      },
    };
  }, [data.allTodos, data.today, actions]);
}

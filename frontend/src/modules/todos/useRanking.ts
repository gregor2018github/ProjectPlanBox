/**
 * Changes to a "My order" ranking (All todos' or Today's). Each one is
 * computed over the whole ranking (every open ranked todo, whatever the tag
 * filter hides), so reordering what is on screen never scrambles what is not.
 */
import { useMemo } from "react";

import { placeInRanking, rankedIds } from "./selectors";
import { RANK_KEY, type RankScope, type Todo } from "./types";
import type { TodoActions } from "./useTodoActions";
import type { TodoData } from "./useTodoData";

/** Drag type shared by "My order" rows and the places they can be dropped. */
export const RANK_DRAG = "rank";

/** What {@link useRanking} offers. */
export interface Ranking {
  /** Which ranking this is. */
  scope: RankScope;
  /** Whether a todo has a place in this ranking (else it is unsorted). */
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
      scope,
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

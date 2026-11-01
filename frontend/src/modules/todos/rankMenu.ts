import { ArrowDownToLine, ArrowUpToLine, ListPlus, Undo2 } from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import type { Todo } from "./types";
import type { Ranking } from "./useRanking";

/** Moves within a ranking: to the top or the bottom. */
function moveEntries(todo: Todo, ranking: Ranking): MenuEntry[] {
  return [
    {
      id: "rank-top",
      label: "Move to top",
      icon: ArrowUpToLine,
      onSelect: () => {
        ranking.toTop(todo.id);
      },
    },
    {
      id: "rank-bottom",
      label: "Move to bottom",
      icon: ArrowDownToLine,
      onSelect: () => {
        ranking.place(todo.id, null, null);
      },
    },
  ];
}

/**
 * The day plan's own actions for a planned todo (adding and removing are in
 * every todo's menu).
 */
export function planMenuEntries(todo: Todo, plan: Ranking): MenuEntry[] {
  return plan.isRanked(todo) ? moveEntries(todo, plan) : [];
}

/** The "My order" actions for a todo: for ranked ones moves, for unsorted ones adding it. */
export function rankMenuEntries(todo: Todo, ranking: Ranking): MenuEntry[] {
  if (!ranking.isRanked(todo)) {
    return [
      {
        id: "rank-add",
        label: "Add to my order",
        icon: ListPlus,
        onSelect: () => {
          ranking.append([todo.id]);
        },
      },
    ];
  }
  return [
    ...moveEntries(todo, ranking),
    {
      id: "rank-out",
      label: "Back to unsorted",
      icon: Undo2,
      onSelect: () => {
        ranking.unrank(todo.id);
      },
    },
  ];
}

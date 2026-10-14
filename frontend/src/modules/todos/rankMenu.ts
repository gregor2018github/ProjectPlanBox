import { ArrowDownToLine, ArrowUpToLine, ListPlus, Undo2 } from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import type { Todo } from "./types";
import type { Ranking } from "./useRanking";

/** The "My order" actions for a todo: for ranked ones moves, for unsorted ones adding it. */
export function rankMenuEntries(todo: Todo, ranking: Ranking): MenuEntry[] {
  if (todo.rank_position === null) {
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

/**
 * How "All todos" is ordered: by place (the sidebar's order) or by the
 * owner's own ranking. Remembered per browser, like the rail pane.
 */
import { useState } from "react";

import { readStorage, writeStorage } from "../../core/storage";

/** The two orders of "All todos". */
export type AllTodosMode = "place" | "ranked";

const KEY = "planbox.todos.allMode";

/** The current mode and a setter that remembers it. */
export function useAllTodosMode(): [AllTodosMode, (mode: AllTodosMode) => void] {
  const [mode, setMode] = useState<AllTodosMode>(() =>
    readStorage(KEY) === "ranked" ? "ranked" : "place",
  );
  return [
    mode,
    (next) => {
      setMode(next);
      writeStorage(KEY, next);
    },
  ];
}

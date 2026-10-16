/**
 * How "All todos" and Today are ordered: their usual order (by place, by
 * date) or the owner's own ranking. Remembered per browser, like the rail
 * pane.
 */
import { useState } from "react";

import { readStorage, writeStorage } from "../../core/storage";

/** The two orders of "All todos". */
export type AllTodosMode = "place" | "ranked";

/** The two orders of Today. */
export type TodayMode = "date" | "ranked";

/** A mode stored under `key`: "ranked", or `fallback` when nothing (else) is stored. */
function useStoredMode<M extends string>(
  key: string,
  fallback: M,
): [M | "ranked", (mode: M | "ranked") => void] {
  const [mode, setMode] = useState<M | "ranked">(() =>
    readStorage(key) === "ranked" ? "ranked" : fallback,
  );
  return [
    mode,
    (next) => {
      setMode(next);
      writeStorage(key, next);
    },
  ];
}

/** The current mode of "All todos" and a setter that remembers it. */
export function useAllTodosMode(): [AllTodosMode, (mode: AllTodosMode) => void] {
  return useStoredMode<AllTodosMode>("planbox.todos.allMode", "place");
}

/** The current mode of Today and a setter that remembers it. */
export function useTodayMode(): [TodayMode, (mode: TodayMode) => void] {
  return useStoredMode<TodayMode>("planbox.todos.todayMode", "date");
}

/**
 * How "All todos" and Today are ordered: their usual order (by place, by
 * date) or the owner's own ranking; and what the Logbook shows. Remembered
 * per browser, like the rail pane.
 */
import { useState } from "react";

import { readStorage, writeStorage } from "../../core/storage";
import type { ActivityStatus } from "./types";

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

/** The Logbook's two views: what was completed, or what was added or changed. */
export type LogbookMode = "completed" | "activity";

/** A choice stored under `key`: one of `choices`, or the first when nothing valid is stored. */
function useStoredChoice<M extends string>(
  key: string,
  choices: readonly [M, ...M[]],
): [M, (choice: M) => void] {
  const [choice, setChoice] = useState<M>(() => {
    const stored = readStorage(key);
    return choices.find((c) => c === stored) ?? choices[0];
  });
  return [
    choice,
    (next) => {
      setChoice(next);
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

/** The Logbook's current view and a setter that remembers it. */
export function useLogbookMode(): [LogbookMode, (mode: LogbookMode) => void] {
  return useStoredChoice<LogbookMode>("planbox.todos.logbookMode", ["completed", "activity"]);
}

/** Which todos the Logbook's activity feed shows, and a setter that remembers it. */
export function useActivityStatus(): [ActivityStatus, (status: ActivityStatus) => void] {
  return useStoredChoice<ActivityStatus>("planbox.todos.activityStatus", [
    "all",
    "open",
    "completed",
  ]);
}

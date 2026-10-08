/**
 * Small UI state shared between the views, the detail panel and the module
 * Host (which are not ancestors of each other): the selected todo, which
 * parents show their subtasks, todos lingering after completion, and a
 * picker the detail panel should open.
 */
import { useSyncExternalStore } from "react";

/** A picker the detail panel opens on arrival (from the D or V shortcuts). */
export type PendingPicker = "due" | "place" | null;

interface State {
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  /** Todos completed moments ago that stay in place briefly (motion rule 4). */
  lingering: ReadonlySet<string>;
  pendingPicker: PendingPicker;
}

/** How long a completed todo stays in its open list before moving away. */
export const LINGER_MS = 600;

let state: State = {
  selectedId: null,
  expanded: new Set(),
  lingering: new Set(),
  pendingPicker: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Imperative access for event handlers and tests. */
export const todoUi = {
  get: (): State => state,
  select(id: string | null): void {
    if (state.selectedId !== id) set({ selectedId: id });
  },
  toggleExpanded(id: string, open?: boolean): void {
    const next = new Set(state.expanded);
    const shouldOpen = open ?? !next.has(id);
    if (shouldOpen) next.add(id);
    else next.delete(id);
    set({ expanded: next });
  },
  linger(id: string): void {
    set({ lingering: new Set(state.lingering).add(id) });
    window.setTimeout(() => {
      const next = new Set(state.lingering);
      next.delete(id);
      set({ lingering: next });
    }, LINGER_MS);
  },
  requestPicker(picker: PendingPicker): void {
    set({ pendingPicker: picker });
  },
  reset(): void {
    set({ selectedId: null, expanded: new Set(), lingering: new Set(), pendingPicker: null });
  },
};

/** Subscribes to one slice of the todo UI state. */
export function useTodoUi<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

/**
 * UI state shared by the pane, the page and the module Host (which are not
 * ancestors of each other): the open event dialog and a pending
 * "which events?" question for recurring series.
 */
import { useSyncExternalStore } from "react";

import type { EventDraft } from "./draft";
import type { EventItem, Scope } from "./types";

/** What the event dialog shows: a new event, or one occurrence being edited. */
export type EditorState = { mode: "new"; draft: EventDraft } | { mode: "edit"; item: EventItem };

/** What a scope question is about. */
export interface ScopeQuestion {
  action: "change" | "delete";
  /** False when "only this event" makes no sense (e.g. a changed repeat rule). */
  allowThis: boolean;
  resolve: (scope: Scope | null) => void;
}

interface State {
  editor: EditorState | null;
  /** Increases with every opened dialog, so each one starts fresh. */
  editorSeq: number;
  question: ScopeQuestion | null;
}

let state: State = { editor: null, editorSeq: 0, question: null };
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
export const calendarUi = {
  get: (): State => state,
  openEditor(editor: EditorState): void {
    set({ editor, editorSeq: state.editorSeq + 1 });
  },
  closeEditor(): void {
    set({ editor: null });
  },
  /** Asks which events of a series an action applies to; null means cancelled. */
  askScope(action: ScopeQuestion["action"], allowThis = true): Promise<Scope | null> {
    state.question?.resolve(null);
    return new Promise((resolve) => {
      set({ question: { action, allowThis, resolve } });
    });
  },
  answerScope(scope: Scope | null): void {
    const question = state.question;
    set({ question: null });
    question?.resolve(scope);
  },
  reset(): void {
    state.question?.resolve(null);
    set({ editor: null, question: null });
  },
};

/** Subscribes to one slice of the calendar UI state. */
export function useCalendarUi<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

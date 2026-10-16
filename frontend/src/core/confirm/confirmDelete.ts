/**
 * Asking before a delete on touch screens. With a mouse and keyboard a
 * delete happens at once and Ctrl+Z (or the toast) undoes it; on a phone
 * undo is easy to miss, so a dialog asks first ({@link ConfirmDeleteDialog}).
 */
import { useSyncExternalStore } from "react";

/** What the dialog asks. */
export interface DeleteQuestion {
  /** e.g. "Delete todo?" */
  title: string;
  /** e.g. "“Buy milk” and its 2 subtasks will be deleted." */
  description: string;
}

/** A question waiting for an answer, with the delete it guards. */
export interface PendingDelete extends DeleteQuestion {
  run: () => void;
}

let pending: PendingDelete | null = null;
const listeners = new Set<() => void>();

function set(next: PendingDelete | null): void {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True on touch screens (the phone app, a phone's browser), where deletes are confirmed. */
export function confirmsDeletes(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Runs a delete: at once with a mouse, after a "Delete …?" dialog on a
 * touch screen. Cancelling does nothing.
 */
export function confirmDelete(question: DeleteQuestion, run: () => void): void {
  if (!confirmsDeletes()) {
    run();
    return;
  }
  set({ ...question, run });
}

/** Imperative access for the dialog and tests. */
export const deleteConfirmation = {
  get: (): PendingDelete | null => pending,
  /** Runs the waiting delete and closes the dialog. */
  accept(): void {
    const question = pending;
    set(null);
    question?.run();
  },
  /** Drops the waiting delete. */
  dismiss(): void {
    set(null);
  },
};

/** The delete waiting for an answer, if any. */
export function usePendingDelete(): PendingDelete | null {
  return useSyncExternalStore(subscribe, () => pending);
}

/**
 * Whether the "new entry" dialog is open, and with which kind. The dialog
 * lives in the module's Host; views and shortcuts open it through here.
 */
import { useSyncExternalStore } from "react";

import type { EntryKind } from "./types";

/** Null when closed. */
export type NewEntryRequest = { kind: EntryKind } | null;

let state: NewEntryRequest = null;
const listeners = new Set<() => void>();

function set(next: NewEntryRequest): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Opens and closes the new entry dialog. */
export const newEntryDialog = {
  open: (kind: EntryKind = "note"): void => {
    set({ kind });
  },
  close: (): void => {
    set(null);
  },
  get: (): NewEntryRequest => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The current request (re-renders when it changes). */
export function useNewEntryRequest(): NewEntryRequest {
  return useSyncExternalStore(newEntryDialog.subscribe, newEntryDialog.get);
}

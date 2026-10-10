/**
 * Whether the "new habit" dialog is open. The dialog lives in the module's
 * Host; the page, the pane and the palette open it through here.
 */
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  open = next;
  for (const listener of listeners) listener();
}

/** Opens and closes the new habit dialog. */
export const newHabitDialog = {
  open: (): void => {
    set(true);
  },
  close: (): void => {
    set(false);
  },
  get: (): boolean => open,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Whether the dialog is open (re-renders when it changes). */
export function useNewHabitOpen(): boolean {
  return useSyncExternalStore(newHabitDialog.subscribe, newHabitDialog.get);
}

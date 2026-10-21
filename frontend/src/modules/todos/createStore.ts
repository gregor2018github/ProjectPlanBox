/**
 * Which "create" dialog the module's Host should show. The dialogs live in
 * the Host; the sidebar, the views and the palette open them through here.
 */
import { useSyncExternalStore } from "react";

/** Null when no dialog is open. */
export type CreateRequest =
  | { kind: "todo" }
  | { kind: "subtask"; parentId: string }
  | { kind: "list"; areaId: string | null }
  | { kind: "area" }
  | null;

let state: CreateRequest = null;
const listeners = new Set<() => void>();

function set(next: CreateRequest): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Opens and closes the todos module's create dialogs. */
export const todoCreate = {
  /** Quick add, targeting the current view (the open list, Today's date, else Inbox). */
  todo: (): void => {
    set({ kind: "todo" });
  },
  /** Quick add of a subtask under the todo `parentId`. */
  subtask: (parentId: string): void => {
    set({ kind: "subtask", parentId });
  },
  /** A new list, inside `areaId` when given. */
  list: (areaId: string | null = null): void => {
    set({ kind: "list", areaId });
  },
  area: (): void => {
    set({ kind: "area" });
  },
  close: (): void => {
    set(null);
  },
  get: (): CreateRequest => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The current request (re-renders when it changes). */
export function useCreateRequest(): CreateRequest {
  return useSyncExternalStore(todoCreate.subscribe, todoCreate.get);
}

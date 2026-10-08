import { createContext, useContext } from "react";

import type { UndoEntry } from "./undoStack";

/** Records an undoable action: shows a toast with "Undo" and enables Ctrl+Z. */
export type PushUndo = (entry: UndoEntry) => void;

/** Provided by {@link UndoProvider}. */
export const UndoContext = createContext<PushUndo | null>(null);

/** Returns the function that records an undoable action. */
export function useUndo(): PushUndo {
  const push = useContext(UndoContext);
  if (push === null) throw new Error("useUndo needs an <UndoProvider>");
  return push;
}

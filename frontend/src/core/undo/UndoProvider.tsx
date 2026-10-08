import { useCallback, useState, type ReactNode } from "react";

import { useToast } from "../../ui/useToast";
import { useShortcut } from "../shortcuts/useShortcut";
import { UndoContext } from "./undoContext";
import { UndoStack, type UndoEntry } from "./undoStack";

/** Props for {@link UndoProvider}. */
export interface UndoProviderProps {
  children: ReactNode;
}

/**
 * Owns the undo stack. Each pushed action shows a toast with an Undo button
 * (unless silent); Ctrl+Z undoes the newest one. Must sit inside the toast and shortcut providers.
 */
export function UndoProvider({ children }: UndoProviderProps) {
  const [stack] = useState(() => new UndoStack());
  const { show } = useToast();

  const push = useCallback(
    (entry: UndoEntry) => {
      stack.push(entry);
      if (entry.silent === true) return;
      show({
        title: entry.label,
        action: {
          label: "Undo",
          onClick: () => {
            stack.remove(entry);
            entry.undo();
          },
        },
      });
    },
    [stack, show],
  );

  useShortcut({
    id: "core.undo",
    keys: "Ctrl+Z",
    description: "Undo the last delete, completion or move",
    group: "General",
    run: () => {
      stack.pop()?.undo();
    },
  });

  return <UndoContext value={push}>{children}</UndoContext>;
}

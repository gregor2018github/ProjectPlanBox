import { useEffect, useState, type ReactNode } from "react";

import { IS_DEVICE } from "../platform";
import { ShortcutRegistry } from "./registry";
import { ShortcutsContext } from "./shortcutsContext";

/** Props for {@link ShortcutsProvider}. */
export interface ShortcutsProviderProps {
  children: ReactNode;
}

/**
 * Owns the shortcut registry and listens for key presses on the window. The
 * phone app does not listen: it has no keyboard shortcuts.
 */
export function ShortcutsProvider({ children }: ShortcutsProviderProps) {
  const [registry] = useState(() => new ShortcutRegistry());

  useEffect(() => {
    if (IS_DEVICE) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (registry.handle(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registry]);

  return <ShortcutsContext value={registry}>{children}</ShortcutsContext>;
}

import { useEffect, useState, type ReactNode } from "react";

import { ShortcutRegistry } from "./registry";
import { ShortcutsContext } from "./shortcutsContext";

/** Props for {@link ShortcutsProvider}. */
export interface ShortcutsProviderProps {
  children: ReactNode;
}

/** Owns the shortcut registry and listens for key presses on the window. */
export function ShortcutsProvider({ children }: ShortcutsProviderProps) {
  const [registry] = useState(() => new ShortcutRegistry());

  useEffect(() => {
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

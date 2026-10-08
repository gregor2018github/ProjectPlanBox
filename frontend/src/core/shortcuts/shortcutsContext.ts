import { createContext, useContext } from "react";

import type { ShortcutRegistry } from "./registry";

/** The app-wide shortcut registry. */
export const ShortcutsContext = createContext<ShortcutRegistry | null>(null);

/** Returns the shortcut registry from context. */
export function useShortcutRegistry(): ShortcutRegistry {
  const registry = useContext(ShortcutsContext);
  if (registry === null) throw new Error("useShortcutRegistry needs a <ShortcutsProvider>");
  return registry;
}

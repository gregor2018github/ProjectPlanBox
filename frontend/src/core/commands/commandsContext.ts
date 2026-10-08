import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import type { Command, CommandRegistry } from "./registry";

/** The app-wide command registry. */
export const CommandsContext = createContext<CommandRegistry | null>(null);

/** Returns the command registry from context. */
export function useCommandRegistry(): CommandRegistry {
  const registry = useContext(CommandsContext);
  if (registry === null) throw new Error("useCommandRegistry needs a CommandsContext provider");
  return registry;
}

/**
 * Contributes commands to the palette while the caller is mounted.
 * Memoise the array (useMemo); a new array re-registers.
 */
export function useCommands(commands: readonly Command[]): void {
  const registry = useCommandRegistry();
  useEffect(() => registry.register(commands), [registry, commands]);
}

/** Returns every registered command and re-renders when they change. */
export function useCommandList(): Command[] {
  const registry = useCommandRegistry();
  return useSyncExternalStore(registry.subscribe, registry.list);
}

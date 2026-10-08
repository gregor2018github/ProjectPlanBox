import { useEffect, useRef, useSyncExternalStore } from "react";

import type { Shortcut } from "./registry";
import { useShortcutRegistry } from "./shortcutsContext";

/**
 * Registers a shortcut while the calling component is mounted. Pass `null`
 * to disable it. The latest `run` is always used without re-registering.
 */
export function useShortcut(shortcut: Shortcut | null): void {
  const registry = useShortcutRegistry();
  const runRef = useRef(shortcut?.run);

  useEffect(() => {
    runRef.current = shortcut?.run;
  });

  const id = shortcut?.id;
  const keys = shortcut?.keys;
  const description = shortcut?.description ?? "";
  const group = shortcut?.group ?? "General";
  const allowInInput = shortcut?.allowInInput ?? false;
  const hidden = shortcut?.hidden ?? false;

  useEffect(() => {
    if (id === undefined || keys === undefined) return;
    return registry.register({
      id,
      keys,
      description,
      group,
      allowInInput,
      hidden,
      run: (event) => runRef.current?.(event),
    });
  }, [registry, id, keys, description, group, allowInInput, hidden]);
}

/** Returns the currently registered shortcuts and re-renders when they change. */
export function useShortcutList(): Shortcut[] {
  const registry = useShortcutRegistry();
  return useSyncExternalStore(registry.subscribe, registry.list);
}

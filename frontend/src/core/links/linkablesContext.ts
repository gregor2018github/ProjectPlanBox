import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

import type { LinkableRegistry, LinkableSource } from "./linkables";

/** The app-wide linkable source registry. */
export const LinkablesContext = createContext<LinkableRegistry | null>(null);

function useRegistry(): LinkableRegistry {
  const registry = useContext(LinkablesContext);
  if (registry === null) throw new Error("Linkables need a LinkablesContext provider");
  return registry;
}

/**
 * Publishes a source while the caller is mounted. Memoise it (useMemo); a new
 * object republishes.
 */
export function useLinkableSource(source: LinkableSource | null): void {
  const registry = useRegistry();
  useEffect(() => (source === null ? undefined : registry.register(source)), [registry, source]);
}

/** Returns every published source and re-renders when they change. */
export function useLinkableSources(): LinkableSource[] {
  const registry = useRegistry();
  return useSyncExternalStore(registry.subscribe, registry.list);
}

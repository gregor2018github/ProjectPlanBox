import { useCallback, useState } from "react";

import { readStorage, writeStorage } from "../core/storage";

const KEY = "planbox.rail.pane";

/**
 * Which rail pane is open (a module id, or null), remembered per browser.
 * Returns the open id, a toggle per id and a close function.
 */
export function useRailPane(): [string | null, (id: string) => void, () => void] {
  const [open, setOpen] = useState<string | null>(() => {
    const stored = readStorage(KEY);
    return stored === "" ? null : stored;
  });
  const update = useCallback((next: (current: string | null) => string | null) => {
    setOpen((current) => {
      const value = next(current);
      writeStorage(KEY, value ?? "");
      return value;
    });
  }, []);
  const toggle = useCallback(
    (id: string) => {
      update((current) => (current === id ? null : id));
    },
    [update],
  );
  const close = useCallback(() => {
    update(() => null);
  }, [update]);
  return [open, toggle, close];
}

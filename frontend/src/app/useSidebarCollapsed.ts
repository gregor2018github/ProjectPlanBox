import { useCallback, useState } from "react";

import { readStorage, writeStorage } from "../core/storage";

const KEY = "planbox.sidebar.collapsed";

/** Whether the desktop sidebar is collapsed; remembered per browser. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readStorage(KEY) === "true");
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      writeStorage(KEY, String(!current));
      return !current;
    });
  }, []);
  return [collapsed, toggle];
}

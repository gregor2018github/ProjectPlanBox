import { useCallback, useSyncExternalStore } from "react";

/** Tracks a CSS media query, e.g. `(min-width: 768px)`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Matches Tailwind's `md` breakpoint: sidebar inline instead of a sheet. */
export const DESKTOP_QUERY = "(min-width: 768px)";

/** Matches Tailwind's `xl` breakpoint: the rail pane sits beside the content instead of floating. */
export const PANE_INLINE_QUERY = "(min-width: 1280px)";

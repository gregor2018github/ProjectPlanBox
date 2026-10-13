import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";
import { readThemePreference, THEME_EVENT, type ThemePreference } from "./theme";
import { useTheme } from "./useTheme";

/** Query key of the shared preferences. */
export const preferenceKeys = { all: ["core", "preferences"] as const };

/**
 * Keeps this device's theme and the server's in step, so the choice
 * follows to every device. localStorage still paints the first frame; the
 * server wins once it answers. A device that chose a theme before the
 * server held one hands its choice over.
 */
export function useThemeSync(): void {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { setPreference } = useTheme();
  const server = useQuery({
    queryKey: preferenceKeys.all,
    queryFn: () => unwrap(client.GET("/api/preferences")),
  });
  const save = useMutation({
    mutationFn: (theme: ThemePreference) =>
      unwrap(client.PATCH("/api/preferences", { body: { theme } })),
    onSuccess: (prefs) => {
      queryClient.setQueryData(preferenceKeys.all, prefs);
    },
  });
  const { mutate } = save;
  /** The server's value as last seen, so a change it caused is not sent back. */
  const known = useRef<ThemePreference | null | undefined>(undefined);

  const serverTheme = server.data?.theme;
  useEffect(() => {
    if (serverTheme === undefined) return;
    known.current = serverTheme;
    const local = readThemePreference();
    if (serverTheme === null) {
      if (local !== "system") mutate(local);
    } else if (serverTheme !== local) {
      setPreference(serverTheme);
    }
  }, [serverTheme, setPreference, mutate]);

  useEffect(() => {
    const push = () => {
      const local = readThemePreference();
      if (known.current !== undefined && local !== known.current) {
        known.current = local;
        mutate(local);
      }
    };
    window.addEventListener(THEME_EVENT, push);
    return () => {
      window.removeEventListener(THEME_EVENT, push);
    };
  }, [mutate]);
}

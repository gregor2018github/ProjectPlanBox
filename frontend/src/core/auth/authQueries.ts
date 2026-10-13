import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";

/** Query keys owned by phone access. */
export const authKeys = {
  session: ["core", "auth", "session"] as const,
  phones: ["core", "auth", "phones"] as const,
};

/** Whether this device may use PlanBox (always on the PC itself). */
export function useSession() {
  const client = useApiClient();
  return useQuery({
    queryKey: authKeys.session,
    queryFn: () => unwrap(client.GET("/api/auth/session")),
    staleTime: Infinity,
    retry: false,
  });
}

/** Signs this phone in with a pairing code; then every query loads afresh. */
export function useSignIn() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unwrap(client.POST("/api/auth/sign-in", { body: { code } })),
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session, session);
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey !== authKeys.session,
      });
    },
  });
}

/** Signs this phone out. */
export function useSignOut() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/auth/sign-out", { body: { confirm: true } })),
    onSuccess: (session) => {
      queryClient.setQueryData(authKeys.session, session);
    },
  });
}

/** Phone access as this PC sees it (PC only). */
export function usePhoneAccess(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: authKeys.phones,
    queryFn: () => unwrap(client.GET("/api/auth/phones")),
    enabled,
    // While a code is shown, notice soon when the phone has used it.
    refetchInterval: (query) => (query.state.data?.pairing ? 3000 : false),
  });
}

/** Shows a new pairing code (PC only). */
export function useStartPairing() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(client.POST("/api/auth/pairing", { body: { confirm: true } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: authKeys.phones }),
  });
}

/** Signs every phone out (PC only). */
export function useSignOutEverywhere() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(client.POST("/api/auth/sign-out-everywhere", { body: { confirm: true } })),
    onSuccess: (access) => {
      queryClient.setQueryData(authKeys.phones, access);
    },
  });
}

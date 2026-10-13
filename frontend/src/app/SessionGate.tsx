import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { ApiError } from "../core/api/client";
import { authKeys, useSession } from "../core/auth/authQueries";
import { SignInScreen } from "./SignInScreen";

/**
 * Shows the app only to devices that may use it. On the PC itself that is
 * always; a phone has to pair first. When the server stops answering, the
 * app renders anyway and its connection indicator explains.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();

  // A 401 anywhere (every phone signed out, the session expired): ask again.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const error: unknown = event.query.state.error;
        if (event.type === "updated" && error instanceof ApiError && error.status === 401) {
          void queryClient.invalidateQueries({ queryKey: authKeys.session });
        }
      }),
    [queryClient],
  );

  if (session.isPending) return null;
  if (session.data?.signed_in === false) return <SignInScreen />;
  return children;
}

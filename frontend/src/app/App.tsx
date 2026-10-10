import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider, type RouterHistory } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { useState } from "react";

import { ApiClientContext } from "../core/api/apiContext";
import { createApiClient, type ApiClient } from "../core/api/client";
import { CalendarFeedRegistry } from "../core/calendar/feed";
import { CalendarFeedsContext } from "../core/calendar/feedContext";
import { CommandsContext } from "../core/commands/commandsContext";
import { CommandRegistry } from "../core/commands/registry";
import type { ModuleManifest } from "../core/module";
import { createQueryClient } from "../core/queryClient";
import { ShortcutsProvider } from "../core/shortcuts/ShortcutsProvider";
import { UndoProvider } from "../core/undo/UndoProvider";
import { MODULES } from "../modules";
import { ToastProvider } from "../ui/ToastProvider";
import { TooltipProvider } from "../ui/TooltipProvider";
import { ModulesContext } from "./modulesContext";
import { createAppRouter } from "./router";

/** Props for {@link App}; everything is injectable for tests. */
export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  history?: RouterHistory;
  modules?: readonly ModuleManifest[];
}

/** The whole application: providers around the router. */
export function App({ apiClient, queryClient, history, modules = MODULES }: AppProps) {
  const [client] = useState(() => apiClient ?? createApiClient());
  const [queries] = useState(() => queryClient ?? createQueryClient());
  const [router] = useState(() => createAppRouter({ modules, history }));
  const [commands] = useState(() => new CommandRegistry());
  const [calendarFeeds] = useState(() => new CalendarFeedRegistry());

  return (
    <ApiClientContext value={client}>
      <QueryClientProvider client={queries}>
        <ModulesContext value={modules}>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              <ToastProvider>
                <ShortcutsProvider>
                  <UndoProvider>
                    <CommandsContext value={commands}>
                      <CalendarFeedsContext value={calendarFeeds}>
                        <RouterProvider router={router} />
                      </CalendarFeedsContext>
                    </CommandsContext>
                  </UndoProvider>
                </ShortcutsProvider>
              </ToastProvider>
            </TooltipProvider>
          </MotionConfig>
        </ModulesContext>
      </QueryClientProvider>
    </ApiClientContext>
  );
}

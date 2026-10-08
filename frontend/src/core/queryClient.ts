import { QueryClient } from "@tanstack/react-query";

/** Creates the app's query client with PlanBox defaults. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  });
}

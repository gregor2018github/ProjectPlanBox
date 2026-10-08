import { createContext, useContext } from "react";

import type { ApiClient } from "./client";

/** Holds the app's API client; tests provide one with a fake fetch. */
export const ApiClientContext = createContext<ApiClient | null>(null);

/** Returns the API client from context. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) throw new Error("useApiClient needs an <ApiClientContext> provider");
  return client;
}

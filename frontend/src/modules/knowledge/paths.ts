/** URLs of the knowledge views (the module's routes live under /knowledge). */
export const knowledgePaths = {
  all: "/knowledge",
  unsorted: "/knowledge/unsorted",
  collection: (id: string) => `/knowledge/collections/${id}`,
} as const;

/** Which entries a view shows: all, those without a collection, or one collection. */
export type EntryScope =
  { kind: "all" } | { kind: "unsorted" } | { kind: "collection"; id: string };

/** Reads a route param from untyped params (module routes are assembled at runtime). */
export function paramOf(params: unknown, name: string): string | undefined {
  if (typeof params !== "object" || params === null || !(name in params)) return undefined;
  const value = (params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

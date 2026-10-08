/** URLs of the todos views (the module's routes live under /todos). */
export const todoPaths = {
  inbox: "/todos/inbox",
  today: "/todos/today",
  upcoming: "/todos/upcoming",
  logbook: "/todos/logbook",
  list: (id: string) => `/todos/lists/${id}`,
  area: (id: string) => `/todos/areas/${id}`,
} as const;

/** Reads a route param from untyped params (module routes are assembled at runtime). */
export function paramOf(params: unknown, name: string): string | undefined {
  if (typeof params !== "object" || params === null || !(name in params)) return undefined;
  const value = (params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

import type { Shortcut } from "./registry";

/**
 * Filters the shortcut overview: every word of the query must appear in the
 * description, the group or the key spec (case-insensitive). Order is kept,
 * so groups stay together.
 */
export function filterShortcuts<T extends Pick<Shortcut, "description" | "group" | "keys">>(
  shortcuts: readonly T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...shortcuts];
  return shortcuts.filter((s) => {
    const text = `${s.description} ${s.group} ${s.keys}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

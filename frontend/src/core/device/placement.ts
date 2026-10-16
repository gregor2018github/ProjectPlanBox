/**
 * Placing an item among ordered siblings, the twin of
 * `backend/planbox/core/placement.py` (strict: unknown neighbours fail).
 */
import { keyBetween } from "../ordering";
import { ValidationFailed } from "./errors";

/** `[id, position]` pairs in display order. */
export type Positions = [string, string][];

/** A position among `siblings` (which exclude the item being placed). */
export function place(
  siblings: Positions,
  beforeId: string | null,
  afterId: string | null,
): string {
  const index = new Map(siblings.map(([id], i) => [id, i]));
  for (const neighbour of [beforeId, afterId]) {
    if (neighbour !== null && !index.has(neighbour)) {
      throw new ValidationFailed("The neighbour to place next to is not in that container.");
    }
  }
  let a: string | null;
  let b: string | null;
  if (afterId !== null) {
    const i = index.get(afterId) ?? 0;
    a = siblings[i]?.[1] ?? null;
    b =
      beforeId !== null
        ? (siblings[index.get(beforeId) ?? 0]?.[1] ?? null)
        : (siblings[i + 1]?.[1] ?? null);
  } else if (beforeId !== null) {
    const i = index.get(beforeId) ?? 0;
    b = siblings[i]?.[1] ?? null;
    a = i > 0 ? (siblings[i - 1]?.[1] ?? null) : null;
  } else {
    a = siblings.at(-1)?.[1] ?? null;
    b = null;
  }
  try {
    return keyBetween(a, b);
  } catch {
    throw new ValidationFailed("Those neighbours are not in order.");
  }
}

/** Keeps `wanted` unless a live sibling took that key meanwhile; then appends. */
export function freePosition(siblings: Positions, wanted: string): string {
  if (siblings.every(([, position]) => position !== wanted)) return wanted;
  return keyBetween(siblings.at(-1)?.[1] ?? null, null);
}

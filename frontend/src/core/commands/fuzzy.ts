/**
 * Small fuzzy matcher for the command palette: the query's characters must
 * appear in order. Consecutive runs and word starts score higher.
 */

/** Scores `text` against `query`; higher is better, null means no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const t = text.toLowerCase();

  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    if (char === " ") continue;
    const index = t.indexOf(char, from);
    if (index === -1) return null;
    const wordStart = index === 0 || /[\s\-_/:.]/.test(t.charAt(index - 1));
    score += 1;
    if (index === previous + 1) score += 4;
    if (wordStart) score += 6;
    score -= Math.min(index - from, 5) * 0.2;
    previous = index;
    from = index + 1;
  }
  if (t.startsWith(q)) score += 10;
  return score;
}

/** Something the palette can rank. */
export interface Searchable {
  title: string;
  keywords?: readonly string[];
}

/** Returns the items matching `query`, best first; all items for an empty query. */
export function rank<T extends Searchable>(items: readonly T[], query: string): T[] {
  if (query.trim() === "") return [...items];
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const candidates = [item.title, ...(item.keywords ?? [])];
    let best: number | null = null;
    for (const candidate of candidates) {
      const s = fuzzyScore(query, candidate);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ item, score: best });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}

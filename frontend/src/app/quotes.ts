import { readStorage, writeStorage } from "../core/storage";
import { QUOTES } from "./quoteList";

/** A historical quotation for the footer, in English or German. */
export interface Quote {
  text: string;
  author: string;
  /** The work it comes from, as Wikiquote cites it. */
  source: string;
  lang: "en" | "de";
}

const KEY = "planbox.quote.last";
const FIRST: Quote = QUOTES[0] ?? { text: "", author: "", source: "", lang: "en" };

/**
 * Picks a random index into a list of `count`, never `last` (unless the
 * list has only one entry), so consecutive starts never repeat a quote.
 */
export function pickQuoteIndex(count: number, last: number | null, random: () => number): number {
  if (count <= 1) return 0;
  const avoid = last !== null && last >= 0 && last < count;
  const index = Math.floor(random() * (avoid ? count - 1 : count));
  return avoid && index >= last ? index + 1 : index;
}

let current: Quote | undefined;

/**
 * This start's quote: chosen once per page load, different from the
 * previous load's, and remembered for the next one.
 */
export function quoteForThisStart(): Quote {
  if (current === undefined) {
    const stored = Number.parseInt(readStorage(KEY) ?? "", 10);
    const index = pickQuoteIndex(QUOTES.length, Number.isNaN(stored) ? null : stored, Math.random);
    writeStorage(KEY, String(index));
    current = QUOTES[index] ?? FIRST;
  }
  return current;
}

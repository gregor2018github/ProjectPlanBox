/**
 * The server marks matched terms in search titles and snippets with two
 * private-use characters (see `core/search/repository.py`).
 */

/** Starts a matched term. */
export const MATCH_START = "";
/** Ends a matched term. */
export const MATCH_END = "";

/** A run of text, matched or not. */
export interface MarkedPart {
  text: string;
  match: boolean;
}

/** Splits marked text into plain and matched runs (empty runs are dropped). */
export function splitMarks(text: string): MarkedPart[] {
  const parts: MarkedPart[] = [];
  let match = false;
  let current = "";
  const flush = () => {
    if (current !== "") parts.push({ text: current, match });
    current = "";
  };
  for (const char of text) {
    if (char === MATCH_START || char === MATCH_END) {
      flush();
      match = char === MATCH_START;
    } else {
      current += char;
    }
  }
  flush();
  return parts;
}

/** The text without marks. */
export function stripMarks(text: string): string {
  return text.replaceAll(MATCH_START, "").replaceAll(MATCH_END, "");
}

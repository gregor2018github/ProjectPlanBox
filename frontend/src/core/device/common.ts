/** Small helpers shared by device services (Python's string rules). */
import { isValidId } from "../ids";
import { ValidationFailed } from "./errors";

/** Python's `re.sub(r"\s+", " ", text).strip()`: one line, single spaces. */
export function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Rejects client ids that are not lowercase UUIDv7. */
export function checkClientId(
  id: string | null | undefined,
  message = "Ids must be lowercase UUIDv7.",
): void {
  if (id !== null && id !== undefined && !isValidId(id)) throw new ValidationFailed(message);
}

/** Python's `dict.fromkeys(values)`: unique, first occurrence kept. */
export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

/** Compares strings by code point, like Python's `<` (and SQLite's BINARY). */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A PATCH body's fields as sent (Pydantic's `model_fields_set`), minus `skip`. */
export function changesOf(
  body: object,
  fields: ReadonlySet<string>,
  skip: readonly string[] = [],
): Map<string, unknown> {
  const values = body as Record<string, unknown>;
  return new Map(
    [...fields].filter((f) => f in values && !skip.includes(f)).map((f) => [f, values[f]]),
  );
}

/** Python's `str(value)` for JSON values (`None`, `True`, `False`). */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

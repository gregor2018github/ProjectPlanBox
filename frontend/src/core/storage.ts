/**
 * Per-browser preferences in localStorage. Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and callers
 * must work without it.
 */

/** Reads a stored string, or null when missing or storage is unavailable. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores a string; silently does nothing when storage is unavailable. */
export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The preference simply is not remembered.
  }
}

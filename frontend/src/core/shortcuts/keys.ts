/**
 * Keyboard shortcut specs, e.g. "Ctrl+K", "Shift+Q", "Alt+ArrowUp", "?" or
 * the sequence "G I" (press G, then I). Pure functions, no DOM state.
 */

/** One key press with its modifiers. */
export interface KeyChord {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  space: " ",
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  delete: "Delete",
  del: "Delete",
  backspace: "Backspace",
  tab: "Tab",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Delete: "Del",
};

/** Parses a spec into the chords to press in order. */
export function parseKeys(spec: string): KeyChord[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((part) => {
      const chord: KeyChord = { key: "", ctrl: false, alt: false, shift: false, meta: false };
      for (const token of part.split("+")) {
        const lower = token.toLowerCase();
        if (lower === "ctrl" || lower === "mod") chord.ctrl = true;
        else if (lower === "alt") chord.alt = true;
        else if (lower === "shift") chord.shift = true;
        else if (lower === "meta") chord.meta = true;
        else chord.key = KEY_ALIASES[lower] ?? (token.length === 1 ? lower : token);
      }
      if (chord.key === "") throw new Error(`Shortcut "${spec}" has no key`);
      return chord;
    });
}

function isLetter(key: string): boolean {
  return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

/** The parts of a KeyboardEvent that matching needs (keeps tests DOM-free). */
export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
> & {
  getModifierState?: (key: string) => boolean;
};

/**
 * Tells whether an event matches a chord.
 *
 * Symbols such as "?" or "[" need Shift or AltGr on many layouts (German:
 * "?" is Shift+ß, "[" is AltGr+8), so for symbol keys Shift is ignored and
 * AltGr (reported as Ctrl+Alt) does not count as Ctrl or Alt.
 */
export function chordMatches(chord: KeyChord, event: KeyEventLike): boolean {
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (eventKey !== chord.key) return false;

  const symbol = chord.key.length === 1 && !isLetter(chord.key) && chord.key !== " ";
  const altGraph = event.getModifierState?.("AltGraph") === true || (event.ctrlKey && event.altKey);
  const ctrl = symbol && altGraph ? false : event.ctrlKey;
  const alt = symbol && altGraph ? false : event.altKey;

  if (ctrl !== chord.ctrl || alt !== chord.alt || event.metaKey !== chord.meta) return false;
  if (symbol && !chord.shift) return true;
  return event.shiftKey === chord.shift;
}

/** Labels for display, one array of key caps per chord: "G I" gives [["G"], ["I"]]. */
export function formatKeys(spec: string): string[][] {
  return parseKeys(spec).map((chord) => {
    const caps: string[] = [];
    if (chord.ctrl) caps.push("Ctrl");
    if (chord.alt) caps.push("Alt");
    if (chord.shift) caps.push("Shift");
    if (chord.meta) caps.push("Win");
    caps.push(
      KEY_LABELS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key),
    );
    return caps;
  });
}

const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
]);

/** Tells whether keystrokes on this target are typing, so plain-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

const INTERACTIVE =
  'button, a[href], summary, [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [role="tab"]';

/** Tells whether the target handles Enter/Space itself (buttons, links, menu items…). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

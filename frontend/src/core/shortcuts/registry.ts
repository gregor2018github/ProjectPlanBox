import { chordMatches, isTypingTarget, parseKeys, type KeyChord, type KeyEventLike } from "./keys";

/** A registered keyboard shortcut. */
export interface Shortcut {
  /** Unique id; registering the same id again replaces the earlier entry. */
  id: string;
  /** Key spec, e.g. "Ctrl+K" or "G I". */
  keys: string;
  /** Shown in the shortcut overview. */
  description: string;
  /** Overview section, e.g. "General". */
  group: string;
  /** Fire even while typing in a text field (for modifier shortcuts like Ctrl+K). */
  allowInInput?: boolean;
  /** Hide from the overview (e.g. aliases). */
  hidden?: boolean;
  /** Runs when the shortcut matches. */
  run: (event: KeyboardEvent) => void;
}

interface Entry {
  shortcut: Shortcut;
  chords: KeyChord[];
}

/** The longest gap allowed between the keys of a sequence such as "G I". */
export const SEQUENCE_TIMEOUT_MS = 1000;

/** The parts of a keydown event the registry looks at. */
export type ShortcutEvent = KeyEventLike & {
  target: EventTarget | null;
  isComposing?: boolean;
  defaultPrevented?: boolean;
};

/**
 * Holds the active shortcuts and decides which one a key event triggers.
 * Later registrations win, so a focused view can override a global key.
 */
export class ShortcutRegistry {
  private entries: Entry[] = [];
  private pending: { chords: KeyChord[]; at: number } | null = null;
  private listeners = new Set<() => void>();
  private snapshot: Shortcut[] = [];

  /** Adds a shortcut and returns a function that removes it. */
  register(shortcut: Shortcut): () => void {
    const entry: Entry = { shortcut, chords: parseKeys(shortcut.keys) };
    this.entries = [...this.entries.filter((e) => e.shortcut.id !== shortcut.id), entry];
    this.emit();
    return () => {
      if (!this.entries.includes(entry)) return;
      this.entries = this.entries.filter((e) => e !== entry);
      this.emit();
    };
  }

  /** The registered shortcuts in registration order (stable between changes). */
  list = (): Shortcut[] => this.snapshot;

  /** Subscribes to registration changes; returns an unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Runs the matching shortcut, if any.
   *
   * @returns true when the event was consumed and the caller should preventDefault.
   */
  handle(event: ShortcutEvent, now: number = Date.now()): boolean {
    if (event.isComposing === true || event.defaultPrevented === true) return false;
    const typing = isTypingTarget(event.target);
    const candidates = [...this.entries]
      .reverse()
      .filter((e) => !typing || e.shortcut.allowInInput === true);

    const pending = this.pending;
    this.pending = null;
    if (pending && now - pending.at <= SEQUENCE_TIMEOUT_MS) {
      const depth = pending.chords.length;
      const completed = candidates.find(
        (e) =>
          e.chords.length === depth + 1 &&
          pending.chords.every((c, i) => sameChord(c, e.chords[i])) &&
          chordMatches(e.chords[depth] as KeyChord, event),
      );
      if (completed) {
        completed.shortcut.run(event as KeyboardEvent);
        return true;
      }
    }

    const single = candidates.find(
      (e) => e.chords.length === 1 && chordMatches(e.chords[0] as KeyChord, event),
    );
    if (single) {
      single.shortcut.run(event as KeyboardEvent);
      return true;
    }

    const starter = candidates.find(
      (e) => e.chords.length > 1 && chordMatches(e.chords[0] as KeyChord, event),
    );
    if (starter) {
      this.pending = { chords: [starter.chords[0] as KeyChord], at: now };
      return true;
    }
    return false;
  }

  private emit(): void {
    this.snapshot = this.entries.map((e) => e.shortcut);
    for (const listener of this.listeners) listener();
  }
}

function sameChord(a: KeyChord, b: KeyChord | undefined): boolean {
  return (
    a.key === b?.key &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

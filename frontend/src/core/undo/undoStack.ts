/** Something that can be undone, with the words the toast shows. */
export interface UndoEntry {
  /** E.g. "Deleted “Pay rent”". */
  label: string;
  /** Reverses the action (usually a restore/reopen/move-back mutation). */
  undo: () => void;
  /** Only Ctrl+Z, no toast (for frequent actions such as completing). */
  silent?: boolean;
}

/** A bounded last-in-first-out stack of undoable actions. */
export class UndoStack {
  private entries: UndoEntry[] = [];

  constructor(private readonly limit = 20) {}

  /** Adds an entry, dropping the oldest beyond the limit. */
  push(entry: UndoEntry): void {
    this.entries = [...this.entries, entry].slice(-this.limit);
  }

  /** Removes and returns the newest entry, if any. */
  pop(): UndoEntry | undefined {
    const entry = this.entries.at(-1);
    this.entries = this.entries.slice(0, -1);
    return entry;
  }

  /** Removes a specific entry (e.g. after its toast's Undo button ran it). */
  remove(entry: UndoEntry): void {
    this.entries = this.entries.filter((e) => e !== entry);
  }

  /** Number of entries. */
  get size(): number {
    return this.entries.length;
  }
}

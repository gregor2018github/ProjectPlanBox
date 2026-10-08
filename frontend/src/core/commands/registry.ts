/** An action reachable from the command palette. */
export interface Command {
  /** Unique id; registering it again replaces the earlier command. */
  id: string;
  /** What the palette shows, e.g. "Toggle sidebar". */
  title: string;
  /** Palette section, e.g. "General" or "Theme". */
  group: string;
  /** Extra words that should match, e.g. ["dark", "night"]. */
  keywords?: readonly string[];
  /** Key spec shown next to the title, e.g. "[". */
  shortcut?: string;
  /** Performs the action. */
  run: () => void;
}

/** Holds the commands contributed by the shell and the modules. */
export class CommandRegistry {
  private commands: Command[] = [];
  private listeners = new Set<() => void>();

  /** Adds commands and returns a function that removes exactly those. */
  register(commands: readonly Command[]): () => void {
    const ids = new Set(commands.map((c) => c.id));
    this.commands = [...this.commands.filter((c) => !ids.has(c.id)), ...commands];
    this.emit();
    return () => {
      const before = this.commands.length;
      this.commands = this.commands.filter((c) => !commands.includes(c));
      if (this.commands.length !== before) this.emit();
    };
  }

  /** All commands in registration order (stable between changes). */
  list = (): Command[] => this.commands;

  /** Subscribes to changes; returns an unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Linkable sources: what the link picker can offer, without core importing
 * modules (ARCHITECTURE §6.2). A module's Host publishes its entities with
 * `useLinkableSource`; the core link panel reads all of them. Server-side
 * search (phase 3) can replace this list later; display already comes from
 * the server's summaries.
 */
import type { LucideIcon } from "lucide-react";

/** One entity the user can link to. */
export interface LinkableItem {
  /** Entity reference, e.g. "knowledge.entry:<id>". */
  ref: string;
  title: string;
  /** Short context shown in the picker, e.g. "Todo · Inbox" (defaults to the noun). */
  hint?: string;
}

/** Everything one entity type offers to the link picker. */
export interface LinkableSource {
  /** The entity type, e.g. "todos.todo"; one source per type. */
  entityType: string;
  /** What one item is called, e.g. "Todo". */
  noun: string;
  icon: LucideIcon;
  items: readonly LinkableItem[];
}

/** Holds the published sources; one per entity type. */
export class LinkableRegistry {
  private sources: LinkableSource[] = [];
  private listeners = new Set<() => void>();

  /** Publishes (or replaces) a source and returns a function that withdraws exactly it. */
  register(source: LinkableSource): () => void {
    this.sources = [...this.sources.filter((s) => s.entityType !== source.entityType), source];
    this.emit();
    return () => {
      const before = this.sources.length;
      this.sources = this.sources.filter((s) => s !== source);
      if (this.sources.length !== before) this.emit();
    };
  }

  /** All published sources (stable between changes). */
  list = (): LinkableSource[] => this.sources;

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

/** The entity type of a reference ("todos.todo:<id>" → "todos.todo"). */
export function entityTypeOf(ref: string): string {
  const index = ref.indexOf(":");
  return index < 0 ? ref : ref.slice(0, index);
}

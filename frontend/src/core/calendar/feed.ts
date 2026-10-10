/**
 * Calendar feeds: how modules put dated items on the calendar without the
 * calendar importing them (ARCHITECTURE §2). A module's Host publishes a feed
 * with `useCalendarFeed`; the calendar module reads every feed with
 * `useCalendarFeeds`. Entries are addressed by entity reference, like links.
 *
 * The other way round, the calendar announces which dates it shows
 * (`useCalendarRange`), so a module can add entries that depend on the range,
 * such as the later dates of repeating todos (`useCalendarRanges`).
 */
import type { IsoDate } from "../time";

/** One dated item a module shows on the calendar (e.g. a todo's due date). */
export interface CalendarFeedEntry {
  /** Entity reference, e.g. "todos.todo:<id>"; also opens the detail panel. */
  ref: string;
  title: string;
  /** The floating date the entry sits on. */
  date: IsoDate;
  done: boolean;
  /** Semantic mark: "danger" for high priority, "warning" for medium. */
  tone: "default" | "danger" | "warning";
  /** Short secondary text, e.g. the list name. */
  context?: string;
  /**
   * A later date the item is expected on (e.g. a repeating todo's next
   * occurrences). It only opens the item: it cannot be ticked off or moved.
   */
  projected?: boolean;
}

/** Dates the calendar shows, both inclusive. */
export interface CalendarRange {
  start: IsoDate;
  end: IsoDate;
}

/** Everything a module contributes to the calendar. */
export interface CalendarFeed {
  /** The contributing module's id. */
  id: string;
  /** What the entries are, e.g. "Todos". */
  label: string;
  entries: readonly CalendarFeedEntry[];
  /** Moves an entry to another date (records its own undo). */
  reschedule: (ref: string, date: IsoDate) => void;
  /** Marks an entry done or not done (records its own undo). */
  toggleDone: (ref: string) => void;
}

/** Holds the published feeds (one per module id) and the ranges the calendar shows. */
export class CalendarFeedRegistry {
  private feeds: CalendarFeed[] = [];
  private watched: { range: CalendarRange }[] = [];
  private ranges: CalendarRange[] = [];
  private listeners = new Set<() => void>();

  /** Publishes (or replaces) a feed and returns a function that withdraws exactly it. */
  register(feed: CalendarFeed): () => void {
    this.feeds = [...this.feeds.filter((f) => f.id !== feed.id), feed];
    this.emit();
    return () => {
      const before = this.feeds.length;
      this.feeds = this.feeds.filter((f) => f !== feed);
      if (this.feeds.length !== before) this.emit();
    };
  }

  /** All published feeds (stable between changes). */
  list = (): CalendarFeed[] => this.feeds;

  /** Announces a range the calendar shows; returns a function that withdraws exactly it. */
  watch(range: CalendarRange): () => void {
    const token = { range };
    this.watched = [...this.watched, token];
    this.updateRanges();
    return () => {
      this.watched = this.watched.filter((w) => w !== token);
      this.updateRanges();
    };
  }

  /** The distinct ranges shown now (stable between changes). */
  listRanges = (): CalendarRange[] => this.ranges;

  /** Subscribes to changes; returns an unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private updateRanges(): void {
    const keyOf = (r: CalendarRange) => `${r.start}/${r.end}`;
    const distinct = new Map<string, CalendarRange>();
    for (const { range } of this.watched) distinct.set(keyOf(range), range);
    const next = [...distinct.values()];
    if (next.map(keyOf).join() === this.ranges.map(keyOf).join()) return;
    this.ranges = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** One row of a {@link BarList}. */
export interface BarListItem {
  key: string;
  label: string;
  /** Muted context after the label, e.g. the area of a list. */
  sublabel?: string | undefined;
  value: number;
  /** The value as shown; defaults to the number. */
  display?: string | undefined;
}

/** Props for {@link BarList}. */
export interface BarListProps {
  /** Accessible name of the list. */
  label: string;
  items: readonly BarListItem[];
  /** Bar length for 100 %; defaults to the largest value. */
  max?: number;
  /** Shown instead of the rows when there are none. */
  empty?: string;
}

/**
 * Ranked horizontal bars with the value at each bar's tip: the form for
 * comparing buckets (lists, tags, priorities, durations).
 */
export function BarList({ label, items, max, empty = "Nothing yet." }: BarListProps) {
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.label}
              {item.sublabel !== undefined && (
                <span className="text-text-muted"> · {item.sublabel}</span>
              )}
            </span>
            <span className="shrink-0 text-text-muted tabular-nums">
              {item.display ?? item.value}
            </span>
          </div>
          <div aria-hidden className="h-2 rounded-full bg-heat-0">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${top > 0 ? (item.value / top) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

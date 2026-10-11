/** Props for {@link StatTile}. */
export interface StatTileProps {
  /** Sentence case, no colon, e.g. "Open todos". */
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** A muted line under the figure, e.g. "3 overdue" or "+4 vs last week". */
  detail?: string | undefined;
}

/** One headline number with its label (the Insights overviews). */
export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface p-4">
      <span className="truncate text-sm text-text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {detail !== undefined && <span className="text-sm text-text-muted">{detail}</span>}
    </div>
  );
}

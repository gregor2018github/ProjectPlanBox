/** Number formatting shared by every Insights section. */

const counts = new Intl.NumberFormat("en-GB");

/** A count with thousands separators: 1,284. */
export function formatCount(value: number): string {
  return counts.format(value);
}

/**
 * A duration given in days, at a useful precision: "40 min", "5 h",
 * "2.4 days", "12 days". A dash when there is nothing to measure.
 */
export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return "–";
  const hours = days * 24;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.round(hours)} h`;
  if (days < 10) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded.toString()} ${rounded === 1 ? "day" : "days"}`;
  }
  return `${formatCount(Math.round(days))} days`;
}

/** A share as a whole percentage, or a dash when the whole is zero. */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "–";
  return `${Math.round((part / whole) * 100).toString()} %`;
}

/** A change against an earlier period: "+3 vs last week", "−2 …", "same as …". */
export function formatDelta(current: number, previous: number, period: string): string {
  const diff = current - previous;
  if (diff === 0) return `Same as ${period}`;
  return `${diff > 0 ? "+" : "−"}${formatCount(Math.abs(diff))} vs ${period}`;
}

/** "1 todo" / "3 todos". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** Appended to a section's subtitle when the tag filter is on but cannot narrow it. */
export const UNFILTERED_NOTE = "The tag filter does not apply here.";

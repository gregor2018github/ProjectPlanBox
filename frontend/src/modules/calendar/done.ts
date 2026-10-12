/**
 * When an event occurrence counts as done: a mark set by hand wins;
 * without one it is done once it has ended (an all-day one after its last
 * day). The server applies the same rule for the Insights overview.
 */
import type { IsoDate } from "../../core/time";
import type { Occurrence } from "./types";

/** Whether the occurrence is over at `nowIso` (`today` is the local date then). */
export function hasEnded(occurrence: Occurrence, nowIso: string, today: IsoDate): boolean {
  if (occurrence.end_at !== null) return occurrence.end_at <= nowIso;
  return (occurrence.end_date ?? occurrence.occurrence_date) < today;
}

/** Whether the occurrence is done (its mark, else whether it has ended). */
export function isDone(occurrence: Occurrence, nowIso: string, today: IsoDate): boolean {
  return occurrence.marked_done ?? hasEnded(occurrence, nowIso, today);
}

/**
 * The mark that flips the occurrence's done state: none when the new state
 * is what the automatic rule gives anyway, so the end time stays the record.
 */
export function toggledMark(
  occurrence: Occurrence,
  nowIso: string,
  today: IsoDate,
): boolean | null {
  const next = !isDone(occurrence, nowIso, today);
  return next === hasEnded(occurrence, nowIso, today) ? null : next;
}

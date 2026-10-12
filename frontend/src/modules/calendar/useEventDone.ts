import { useMeta } from "../../core/api/coreQueries";
import { zonedParts } from "../../core/time";
import { isDone } from "./done";
import { useMinuteClock } from "./minuteClock";
import type { EventItem } from "./types";

/** Whether an event occurrence is done now (ticked, or over); follows the clock. */
export function useEventDone(item: EventItem): boolean {
  const timeZone = useMeta().data?.timezone ?? "UTC";
  const now = useMinuteClock();
  return isDone(item.occurrence, now, zonedParts(now, timeZone).date);
}

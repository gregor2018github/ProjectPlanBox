import type { IsoDate } from "../../core/time";
import type { CalendarView } from "./types";

/** URL of the full-page calendar. */
export const CALENDAR_PATH = "/calendar";

/** Search params of the calendar page. */
export interface CalendarSearch {
  view?: CalendarView;
  date?: IsoDate;
}

const VIEWS: readonly CalendarView[] = ["month", "week", "day"];

/** Validates the calendar page's search params (unknown values are dropped). */
export function parseCalendarSearch(search: unknown): CalendarSearch {
  if (typeof search !== "object" || search === null) return {};
  const raw = search as { view?: unknown; date?: unknown };
  const view = VIEWS.find((v) => v === raw.view);
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : undefined;
  return { ...(view && { view }), ...(date && { date }) };
}

/** The entity reference used in the `?item=` search param. */
export function eventRef(id: string): string {
  return `calendar.event:${id}`;
}

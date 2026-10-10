/**
 * Dropping things onto a calendar day. The calendar marks its days as drop
 * targets carrying {@link DateDropData}; any module whose draggable lands
 * there reads the date with {@link droppedDate} and reschedules its item.
 */
import type { DropInfo } from "../../ui/dnd";
import type { IsoDate } from "../time";

/** Drag types a calendar day accepts: todo rows and the calendar's own items. */
export const DATE_DROP_ACCEPTS: readonly string[] = ["todo", "calendar-item"];

/** Data of a calendar day drop target. */
export interface DateDropData {
  kind: "date";
  date: IsoDate;
}

/** Builds the drop data of a calendar day. */
export function dateDropData(date: IsoDate): DateDropData {
  return { kind: "date", date };
}

/** The date a drag ended on, or null when it did not end on a calendar day. */
export function droppedDate(info: DropInfo): IsoDate | null {
  if (info.canceled || info.target === null) return null;
  const { kind, date } = info.target.data;
  return kind === "date" && typeof date === "string" ? date : null;
}

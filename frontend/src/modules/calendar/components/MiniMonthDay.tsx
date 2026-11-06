import type { Ref } from "react";

import { formatDayLong, isoWeekday, type IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import { useDayDrop } from "../useDayDrop";

/** Props for {@link MiniMonthDay}. */
export interface MiniMonthDayProps {
  date: IsoDate;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** How many events the day has (purple dot). */
  events: number;
  /** How many open todos (feed entries) the day has (accent dot). */
  entries: number;
  surface: string;
  buttonRef?: Ref<HTMLButtonElement> | undefined;
  onSelect: (date: IsoDate) => void;
}

/** One day of the mini month: selects the day and accepts dropped todos and events. */
export function MiniMonthDay({
  date,
  inMonth,
  isToday,
  isSelected,
  events,
  entries,
  surface,
  buttonRef,
  onSelect,
}: MiniMonthDayProps) {
  const { ref, isDropTarget } = useDayDrop(surface, date);
  const count = events + entries;
  const label = `${formatDayLong(date)}${count > 0 ? `, ${String(count)} item${count === 1 ? "" : "s"}` : ""}`;
  return (
    <div ref={ref} role="gridcell" aria-selected={isSelected} className="flex justify-center">
      <button
        ref={buttonRef}
        type="button"
        tabIndex={isSelected ? 0 : -1}
        aria-label={label}
        aria-current={isToday ? "date" : undefined}
        onClick={() => {
          onSelect(date);
        }}
        className={cx(
          "relative flex size-9 flex-col items-center justify-center rounded-md text-sm tabular-nums transition-colors duration-(--duration-fast) ease-out coarse:size-11",
          isSelected ? "bg-accent text-on-accent" : "hover:bg-hover",
          isDropTarget && !isSelected && "bg-accent-subtle",
          !isSelected && isToday && "font-semibold text-accent",
          !isSelected && !inMonth && "text-text-subtle",
          !isSelected && inMonth && !isToday && isoWeekday(date) > 5 && "text-text-muted",
        )}
      >
        {Number(date.slice(8))}
        {/* Purple on the accent fill would not read, so a selected day's dots
            are both on-accent; its agenda is open next to it anyway. */}
        <span aria-hidden className="absolute bottom-1 flex gap-0.5">
          {events > 0 && (
            <span
              data-dot="event"
              className={cx("size-1 rounded-full", isSelected ? "bg-on-accent" : "bg-event")}
            />
          )}
          {entries > 0 && (
            <span
              data-dot="entry"
              className={cx("size-1 rounded-full", isSelected ? "bg-on-accent" : "bg-accent")}
            />
          )}
        </span>
      </button>
    </div>
  );
}

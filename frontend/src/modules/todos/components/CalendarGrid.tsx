import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  addDays,
  formatDayLong,
  isoWeekday,
  startOfWeekOf,
  type IsoDate,
} from "../../../core/time";
import { cx } from "../../../ui/cx";
import { IconButton } from "../../../ui/IconButton";

/** Props for {@link CalendarGrid}. */
export interface CalendarGridProps {
  selected: IsoDate | null;
  today: IsoDate;
  onSelect: (date: IsoDate) => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function firstOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(first: IsoDate, delta: number): IsoDate {
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7)) - 1 + delta;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * A Monday-first month grid. Arrow keys move by day/week, PageUp/PageDown by
 * month, Enter picks; only the focused day is in the tab order.
 */
export function CalendarGrid({ selected, today, onSelect }: CalendarGridProps) {
  const [focused, setFocused] = useState<IsoDate>(selected ?? today);
  const month = firstOfMonth(focused);
  const gridStart = startOfWeekOf(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const focusRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (moved.current) focusRef.current?.focus();
  }, [focused]);

  const move = (date: IsoDate) => {
    moved.current = true;
    setFocused(date);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltas[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      move(addDays(focused, delta));
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const target = shiftMonth(month, event.key === "PageUp" ? -1 : 1);
      move(
        `${target.slice(0, 8)}${focused.slice(8)}` <= addDays(shiftMonth(target, 1), -1)
          ? `${target.slice(0, 8)}${focused.slice(8)}`
          : addDays(shiftMonth(target, 1), -1),
      );
    }
  };

  const label = `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium" aria-live="polite">
          {label}
        </span>
        <span className="flex">
          <IconButton
            label="Previous month"
            icon={ChevronLeft}
            onClick={() => {
              move(shiftMonth(month, -1));
            }}
          />
          <IconButton
            label="Next month"
            icon={ChevronRight}
            onClick={() => {
              move(shiftMonth(month, 1));
            }}
          />
        </span>
      </div>
      <div
        role="grid"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            role="columnheader"
            className="flex h-7 items-center justify-center text-xs text-text-muted"
          >
            {d}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === month.slice(0, 7);
          const isSelected = day === selected;
          const isToday = day === today;
          return (
            <button
              key={day}
              ref={day === focused ? focusRef : undefined}
              type="button"
              role="gridcell"
              tabIndex={day === focused ? 0 : -1}
              aria-selected={isSelected}
              aria-label={formatDayLong(day)}
              aria-current={isToday ? "date" : undefined}
              onClick={() => {
                onSelect(day);
              }}
              className={cx(
                "flex size-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors duration-(--duration-fast) ease-out coarse:size-10",
                isSelected ? "bg-accent text-on-accent" : "hover:bg-hover",
                isToday && "font-semibold ring-inset",
                isToday &&
                  (isSelected ? "ring-2 ring-on-accent" : "text-accent ring-1 ring-accent"),
                !isSelected && !isToday && !inMonth && "text-text-subtle",
                isoWeekday(day) > 5 && !isSelected && !isToday && inMonth && "text-text-muted",
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

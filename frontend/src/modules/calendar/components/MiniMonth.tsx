import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { addDays, addMonths, formatMonth, type IsoDate } from "../../../core/time";
import { IconButton } from "../../../ui/IconButton";
import type { DayItems } from "../selectors";
import { MiniMonthDay } from "./MiniMonthDay";

/** Props for {@link MiniMonth}. */
export interface MiniMonthProps {
  /** The 42 days shown (six Monday-first weeks). */
  days: readonly IsoDate[];
  /** First day of the month on display. */
  month: IsoDate;
  selected: IsoDate;
  today: IsoDate;
  byDay: ReadonlyMap<IsoDate, DayItems>;
  surface: string;
  onSelect: (date: IsoDate) => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function countOf(items: DayItems | undefined): number {
  if (items === undefined) return 0;
  return (
    items.spanning.length +
    items.allDay.length +
    items.timed.length +
    items.entries.filter((e) => !e.entry.done).length
  );
}

/**
 * A compact month with a dot on busy days. Arrow keys move by day and week,
 * PageUp/PageDown by month; only the selected day is in the tab order.
 */
export function MiniMonth({
  days,
  month,
  selected,
  today,
  byDay,
  surface,
  onSelect,
}: MiniMonthProps) {
  const focusRef = useRef<HTMLButtonElement>(null);
  const keyboard = useRef(false);

  useEffect(() => {
    if (keyboard.current) focusRef.current?.focus();
    keyboard.current = false;
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltas[event.key];
    let next: IsoDate | null = null;
    if (delta !== undefined) next = addDays(selected, delta);
    else if (event.key === "PageUp") next = addMonths(selected, -1);
    else if (event.key === "PageDown") next = addMonths(selected, 1);
    if (next === null) return;
    event.preventDefault();
    keyboard.current = true;
    onSelect(next);
  };

  const label = formatMonth(month);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between pl-2">
        <span className="text-base font-medium" aria-live="polite">
          {label}
        </span>
        <span className="flex">
          <IconButton
            label="Previous month"
            icon={ChevronLeft}
            onClick={() => {
              onSelect(addMonths(selected, -1));
            }}
          />
          <IconButton
            label="Next month"
            icon={ChevronRight}
            onClick={() => {
              onSelect(addMonths(selected, 1));
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
        {days.map((day) => (
          <MiniMonthDay
            key={day}
            date={day}
            inMonth={day.slice(0, 7) === month.slice(0, 7)}
            isToday={day === today}
            isSelected={day === selected}
            count={countOf(byDay.get(day))}
            surface={surface}
            buttonRef={day === selected ? focusRef : undefined}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

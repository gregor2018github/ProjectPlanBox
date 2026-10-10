import type { IsoDate } from "../../../core/time";
import type { DayItems } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { MonthDayCell } from "./MonthDayCell";

/** Props for {@link MonthView}. */
export interface MonthViewProps {
  /** The 42 days of the grid, Monday first. */
  days: readonly IsoDate[];
  /** Any day of the month on display. */
  month: IsoDate;
  today: IsoDate;
  byDay: ReadonlyMap<IsoDate, DayItems>;
  actions: CalendarActions;
  onOpenDay: (date: IsoDate) => void;
  onCreate: (date: IsoDate) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY: DayItems = { allDay: [], timed: [], entries: [] };

/** Six Monday-first weeks; drop todos and events on any day. */
export function MonthView({
  days,
  month,
  today,
  byDay,
  actions,
  onOpenDay,
  onCreate,
}: MonthViewProps) {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <div
      role="grid"
      aria-label="Month"
      className="flex min-h-0 flex-1 flex-col border-t border-l border-border"
    >
      <div role="row" className="grid shrink-0 grid-cols-7">
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            role="columnheader"
            className="border-r border-b border-border px-2 py-1 text-xs text-text-muted"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="contents">
            {week.map((day) => (
              <MonthDayCell
                key={day}
                date={day}
                inMonth={day.slice(0, 7) === month.slice(0, 7)}
                isToday={day === today}
                items={byDay.get(day) ?? EMPTY}
                surface="month"
                actions={actions}
                onOpenDay={onOpenDay}
                onCreate={onCreate}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

import type { IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import { MAX_BAR_LANES, MONTH_CELL_HEADER } from "../barLayout";
import { emptyDay, layoutBars, type DayItems } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { EventBar } from "./EventBar";
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
  /** The day picked on a phone, whose agenda is shown below the grid. */
  selected?: IsoDate | undefined;
  /** Phone layout: rows as tall as their content instead of filling the page. */
  compact?: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY = emptyDay();
const SURFACE = "month";

/**
 * Six Monday-first weeks; drop todos and events on any day. Multi-day
 * events run as one bar across their days in each week.
 */
export function MonthView({
  days,
  month,
  today,
  byDay,
  actions,
  onOpenDay,
  onCreate,
  selected,
  compact = false,
}: MonthViewProps) {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <div
      role="grid"
      aria-label="Month"
      className={cx("flex flex-col border-t border-l border-border", !compact && "min-h-0 flex-1")}
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
      <div className={cx("grid grid-rows-6", !compact && "min-h-0 flex-1")}>
        {weeks.map((week) => {
          const { bars, lanes } = layoutBars(week, byDay);
          const shown = Math.min(lanes, MAX_BAR_LANES);
          return (
            <div key={week[0]} role="row" className="relative grid min-h-0 grid-cols-7">
              {week.map((day, column) => (
                <MonthDayCell
                  key={day}
                  date={day}
                  inMonth={day.slice(0, 7) === month.slice(0, 7)}
                  isToday={day === today}
                  isSelected={day === selected}
                  items={byDay.get(day) ?? EMPTY}
                  barLanes={shown}
                  hiddenBars={
                    bars.filter((b) => b.lane >= shown && b.from <= column && column <= b.to).length
                  }
                  surface={SURFACE}
                  actions={actions}
                  onOpenDay={onOpenDay}
                  onCreate={onCreate}
                />
              ))}
              {bars
                .filter((bar) => bar.lane < shown)
                .map((bar) => (
                  <div key={bar.segment.item.key} className="contents coarse:hidden">
                    <EventBar
                      bar={bar}
                      columns={7}
                      top={MONTH_CELL_HEADER}
                      surface={`${SURFACE}:${week[0] ?? ""}`}
                      actions={actions}
                    />
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

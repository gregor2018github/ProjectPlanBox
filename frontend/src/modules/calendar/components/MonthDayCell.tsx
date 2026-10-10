import { formatDayLong, type IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import type { DayItems } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { useDayDrop } from "../useDayDrop";
import { EntryChip } from "./EntryChip";
import { EventChip } from "./EventChip";

/** Props for {@link MonthDayCell}. */
export interface MonthDayCellProps {
  date: IsoDate;
  inMonth: boolean;
  isToday: boolean;
  items: DayItems;
  surface: string;
  actions: CalendarActions;
  onOpenDay: (date: IsoDate) => void;
  /** Starts a new all-day event on this day (a click on the cell's empty space). */
  onCreate: (date: IsoDate) => void;
}

/** How many items a cell lists before "+N more". */
const VISIBLE = 3;

/**
 * One day of the month grid. With a mouse it lists items (drag them to other
 * days); on touch screens it shows dots and the whole cell opens the day.
 */
export function MonthDayCell({
  date,
  inMonth,
  isToday,
  items,
  surface,
  actions,
  onOpenDay,
  onCreate,
}: MonthDayCellProps) {
  const { ref, isDropTarget } = useDayDrop(surface, date);
  const chips = [
    ...items.allDay.map((segment) => (
      <EventChip key={segment.item.key} segment={segment} surface={surface} actions={actions} />
    )),
    ...items.timed.map((segment) => (
      <EventChip key={segment.item.key} segment={segment} surface={surface} actions={actions} />
    )),
    ...items.entries.map((entry) => (
      <EntryChip key={entry.key} item={entry} surface={surface} actions={actions} />
    )),
  ];
  const hidden = chips.length > VISIBLE + 1 ? chips.length - VISIBLE : 0;
  const count = chips.length;

  return (
    <div
      ref={ref}
      role="gridcell"
      aria-label={formatDayLong(date)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCreate(date);
      }}
      className={cx(
        "flex min-h-0 min-w-0 flex-col gap-0.5 border-r border-b border-border p-1 transition-colors duration-(--duration-fast) ease-out",
        !inMonth && "bg-sidebar",
        isDropTarget && "bg-accent-subtle",
      )}
    >
      <button
        type="button"
        aria-label={`Open ${formatDayLong(date)}${count > 0 ? `, ${String(count)} items` : ""}`}
        onClick={() => {
          onOpenDay(date);
        }}
        className={cx(
          "flex size-6 shrink-0 items-center justify-center self-start rounded-full text-xs tabular-nums transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:size-11 coarse:self-stretch coarse:rounded-md",
          isToday
            ? "bg-accent font-semibold text-on-accent hover:bg-accent-hover"
            : !inMonth && "text-text-subtle",
        )}
      >
        {Number(date.slice(8))}
      </button>
      <div className="flex min-h-0 flex-col gap-0.5 coarse:hidden">
        {hidden > 0 ? chips.slice(0, VISIBLE) : chips}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => {
              onOpenDay(date);
            }}
            className="h-5 self-start rounded-sm px-1.5 text-xs text-text-muted hover:bg-hover hover:text-text"
          >
            {`+${String(hidden)} more`}
          </button>
        )}
      </div>
      {count > 0 && (
        <span aria-hidden className="hidden flex-wrap justify-center gap-0.5 coarse:flex">
          {Array.from({ length: Math.min(count, 4) }, (_, i) => (
            <span key={i} className="size-1 rounded-full bg-accent" />
          ))}
        </span>
      )}
    </div>
  );
}

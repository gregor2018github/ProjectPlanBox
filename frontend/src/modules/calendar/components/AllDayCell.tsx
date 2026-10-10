import { formatDayLong, type IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import { reservedHeight } from "../barLayout";
import type { DayItems } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { useDayDrop } from "../useDayDrop";
import { EntryChip } from "./EntryChip";
import { EventChip } from "./EventChip";

/** Props for {@link AllDayCell}. */
export interface AllDayCellProps {
  date: IsoDate;
  items: DayItems;
  /** Lanes of multi-day bars laid over the row, above this cell's own items. */
  barLanes: number;
  surface: string;
  actions: CalendarActions;
  /** Starts a new all-day event (a click on the cell's empty space). */
  onCreate: (date: IsoDate) => void;
}

/**
 * A day's all-day events and dated todos above the time grid; accepts drops.
 * Multi-day bars are laid over the row by the grid, so the cell leaves room.
 */
export function AllDayCell({ date, items, barLanes, surface, actions, onCreate }: AllDayCellProps) {
  const { ref, isDropTarget } = useDayDrop(surface, date);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`All day, ${formatDayLong(date)}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCreate(date);
      }}
      className={cx(
        "flex min-h-8 min-w-0 flex-col gap-0.5 border-l border-border p-0.5 transition-colors duration-(--duration-fast) ease-out",
        isDropTarget && "bg-accent-subtle",
      )}
    >
      {barLanes > 0 && (
        <span aria-hidden style={{ height: reservedHeight(barLanes) }} className="shrink-0" />
      )}
      {items.allDay.map((segment) => (
        <EventChip key={segment.item.key} segment={segment} surface={surface} actions={actions} />
      ))}
      {items.entries.map((entry) => (
        <EntryChip key={entry.key} item={entry} surface={surface} actions={actions} />
      ))}
    </div>
  );
}

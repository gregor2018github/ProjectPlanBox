import { formatRelativeDay, formatDayShort, type IsoDate } from "../../../core/time";
import { cx } from "../../../ui/cx";
import type { DayItems } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { useDayDrop } from "../useDayDrop";
import { AgendaEventRow } from "./AgendaEventRow";
import { EntryChip } from "./EntryChip";

/** Props for {@link AgendaDay}. */
export interface AgendaDayProps {
  date: IsoDate;
  today: IsoDate;
  items: DayItems;
  surface: string;
  actions: CalendarActions;
}

/** One day of the agenda: a heading that accepts drops, then events and dated todos. */
export function AgendaDay({ date, today, items, surface, actions }: AgendaDayProps) {
  const { ref, isDropTarget } = useDayDrop(surface, date);
  const relative = formatRelativeDay(date, today);
  const short = formatDayShort(date);
  const empty = items.allDay.length + items.timed.length + items.entries.length === 0;
  return (
    <section
      ref={ref}
      aria-label={relative === short ? short : `${relative}, ${short}`}
      className={cx(
        "flex flex-col gap-0.5 rounded-md transition-colors duration-(--duration-fast) ease-out",
        isDropTarget && "bg-accent-subtle",
      )}
    >
      <h3 className="flex items-baseline gap-2 px-2 pt-2 pb-1 text-sm">
        <span className={cx("font-medium", date === today && "text-accent")}>{relative}</span>
        {relative !== short && <span className="text-text-muted">{short}</span>}
      </h3>
      {empty && <p className="px-2 pb-1 text-sm text-text-muted">Nothing planned.</p>}
      {[...items.allDay, ...items.timed].map((segment) => (
        <AgendaEventRow
          key={segment.item.key}
          segment={segment}
          surface={surface}
          actions={actions}
        />
      ))}
      {items.entries.map((entry) => (
        <EntryChip key={entry.key} item={entry} surface={surface} actions={actions} roomy />
      ))}
    </section>
  );
}

import { Repeat } from "lucide-react";

import { formatMinutes, MINUTES_PER_DAY } from "../../../core/time";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { eventMenuEntries } from "../eventMenu";
import { segmentLabel } from "../format";
import type { DaySegment } from "../types";
import type { CalendarActions } from "../useCalendarActions";
import { useItemDrag } from "../useItemDrag";

/** Props for {@link EventChip}. */
export interface EventChipProps {
  segment: DaySegment;
  /** Which surface shows it (keeps drag ids unique). */
  surface: string;
  actions: CalendarActions;
}

/**
 * A one-line event in a month cell or the all-day row: all-day events are
 * filled, timed ones show a dot and their start. Drag it to another day.
 */
export function EventChip({ segment, surface, actions }: EventChipProps) {
  const { ref, isDragging } = useItemDrag(surface, segment.item, actions);
  const { event } = segment.item;
  const timed = !event.all_day && !(segment.start === 0 && segment.end === MINUTES_PER_DAY);
  return (
    <div ref={ref} className={cx("min-w-0 touch-manipulation", isDragging && "opacity-50")}>
      <ContextMenu entries={eventMenuEntries(segment.item, actions)}>
        <button
          type="button"
          aria-label={segmentLabel(segment)}
          onClick={() => {
            actions.open(segment.item);
          }}
          className={cx(
            "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-xs text-text transition-colors duration-(--duration-fast) ease-out",
            timed ? "hover:bg-hover" : "bg-accent-subtle hover:bg-selected",
          )}
        >
          {timed && (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
              <span className="shrink-0 text-text-muted tabular-nums">
                {formatMinutes(segment.start)}
              </span>
            </>
          )}
          <span className="min-w-0 flex-1 truncate">{event.title}</span>
          {event.rrule !== null && (
            <Repeat size={12} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
          )}
        </button>
      </ContextMenu>
    </div>
  );
}

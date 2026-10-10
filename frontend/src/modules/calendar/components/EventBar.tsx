import { Repeat } from "lucide-react";

import { formatMinutes } from "../../../core/time";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { barStyle } from "../barLayout";
import { eventMenuEntries } from "../eventMenu";
import { segmentLabel } from "../format";
import type { SpanBar } from "../selectors";
import type { CalendarActions } from "../useCalendarActions";
import { useItemDrag } from "../useItemDrag";

/** Props for {@link EventBar}. */
export interface EventBarProps {
  bar: SpanBar;
  /** How many day cells the row has. */
  columns: number;
  /** Px from the row's top to the first lane. */
  top: number;
  /** Which surface shows it; unique per row, since one event can span two rows. */
  surface: string;
  actions: CalendarActions;
  /** Tighter side gutters, matching the time grid's all-day cells. */
  compact?: boolean;
}

/**
 * A multi-day event as one bar across the days it covers in a row. Square
 * ends show that it continues in the previous or next row. Drag it to move
 * its start to another day.
 */
export function EventBar({ bar, columns, top, surface, actions, compact = false }: EventBarProps) {
  const { segment } = bar;
  const { ref, isDragging } = useItemDrag(surface, segment.item, actions);
  const { event } = segment.item;
  const gutter = compact ? "px-0.5" : "px-1";
  return (
    <div
      ref={ref}
      style={barStyle(bar, columns, top)}
      className={cx(
        "absolute min-w-0 touch-manipulation",
        gutter,
        bar.continuesBefore && "pl-0",
        bar.continuesAfter && "pr-0",
        isDragging && "opacity-50",
      )}
    >
      <ContextMenu entries={eventMenuEntries(segment.item, actions)}>
        <button
          type="button"
          aria-label={segmentLabel(segment)}
          onClick={() => {
            actions.open(segment.item);
          }}
          className={cx(
            "flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm bg-accent-subtle px-1.5 text-left text-xs text-text transition-colors duration-(--duration-fast) ease-out hover:bg-selected",
            bar.continuesBefore && "rounded-l-none",
            bar.continuesAfter && "rounded-r-none",
          )}
        >
          {!event.all_day && !bar.continuesBefore && (
            <span className="shrink-0 text-text-muted tabular-nums">
              {formatMinutes(segment.range.start)}
            </span>
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

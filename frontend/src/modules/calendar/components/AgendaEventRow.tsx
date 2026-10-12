import { MapPin, MoreHorizontal, Repeat } from "lucide-react";

import { Checkbox } from "../../../ui/Checkbox";
import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { eventMenuEntries } from "../eventMenu";
import { occurrenceTimeLabel, segmentLabel } from "../format";
import type { DaySegment } from "../types";
import type { CalendarActions } from "../useCalendarActions";
import { useEventDone } from "../useEventDone";
import { useItemDrag } from "../useItemDrag";

/** Props for {@link AgendaEventRow}. */
export interface AgendaEventRowProps {
  segment: DaySegment;
  surface: string;
  actions: CalendarActions;
}

/**
 * An event in the agenda: a tick (done by hand, or by itself once over), its
 * times (the whole range for multi-day events), title and location; drag it
 * onto a day of the mini month.
 */
export function AgendaEventRow({ segment, surface, actions }: AgendaEventRowProps) {
  const { ref, isDragging } = useItemDrag(surface, segment.item, actions);
  const { event } = segment.item;
  const done = useEventDone(segment.item);
  const entries = eventMenuEntries(segment.item, actions, done);
  return (
    <div ref={ref} className={cx("touch-manipulation", isDragging && "opacity-50")}>
      <ContextMenu entries={entries}>
        <div className="group flex items-stretch gap-3 rounded-md px-2 py-1.5 transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11">
          <span
            aria-hidden
            className={cx("w-1 shrink-0 rounded-full", done ? "bg-border-strong" : "bg-accent")}
          />
          <span className="flex items-center self-center">
            <Checkbox
              size="sm"
              checked={done}
              label={`${done ? "Mark not done" : "Mark done"}: “${event.title}”`}
              onCheckedChange={() => {
                actions.toggleDone(segment.item);
              }}
            />
          </span>
          <button
            type="button"
            aria-label={segmentLabel(segment)}
            onClick={() => {
              actions.open(segment.item);
            }}
            className="flex min-w-0 flex-1 flex-col text-left"
          >
            <span className={cx("truncate text-base", done && "text-text-muted line-through")}>
              {event.title}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted tabular-nums">
              <span className="whitespace-nowrap">{occurrenceTimeLabel(segment)}</span>
              {event.rrule !== null && <Repeat size={12} strokeWidth={1.75} aria-hidden />}
              {event.location !== "" && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  <span className="truncate">{event.location}</span>
                </span>
              )}
            </span>
          </button>
          <Menu
            entries={entries}
            trigger={
              <button
                type="button"
                aria-label={`Actions for “${event.title}”`}
                className="inline-flex size-7 shrink-0 items-center justify-center self-center rounded-md text-text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-text focus-visible:opacity-100 coarse:size-11 coarse:opacity-100"
              >
                <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
              </button>
            }
          />
        </div>
      </ContextMenu>
    </div>
  );
}

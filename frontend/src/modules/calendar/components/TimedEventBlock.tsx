import { Repeat } from "lucide-react";
import type { PointerEvent } from "react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { eventMenuEntries } from "../eventMenu";
import { segmentLabel, segmentTimeLabel } from "../format";
import type { PlacedSegment } from "../selectors";
import { PX_PER_MINUTE } from "../timeGrid";
import type { CalendarActions } from "../useCalendarActions";

/** Props for {@link TimedEventBlock}. */
export interface TimedEventBlockProps {
  segment: PlacedSegment;
  /** Whether this is the occurrence's last day (only that one can be resized). */
  resizable: boolean;
  /** Being dragged: shown faded while the preview follows the pointer. */
  dragging: boolean;
  actions: CalendarActions;
  onGesture: (segment: PlacedSegment, mode: "move" | "resize", event: PointerEvent) => void;
  onOpen: (segment: PlacedSegment) => void;
}

/**
 * An event in the time grid, placed in its lane. Drag it to move it (also to
 * another day), drag its bottom edge to resize; click or Enter opens it.
 */
export function TimedEventBlock({
  segment,
  resizable,
  dragging,
  actions,
  onGesture,
  onOpen,
}: TimedEventBlockProps) {
  const { event } = segment.item;
  const height = Math.max((segment.end - segment.start) * PX_PER_MINUTE, 18);
  const short = height < 40;
  return (
    <ContextMenu entries={eventMenuEntries(segment.item, actions)}>
      <button
        type="button"
        aria-label={segmentLabel(segment)}
        onPointerDown={(e) => {
          onGesture(segment, "move", e);
        }}
        onClick={() => {
          onOpen(segment);
        }}
        style={{
          top: segment.start * PX_PER_MINUTE,
          height,
          left: `${String((segment.lane / segment.lanes) * 100)}%`,
          width: `calc(${String(100 / segment.lanes)}% - 2px)`,
        }}
        className={cx(
          "absolute flex flex-col overflow-hidden rounded-sm border-l-3 border-accent bg-accent-subtle px-1.5 text-left text-xs text-text transition-[opacity,box-shadow] duration-(--duration-fast) ease-out select-none hover:shadow-sm",
          short ? "flex-row items-center gap-1.5" : "py-0.5",
          dragging && "opacity-40",
        )}
      >
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <span className="truncate">{event.title}</span>
          {event.rrule !== null && (
            <Repeat size={11} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
          )}
        </span>
        {!short && (
          <span className="truncate text-text-muted tabular-nums">{segmentTimeLabel(segment)}</span>
        )}
        {resizable && (
          <span
            aria-hidden
            onPointerDown={(e) => {
              e.stopPropagation();
              onGesture(segment, "resize", e);
            }}
            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none coarse:h-3"
          />
        )}
      </button>
    </ContextMenu>
  );
}

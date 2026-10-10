import type { MouseEvent, PointerEvent } from "react";

import { formatDayLong, formatMinutes, type IsoDate } from "../../../core/time";
import type { PlacedSegment } from "../selectors";
import { PX_PER_MINUTE, type MinuteSpan } from "../timeGrid";
import type { CalendarActions } from "../useCalendarActions";
import { TimedEventBlock } from "./TimedEventBlock";

/** Props for {@link TimeGridColumn}. */
export interface TimeGridColumnProps {
  date: IsoDate;
  segments: readonly PlacedSegment[];
  /** Keys of segments that are the last day of their occurrence. */
  lastDayKeys: ReadonlySet<string>;
  /** Minutes since midnight of the current time, when this column is today. */
  nowMinutes: number | null;
  /** The span being dragged or selected in this column, with its label. */
  preview: (MinuteSpan & { label: string }) | null;
  draggingKey: string | null;
  actions: CalendarActions;
  onGesture: (segment: PlacedSegment, mode: "move" | "resize", event: PointerEvent) => void;
  onBackgroundPointerDown: (date: IsoDate, event: PointerEvent<HTMLDivElement>) => void;
  onBackgroundClick: (date: IsoDate, event: MouseEvent<HTMLDivElement>) => void;
  onOpen: (segment: PlacedSegment) => void;
}

/** One day of the time grid: its events in lanes, the now line and a drag preview. */
export function TimeGridColumn({
  date,
  segments,
  lastDayKeys,
  nowMinutes,
  preview,
  draggingKey,
  actions,
  onGesture,
  onBackgroundPointerDown,
  onBackgroundClick,
  onOpen,
}: TimeGridColumnProps) {
  return (
    <div
      data-day={date}
      role="group"
      aria-label={formatDayLong(date)}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onBackgroundPointerDown(date, event);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onBackgroundClick(date, event);
      }}
      className="relative border-l border-border"
    >
      {segments.map((segment) => (
        <TimedEventBlock
          key={segment.item.key}
          segment={segment}
          resizable={lastDayKeys.has(segment.item.key)}
          dragging={draggingKey === segment.item.key}
          actions={actions}
          onGesture={onGesture}
          onOpen={onOpen}
        />
      ))}
      {preview && (
        <div
          aria-hidden
          style={{
            top: preview.start * PX_PER_MINUTE,
            height: Math.max((preview.end - preview.start) * PX_PER_MINUTE, 18),
          }}
          className="pointer-events-none absolute inset-x-0.5 z-10 flex flex-col rounded-sm bg-accent px-1.5 py-0.5 text-xs text-on-accent shadow-md"
        >
          <span className="truncate font-medium">{preview.label}</span>
          <span className="tabular-nums">
            {`${formatMinutes(preview.start)}–${formatMinutes(preview.end)}`}
          </span>
        </div>
      )}
      {nowMinutes !== null && (
        <div
          aria-hidden
          style={{ top: nowMinutes * PX_PER_MINUTE }}
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-accent"
        >
          <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}

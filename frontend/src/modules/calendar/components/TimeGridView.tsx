import { useEffect, useMemo, useRef } from "react";

import {
  addDays,
  daysBetween,
  formatDayLong,
  formatMinutes,
  isoWeekday,
  zonedInstant,
  zonedParts,
  type IsoDate,
} from "../../../core/time";
import { cx } from "../../../ui/cx";
import { newDraft, type EventDraft } from "../draft";
import { layoutDay, segmentsOf, type DayItems, type PlacedSegment } from "../selectors";
import { HOUR_HEIGHT, minutesAt, PX_PER_MINUTE, selection, type MinuteSpan } from "../timeGrid";
import { occurrenceTiming } from "../timing";
import type { CalendarActions } from "../useCalendarActions";
import { useTimeGridGestures } from "../useTimeGridGestures";
import { AllDayCell } from "./AllDayCell";
import { TimeGridColumn } from "./TimeGridColumn";

/** Props for {@link TimeGridView}. */
export interface TimeGridViewProps {
  /** One day (day view) or seven (week view). */
  days: readonly IsoDate[];
  today: IsoDate;
  now: { date: IsoDate; minutes: number };
  byDay: ReadonlyMap<IsoDate, DayItems>;
  actions: CalendarActions;
  /** Opens a day (week view headers); absent in the day view. */
  onOpenDay?: (date: IsoDate) => void;
  onCreate: (draft: EventDraft) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const EMPTY: DayItems = { allDay: [], timed: [], entries: [] };
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SURFACE = "grid";

/**
 * Week and day views: day headers, an all-day row, and a 24-hour grid where
 * events can be created, moved and resized by dragging in 15-minute steps.
 */
export function TimeGridView({
  days,
  today,
  now,
  byDay,
  actions,
  onOpenDay,
  onCreate,
}: TimeGridViewProps) {
  const timeZone = actions.timeZone;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const columns = `3.5rem repeat(${String(days.length)}, minmax(0, 1fr))`;

  const placed = useMemo(
    () => new Map(days.map((d) => [d, layoutDay((byDay.get(d) ?? EMPTY).timed)])),
    [days, byDay],
  );
  const lastDays = useMemo(() => {
    const result = new Map<IsoDate, Set<string>>();
    for (const [day, segments] of placed) {
      result.set(
        day,
        new Set(
          segments
            .filter((s) => segmentsOf(s.item, timeZone).at(-1)?.date === day)
            .map((s) => s.item.key),
        ),
      );
    }
    return result;
  }, [placed, timeZone]);

  const moveTo = (segment: PlacedSegment, date: IsoDate, span: MinuteSpan) => {
    const t = occurrenceTiming(segment.item.event, segment.item.occurrence);
    const start = zonedParts(t.start_at ?? "", timeZone);
    const shift = daysBetween(segment.date, date);
    const startAt = zonedInstant(
      addDays(start.date, shift),
      start.minutes + span.start - segment.start,
      timeZone,
    );
    const length = Date.parse(t.end_at ?? "") - Date.parse(t.start_at ?? "");
    const endAt = new Date(Date.parse(startAt) + length).toISOString();
    if (startAt === t.start_at) return;
    void actions.change(segment.item, {
      timing: {
        all_day: false,
        start_at: startAt,
        end_at: endAt,
        start_date: null,
        end_date: null,
      },
    });
  };
  const resizeTo = (segment: PlacedSegment, span: MinuteSpan) => {
    const t = occurrenceTiming(segment.item.event, segment.item.occurrence);
    const endAt = zonedInstant(segment.date, span.end, timeZone);
    if (endAt === t.end_at) return;
    void actions.change(segment.item, {
      timing: {
        all_day: false,
        start_at: t.start_at,
        end_at: endAt,
        start_date: null,
        end_date: null,
      },
    });
  };

  const { gesture, startSegment, startSelect, consumeClick, offsetY, bodyHandlers } =
    useTimeGridGestures({
      bodyRef,
      onMove: moveTo,
      onResize: resizeTo,
      onSelect: (date, span) => {
        onCreate(newDraft(date, span));
      },
    });

  // Start scrolled to the working day (or to just before now when today is shown).
  const showsToday = days.includes(today);
  useEffect(() => {
    const minutes = showsToday ? now.minutes - 90 : 7 * 60 - 30;
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(minutes, 0) * PX_PER_MINUTE;
    // Only on mount and when the visible days change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], showsToday]);

  const previewFor = (date: IsoDate) => {
    if (!gesture?.moved) return null;
    if (gesture.kind === "select") {
      return gesture.date === date
        ? { ...selection(gesture.fromY, gesture.toY), label: "New event" }
        : null;
    }
    const target = gesture.kind === "resize" ? gesture.segment.date : gesture.date;
    return target === date ? { ...gesture.span, label: gesture.segment.item.event.title } : null;
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="sticky top-0 z-20 grid border-b border-border bg-bg"
        style={{ gridTemplateColumns: columns }}
      >
        <span />
        {days.map((day) => {
          const label = (
            <>
              <span className="text-xs text-text-muted">{WEEKDAY_NAMES[isoWeekday(day) - 1]}</span>
              <span
                className={cx(
                  "flex size-7 items-center justify-center rounded-full text-base tabular-nums",
                  day === today && "bg-accent font-semibold text-on-accent",
                )}
              >
                {Number(day.slice(8))}
              </span>
            </>
          );
          return onOpenDay ? (
            <button
              key={day}
              type="button"
              aria-label={`Open ${formatDayLong(day)}`}
              onClick={() => {
                onOpenDay(day);
              }}
              className="flex items-center justify-center gap-1.5 border-l border-border py-1.5 transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11"
            >
              {label}
            </button>
          ) : (
            <span
              key={day}
              className="flex items-center justify-center gap-1.5 border-l border-border py-1.5"
            >
              {label}
            </span>
          );
        })}
        <span className="self-center pr-2 text-right text-xs text-text-muted">All day</span>
        {days.map((day) => (
          <AllDayCell
            key={day}
            date={day}
            items={byDay.get(day) ?? EMPTY}
            surface={SURFACE}
            actions={actions}
            onCreate={(date) => {
              onCreate(newDraft(date));
            }}
          />
        ))}
      </div>

      <div
        ref={bodyRef}
        className="relative grid"
        style={{ gridTemplateColumns: columns, height: 24 * HOUR_HEIGHT }}
        {...bodyHandlers}
      >
        <div aria-hidden className="relative">
          {HOURS.slice(1).map((h) => (
            <span
              key={h}
              style={{ top: h * HOUR_HEIGHT - 8 }}
              className="absolute right-2 text-xs text-text-muted tabular-nums"
            >
              {formatMinutes(h * 60)}
            </span>
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 left-14">
          {HOURS.slice(1).map((h) => (
            <div
              key={h}
              style={{ top: h * HOUR_HEIGHT }}
              className="absolute inset-x-0 border-t border-border"
            />
          ))}
        </div>
        {days.map((day) => (
          <TimeGridColumn
            key={day}
            date={day}
            segments={placed.get(day) ?? []}
            lastDayKeys={lastDays.get(day) ?? new Set()}
            nowMinutes={day === now.date ? now.minutes : null}
            preview={previewFor(day)}
            draggingKey={
              gesture !== null && gesture.kind !== "select" && gesture.moved
                ? gesture.segment.item.key
                : null
            }
            actions={actions}
            onGesture={startSegment}
            onBackgroundPointerDown={startSelect}
            onBackgroundClick={(date, event) => {
              if (consumeClick()) return;
              const start = Math.floor(minutesAt(offsetY(event.clientY)) / 30) * 30;
              onCreate(newDraft(date, { start, end: start + 60 }));
            }}
            onOpen={(segment) => {
              if (!consumeClick()) actions.open(segment.item);
            }}
          />
        ))}
      </div>
    </div>
  );
}

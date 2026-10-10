import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

import type { IsoDate } from "../../core/time";
import type { PlacedSegment } from "./selectors";
import { DRAG_THRESHOLD_PX, moveBy, resizeBy, selection, type MinuteSpan } from "./timeGrid";

/** A drag in progress in the time grid. */
export type Gesture =
  | {
      kind: "move" | "resize";
      segment: PlacedSegment;
      x: number;
      y: number;
      date: IsoDate;
      span: MinuteSpan;
      moved: boolean;
    }
  | {
      kind: "select";
      date: IsoDate;
      x: number;
      y: number;
      fromY: number;
      toY: number;
      moved: boolean;
    };

/** What a finished gesture does. */
export interface GestureHandlers {
  bodyRef: RefObject<HTMLElement | null>;
  onMove: (segment: PlacedSegment, date: IsoDate, span: MinuteSpan) => void;
  onResize: (segment: PlacedSegment, span: MinuteSpan) => void;
  onSelect: (date: IsoDate, span: MinuteSpan) => void;
}

function dayAt(x: number, y: number): IsoDate | null {
  const element = document.elementFromPoint(x, y)?.closest("[data-day]");
  return element?.getAttribute("data-day") ?? null;
}

function capture(event: PointerEvent): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Without capture (e.g. a synthetic event) the gesture still ends on pointerup here.
  }
}

/**
 * Pointer gestures of the time grid: drag an event (move, also across days),
 * drag its bottom edge (resize), or drag over empty space (select a span to
 * create). Touch drags on events and empty space are left to scrolling; a tap
 * still opens or creates. A click right after a drag is swallowed.
 */
export function useTimeGridGestures({ bodyRef, onMove, onResize, onSelect }: GestureHandlers) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const current = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);

  const update = (next: Gesture | null) => {
    current.current = next;
    setGesture(next);
  };
  const offsetY = (clientY: number) =>
    clientY - (bodyRef.current?.getBoundingClientRect().top ?? 0);

  const startSegment = (segment: PlacedSegment, mode: "move" | "resize", event: PointerEvent) => {
    if (event.button !== 0 || (mode === "move" && event.pointerType === "touch")) return;
    capture(event);
    update({
      kind: mode,
      segment,
      x: event.clientX,
      y: event.clientY,
      date: segment.date,
      span: { start: segment.start, end: segment.end },
      moved: false,
    });
  };

  const startSelect = (date: IsoDate, event: PointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    capture(event);
    const y = offsetY(event.clientY);
    update({
      kind: "select",
      date,
      x: event.clientX,
      y: event.clientY,
      fromY: y,
      toY: y,
      moved: false,
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    const g = current.current;
    if (g === null) return;
    const moved =
      g.moved ||
      Math.abs(event.clientY - g.y) > DRAG_THRESHOLD_PX ||
      Math.abs(event.clientX - g.x) > DRAG_THRESHOLD_PX;
    if (g.kind === "select") {
      update({ ...g, toY: offsetY(event.clientY), moved });
      return;
    }
    const original = { start: g.segment.start, end: g.segment.end };
    const deltaY = event.clientY - g.y;
    if (g.kind === "resize") {
      update({ ...g, span: resizeBy(original, deltaY), moved });
    } else {
      const date = dayAt(event.clientX, event.clientY) ?? g.date;
      update({ ...g, span: moveBy(original, deltaY), date, moved });
    }
  };

  const onPointerUp = () => {
    const g = current.current;
    update(null);
    if (!g?.moved) return;
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    if (g.kind === "select") onSelect(g.date, selection(g.fromY, g.toY));
    else if (g.kind === "resize") onResize(g.segment, g.span);
    else onMove(g.segment, g.date, g.span);
  };

  const onPointerCancel = () => {
    update(null);
  };

  /** True (once) when the click that follows a drag should be ignored. */
  const consumeClick = useCallback(() => {
    const swallow = swallowClick.current;
    swallowClick.current = false;
    return swallow;
  }, []);

  return {
    gesture,
    startSegment,
    startSelect,
    consumeClick,
    offsetY,
    bodyHandlers: { onPointerMove, onPointerUp, onPointerCancel },
  };
}

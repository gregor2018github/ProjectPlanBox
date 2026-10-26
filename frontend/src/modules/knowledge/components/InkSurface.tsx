import { useRef, type PointerEvent } from "react";

import { cx } from "../../../ui/cx";
import { cleanPath, strokePath, type Pen } from "../ink";
import { inkClass } from "./inkClass";

/** Props for {@link InkSurface}. */
export interface InkSurfaceProps {
  tool: "pen" | "eraser";
  pen: Pen;
  /** A finished stroke, as whole page points. */
  onStroke: (points: [number, number][]) => void;
  /** The eraser passed over this page point. */
  onErase: (x: number, y: number) => void;
  /** The eraser was lifted (one erase gesture is one undo). */
  onEraseEnd: () => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * A sheet over the whole page while a pen or the eraser is in hand: drawing
 * on it makes strokes, rubbing makes them go. One pointer at a time; once a
 * stylus has touched it, fingers are ignored (a resting palm draws nothing).
 */
export function InkSurface({ tool, pen, onStroke, onErase, onEraseEnd }: InkSurfaceProps) {
  const active = useRef<number | null>(null);
  const points = useRef<Point[]>([]);
  const sawStylus = useRef(false);
  const liveRef = useRef<SVGPathElement>(null);

  const pointsOf = (event: PointerEvent<HTMLDivElement>): Point[] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const native = event.nativeEvent;
    const events =
      typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    return (events.length > 0 ? events : [native]).map((e) => ({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }));
  };

  const draw = () => {
    liveRef.current?.setAttribute(
      "d",
      strokePath(points.current.flatMap((p) => [Math.round(p.x), Math.round(p.y)])),
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || active.current !== null) return;
    if (event.pointerType === "pen") sawStylus.current = true;
    else if (event.pointerType === "touch" && sawStylus.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = event.pointerId;
    points.current = pointsOf(event);
    if (tool === "pen") draw();
    else for (const p of points.current) onErase(p.x, p.y);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    const next = pointsOf(event);
    if (tool === "pen") {
      points.current.push(...next);
      draw();
    } else {
      for (const p of next) onErase(p.x, p.y);
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    active.current = null;
    const path = points.current;
    points.current = [];
    if (tool === "eraser") {
      onEraseEnd();
      return;
    }
    liveRef.current?.setAttribute("d", "");
    const clean = cleanPath(path);
    if (clean.length > 0) onStroke(clean);
  };

  return (
    <div
      data-ink-surface
      role="application"
      aria-label={tool === "pen" ? "Drawing surface" : "Eraser surface"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cx(
        "absolute inset-0 z-20 touch-none",
        tool === "pen" ? "cursor-crosshair" : "cursor-cell",
      )}
    >
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <path
          ref={liveRef}
          fill="none"
          strokeWidth={pen.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={inkClass[pen.color]}
        />
      </svg>
    </div>
  );
}

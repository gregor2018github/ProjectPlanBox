import { BringToFront, SendToBack, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cx } from "../../../ui/cx";
import { IconButton } from "../../../ui/IconButton";
import { drawingBounds, strokePath, thickest } from "../ink";
import type { PageDrawing } from "../types";
import { inkClass } from "./inkClass";

/** Props for {@link DrawingLayer}. */
export interface DrawingLayerProps {
  drawing: PageDrawing;
  /** Whether the drawing is picked (it shows a frame and its actions). */
  selected: boolean;
  /** Whether it reacts to the pointer (not while a pen or the eraser is in hand). */
  interactive: boolean;
  onSelect: (id: string | null) => void;
  /** Moves the drawing so its points' top left sits at x/y. */
  onMove: (id: string, x: number, y: number) => void;
  onRestack: (id: string, to: "front" | "back") => void;
  /** Deletes the drawing (undoable). */
  onRemove: (id: string) => void;
}

/** How far around a stroke a click still picks it (pixels). */
const HIT = 8;
/** Keyboard steps for moving (Shift for the big one). */
const STEP = 8;
const BIG_STEP = 40;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
}

/**
 * One drawing on a page, above the boxes: its strokes, drawn smooth. Click
 * (or tap) a stroke to pick the drawing and drag to move it; once picked,
 * drag anywhere in its frame, use the arrow keys, bring it to the front or
 * send it back, or delete it.
 */
export function DrawingLayer({
  drawing,
  selected,
  interactive,
  onSelect,
  onMove,
  onRestack,
  onRemove,
}: DrawingLayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (selected) frameRef.current?.focus({ preventScroll: true });
  }, [selected]);

  const bounds = drawingBounds(drawing);
  const pad = Math.ceil(thickest(drawing) / 2) + HIT;
  const left = bounds.x - pad + (offset?.dx ?? 0);
  const top = bounds.y - pad + (offset?.dy ?? 0);
  const width = bounds.width + 2 * pad;
  const height = bounds.height + 2 * pad;

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    onSelect(drawing.id);
  };
  const delta = (d: Drag, event: PointerEvent) => ({
    dx: Math.max(-bounds.x, Math.round(event.clientX - d.startX)),
    dy: Math.max(-bounds.y, Math.round(event.clientY - d.startY)),
  });
  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    setOffset(delta(d, event));
  };
  const endDrag = (event: PointerEvent) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    drag.current = null;
    setOffset(null);
    const { dx, dy } = delta(d, event);
    if (dx !== 0 || dy !== 0) onMove(drawing.id, bounds.x + dx, bounds.y + dy);
  };
  const dragHandlers = {
    onPointerDown: startDrag,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      onMove(drawing.id, bounds.x + move[0], bounds.y + move[1]);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(drawing.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(null);
    }
  };

  return (
    <div
      data-drawing-id={drawing.id}
      className={cx("pointer-events-none absolute", offset !== null && "z-10")}
      style={{ left, top, width, height }}
    >
      <svg
        aria-hidden
        width={width}
        height={height}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <g
          transform={`translate(${String(pad - bounds.x + drawing.x)} ${String(pad - bounds.y + drawing.y)})`}
        >
          {drawing.strokes.map((stroke, index) => {
            const d = strokePath(stroke.points);
            return (
              <g key={index}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={inkClass[stroke.color]}
                />
                {interactive && (
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={stroke.width + 2 * HIT}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="stroke"
                    className="cursor-pointer touch-none stroke-transparent"
                    {...dragHandlers}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {selected && interactive && (
        <>
          <div
            ref={frameRef}
            role="button"
            tabIndex={0}
            aria-label="Drawing (drag or arrow keys to move; Delete removes it)"
            onKeyDown={onKeyDown}
            {...dragHandlers}
            className={cx(
              "pointer-events-auto absolute inset-0 touch-none rounded-md border border-dashed border-accent",
              offset === null ? "cursor-grab" : "cursor-grabbing",
            )}
          />
          <div className="pointer-events-auto absolute right-0 bottom-full mb-1 flex rounded-md border border-border bg-surface-raised shadow-md">
            <IconButton
              label="Bring to front"
              icon={BringToFront}
              onClick={() => {
                onRestack(drawing.id, "front");
              }}
            />
            <IconButton
              label="Send to back"
              icon={SendToBack}
              onClick={() => {
                onRestack(drawing.id, "back");
              }}
            />
            <IconButton
              label="Delete drawing"
              icon={Trash2}
              onClick={() => {
                onRemove(drawing.id);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cx } from "./cx";
import { HEAT_CLASSES, heatLevel } from "./heat";

/** One cell of a {@link HeatGrid}. */
export interface HeatCell {
  key: string;
  value: number;
  /** The readout for this cell, e.g. "Thu 8 Oct: 5 added, 2 completed". */
  label: string;
}

/** One column of a {@link HeatGrid}; `null` cells are blank (e.g. days after today). */
export interface HeatColumn {
  key: string;
  /** Short label above the column, e.g. a month name where a month starts. */
  tick?: string | undefined;
  cells: readonly (HeatCell | null)[];
}

/** Props for {@link HeatGrid}. */
export interface HeatGridProps {
  /** Accessible name, e.g. "Activity over the last year". */
  label: string;
  columns: readonly HeatColumn[];
  /** One label per row ("" hides it), e.g. weekdays. */
  rowLabels: readonly string[];
  /** Cell size: small for a year of days, medium for a week of hours. */
  size?: "sm" | "md";
  /** The cell the readout starts on, as [column, row]; defaults to the last cell. */
  initial?: readonly [number, number] | undefined;
}

const CELL_SIZE = { sm: "size-3", md: "size-5" } as const;
const ROW_HEIGHT = { sm: "h-3", md: "h-5" } as const;

function lastCell(columns: readonly HeatColumn[]): [number, number] {
  for (let c = columns.length - 1; c >= 0; c -= 1) {
    const cells = columns[c]?.cells ?? [];
    for (let r = cells.length - 1; r >= 0; r -= 1) if (cells[r]) return [c, r];
  }
  return [0, 0];
}

/**
 * A matrix of cells shaded on a one-hue ramp: a year of days (weeks as
 * columns) or a week of hours. The readout names the cell under the pointer,
 * the tapped one or the one picked with the arrow keys, so nothing is
 * hover-only.
 */
export function HeatGrid({ label, columns, rowLabels, size = "sm", initial }: HeatGridProps) {
  const [picked, setPicked] = useState<readonly [number, number] | null>(null);
  const [col, row] = picked ?? initial ?? lastCell(columns);
  const max = Math.max(0, ...columns.flatMap((c) => c.cells.map((cell) => cell?.value ?? 0)));
  const current = columns[col]?.cells[row] ?? null;
  const scroller = useRef<HTMLDivElement>(null);

  // On narrow screens the grid scrolls sideways; start at the latest columns.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const handleKeyDown = (event: KeyboardEvent) => {
    const move = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = [col + (move[0] ?? 0), row + (move[1] ?? 0)] as const;
    if (columns[next[0]]?.cells[next[1]]) setPicked(next);
  };

  return (
    <figure className="flex flex-col gap-2">
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="flex w-max gap-1">
          <div aria-hidden className="flex flex-col gap-0.5 pt-4 text-xs text-text-muted">
            {rowLabels.map((text, r) => (
              <span key={r} className={cx("flex items-center pr-1", ROW_HEIGHT[size])}>
                {text}
              </span>
            ))}
          </div>
          <div
            role="group"
            aria-label={`${label}. Use the arrow keys to read each cell.`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="flex gap-0.5 rounded-sm"
          >
            {columns.map((column, c) => (
              <div key={column.key} className="flex flex-col gap-0.5">
                <span aria-hidden className="h-4 text-xs whitespace-nowrap text-text-muted">
                  {column.tick}
                </span>
                {column.cells.map((cell, r) =>
                  cell === null ? (
                    <span key={r} className={CELL_SIZE[size]} />
                  ) : (
                    <span
                      key={cell.key}
                      onPointerEnter={() => {
                        setPicked([c, r]);
                      }}
                      onPointerDown={() => {
                        setPicked([c, r]);
                      }}
                      className={cx(
                        "rounded-xs",
                        CELL_SIZE[size],
                        HEAT_CLASSES[heatLevel(cell.value, max)],
                        c === col && r === row && "ring-2 ring-text-muted",
                      )}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <figcaption aria-live="polite" className="min-w-0">
          {current?.label}
        </figcaption>
        <span aria-hidden className="flex items-center gap-1 text-xs">
          Less
          {HEAT_CLASSES.map((cls) => (
            <span key={cls} className={cx("size-2.5 rounded-xs", cls)} />
          ))}
          More
        </span>
      </div>
    </figure>
  );
}

import { useState, type KeyboardEvent } from "react";

import { cx } from "./cx";

/** One series of a {@link ColumnChart}: the accent for the story, muted for context. */
export interface ChartSeries {
  name: string;
  tone: "accent" | "muted";
}

/** One column (group) of a {@link ColumnChart}. */
export interface ColumnDatum {
  key: string;
  /** Full label for the readout, e.g. "Week of 6 Oct". */
  label: string;
  /** Short axis label under the column; leave empty to skip it. */
  tick?: string | undefined;
  /** One value per series, in series order. */
  values: readonly number[];
}

/** Props for {@link ColumnChart}. */
export interface ColumnChartProps {
  /** Accessible name, e.g. "Todos added and completed per week". */
  label: string;
  series: readonly ChartSeries[];
  data: readonly ColumnDatum[];
  /** Formats values in the readout and on the axis. */
  format?: (value: number) => string;
}

const TONES = { accent: "bg-accent", muted: "bg-chart-muted" } as const;

/**
 * Columns over time or categories, grouped when there are two series. The
 * readout under the chart names the column under the pointer, the tapped
 * one or the one picked with the arrow keys (the last one by default), so
 * no value is hover-only. A hidden table repeats the data for screen readers.
 */
export function ColumnChart({ label, series, data, format = String }: ColumnChartProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const active = Math.min(picked ?? data.length - 1, data.length - 1);
  const max = Math.max(0, ...data.flatMap((d) => d.values));
  const current = data[active];

  const handleKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -active, End: data.length - 1 - active }[
      event.key
    ];
    if (step === undefined) return;
    event.preventDefault();
    setPicked(Math.min(data.length - 1, Math.max(0, active + step)));
  };

  return (
    <figure className="flex flex-col gap-2">
      {series.length > 1 && (
        <ul aria-hidden className="flex flex-wrap gap-4 text-sm text-text-muted">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className={cx("size-2.5 rounded-xs", TONES[s.tone])} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <div
          aria-hidden
          className="flex w-6 shrink-0 flex-col justify-between pb-5 text-right text-xs text-text-muted tabular-nums"
        >
          <span>{format(max)}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            role="group"
            aria-label={`${label}. Use the arrow keys to read each column.`}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerLeave={(event) => {
              // Touch fires a leave after every tap; keep the tapped column then.
              if (event.pointerType === "mouse") setPicked(null);
            }}
            className="flex h-32 items-stretch border-y border-t-border border-b-border-strong"
          >
            {data.map((datum, index) => (
              <div
                key={datum.key}
                onPointerEnter={() => {
                  setPicked(index);
                }}
                onPointerDown={() => {
                  setPicked(index);
                }}
                className={cx(
                  "flex min-w-0 flex-1 items-end justify-center gap-0.5 rounded-t-sm px-px transition-colors duration-(--duration-fast)",
                  index === active && "bg-hover",
                )}
              >
                {datum.values.map((value, s) => (
                  <div
                    key={series[s]?.name ?? s}
                    className={cx(
                      "w-full max-w-6 rounded-t-xs",
                      TONES[series[s]?.tone ?? "accent"],
                      value > 0 && "min-h-0.5",
                    )}
                    style={{ height: `${max > 0 ? (value / max) * 100 : 0}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div aria-hidden className="flex h-4 text-xs text-text-muted">
            {data.map((datum) => (
              <span
                key={datum.key}
                className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
              >
                {datum.tick}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption aria-live="polite" className="text-sm text-text-muted">
        {current && (
          <>
            <span className="text-text">{current.label}</span>
            {series.map((s, i) => (
              <span key={s.name}>
                {" · "}
                {s.name}{" "}
                <span className="text-text tabular-nums">{format(current.values[i] ?? 0)}</span>
              </span>
            ))}
          </>
        )}
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row">{datum.label}</th>
              {datum.values.map((value, i) => (
                <td key={series[i]?.name ?? i}>{format(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

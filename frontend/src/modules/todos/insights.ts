/** Pure shaping of GET /api/todos/stats into what the Insights charts take. */
import { formatCount } from "../../core/insights/format";
import { addDays, formatDayShort, formatMonthShort, WEEKDAYS_SHORT } from "../../core/time";
import type { ColumnDatum } from "../../ui/ColumnChart";
import type { HeatColumn } from "../../ui/HeatGrid";
import type { TodoStats } from "./types";

/** The weekly flow as columns: completed (the story) next to added (context). */
export function weekColumns(weeks: TodoStats["weeks"]): ColumnDatum[] {
  return weeks.map((week) => {
    const days = Array.from({ length: 7 }, (_, d) => addDays(week.start, d));
    const first = days.find((date) => date.endsWith("-01"));
    return {
      key: week.start,
      label: `Week of ${formatDayShort(week.start)}`,
      tick: first === undefined ? undefined : formatMonthShort(first),
      values: [week.completed, week.added],
    };
  });
}

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** The punch card as heat columns: one per hour, weekdays top to bottom. */
export function punchcardColumns(punchcard: TodoStats["punchcard"]): HeatColumn[] {
  return Array.from({ length: 24 }, (_, h) => ({
    key: String(h),
    tick: h % 3 === 0 ? String(h).padStart(2, "0") : undefined,
    cells: WEEKDAYS_SHORT.map((name, weekday) => {
      const count = punchcard[weekday]?.[h] ?? 0;
      return {
        key: `${name}-${String(h)}`,
        value: count,
        label: `${name} ${hour(h)}–${hour(h + 1)} · ${formatCount(count)} completed`,
      };
    }),
  }));
}

/** Where in the punch card the most got done, e.g. "Tue 09:00–10:00". */
export function peakHour(
  punchcard: TodoStats["punchcard"],
): [weekday: number, hour: number] | null {
  let best: [number, number] | null = null;
  let top = 0;
  punchcard.forEach((row, weekday) => {
    row.forEach((count, h) => {
      if (count > top) {
        top = count;
        best = [weekday, h];
      }
    });
  });
  return best;
}

/** Completions per weekday (Monday first), summed from the punch card. */
export function completionsByWeekday(punchcard: TodoStats["punchcard"]): number[] {
  return WEEKDAYS_SHORT.map((_, weekday) =>
    (punchcard[weekday] ?? []).reduce((sum, count) => sum + count, 0),
  );
}

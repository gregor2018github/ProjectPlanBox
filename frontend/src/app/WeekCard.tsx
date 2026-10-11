import { useMemo } from "react";

import { ColumnChart } from "../ui/ColumnChart";
import { activeStreaks, activityRange } from "../core/insights/activity";
import { formatCount, plural } from "../core/insights/format";
import { useActivity } from "../core/insights/insightsQueries";
import { INSIGHTS_PATH } from "./paths";
import { addDays, formatDayShort, isoWeekday, WEEKDAYS_SHORT } from "../core/time";
import { useToday } from "../core/useToday";
import { HomeCard } from "../core/home/HomeCard";

const SERIES = [
  { name: "Completed", tone: "accent" },
  { name: "Added", tone: "muted" },
] as const;

/**
 * The last seven days across every module: what was completed and added
 * each day, and the active-day streak. Shares the Insights activity cache.
 */
export function WeekCard() {
  const today = useToday();
  const { data } = useActivity(today === null ? null : activityRange(today));

  const week = useMemo(() => {
    if (!data || today === null) return null;
    const byDate = new Map(data.days.map((d) => [d.date, d]));
    const columns = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      const day = byDate.get(date);
      return {
        key: date,
        label: formatDayShort(date),
        tick: WEEKDAYS_SHORT[isoWeekday(date) - 1],
        values: [day?.completed ?? 0, day?.created ?? 0],
      };
    });
    return {
      columns,
      completed: columns.reduce((sum, c) => sum + (c.values[0] ?? 0), 0),
      added: columns.reduce((sum, c) => sum + (c.values[1] ?? 0), 0),
      streak: activeStreaks(data.days, today).current,
    };
  }, [data, today]);

  const summary =
    week === null
      ? undefined
      : [
          `${formatCount(week.completed)} completed`,
          `${formatCount(week.added)} added`,
          week.streak > 1 && `active ${plural(week.streak, "day")} in a row`,
        ]
          .filter((part): part is string => part !== false)
          .join(" · ");

  return (
    <HomeCard title="Last 7 days" summary={summary} to={INSIGHTS_PATH} wide>
      {week !== null && (
        <ColumnChart
          label="Items completed and added per day, last 7 days"
          series={SERIES}
          data={week.columns}
          format={formatCount}
        />
      )}
    </HomeCard>
  );
}

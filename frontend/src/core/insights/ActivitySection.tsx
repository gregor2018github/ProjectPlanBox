import { format, parseISO } from "date-fns";
import { useMemo } from "react";

import { BarList } from "../../ui/BarList";
import { ColumnChart } from "../../ui/ColumnChart";
import { HeatGrid } from "../../ui/HeatGrid";
import { InsightCard } from "../../ui/InsightCard";
import { InsightSection } from "../../ui/InsightSection";
import { StatTile } from "../../ui/StatTile";
import { WEEKDAYS_SHORT } from "../time";
import { useTagFilter } from "../tags/tagFilter";
import { useToday } from "../useToday";
import {
  activeStreaks,
  activityColumns,
  activityRange,
  busiestWeekday,
  weekdayTotals,
} from "./activity";
import { formatCount, formatPercent, plural, UNFILTERED_NOTE } from "./format";
import { useActivity } from "./insightsQueries";

/** Props for {@link ActivitySection}. */
export interface ActivitySectionProps {
  /** The display name of an entity type's module, e.g. "todos.todo" → "Todos". */
  typeLabel: (entityType: string) => string;
}

const WEEKDAY_ROWS = ["Mon", "", "Wed", "", "Fri", "", ""];

/**
 * The cross-module overview: a year of activity as a heat grid, active-day
 * streaks, where the work happens and when the app gets opened.
 */
export function ActivitySection({ typeLabel }: ActivitySectionProps) {
  const tagFilter = useTagFilter();
  const today = useToday();
  const range = today === null ? null : activityRange(today);
  const { data } = useActivity(range);

  const derived = useMemo(() => {
    if (!data || today === null) return null;
    const days = data.days;
    return {
      columns: activityColumns(days, today),
      streaks: activeStreaks(days, today),
      busiest: busiestWeekday(days),
      weekdays: weekdayTotals(days),
      added: days.reduce((sum, d) => sum + d.created, 0),
      completed: days.reduce((sum, d) => sum + d.completed, 0),
    };
  }, [data, today]);

  if (!data || !derived) {
    return <InsightSection id="insights-overview" title="Overview" subtitle="Loading…" />;
  }
  const { opens } = data;
  const spanDays = derived.columns.flatMap((c) => c.cells).filter(Boolean).length;
  const byType = data.types
    .map((t) => ({ ...t, total: t.created + t.completed }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <InsightSection
      id="insights-overview"
      title="Overview"
      subtitle={`Everything you added, completed and deleted in the last 12 months, across every module.${tagFilter.active ? ` ${UNFILTERED_NOTE}` : ""}`}
      tiles={
        <>
          <StatTile
            label="Active days"
            value={formatCount(derived.streaks.activeDays)}
            detail={`${formatPercent(derived.streaks.activeDays, spanDays)} of ${plural(spanDays, "day")}`}
          />
          <StatTile
            label="Current streak"
            value={plural(derived.streaks.current, "day")}
            detail={`Longest ${plural(derived.streaks.longest, "day")}`}
          />
          <StatTile label="Added" value={formatCount(derived.added)} detail="Last 12 months" />
          <StatTile
            label="Completed"
            value={formatCount(derived.completed)}
            detail="Todos and check-ins"
          />
          <StatTile
            label="App opens"
            value={formatCount(opens.all_time)}
            detail={
              opens.first_at === null
                ? "Counted from now on"
                : `Since ${format(parseISO(opens.first_at), "d MMM yyyy")}`
            }
          />
          <StatTile
            label="Busiest weekday"
            value={derived.busiest ?? "–"}
            detail="Most done in total"
          />
        </>
      }
    >
      <InsightCard
        title="Activity"
        subtitle="One square per day; darker means more done that day."
        wide
      >
        <HeatGrid
          label="Activity over the last 12 months"
          columns={derived.columns}
          rowLabels={WEEKDAY_ROWS}
        />
      </InsightCard>
      <InsightCard title="Where the work happens" subtitle="Added and completed, by module.">
        <BarList
          label="Activity by module"
          items={byType.map((t) => ({
            key: t.entity_type,
            label: typeLabel(t.entity_type),
            value: t.total,
            display: `${formatCount(t.created)} added · ${formatCount(t.completed)} done`,
          }))}
        />
      </InsightCard>
      <InsightCard title="Activity by weekday" subtitle="Everything done, summed per weekday.">
        <ColumnChart
          label="Activity by weekday"
          series={[{ name: "Done", tone: "accent" }]}
          data={WEEKDAYS_SHORT.map((name, i) => ({
            key: name,
            label: name,
            tick: name,
            values: [derived.weekdays[i] ?? 0],
          }))}
          format={formatCount}
        />
      </InsightCard>
      <InsightCard
        title="When you open PlanBox"
        subtitle={`App opens by hour of day, ${plural(opens.in_range, "open")} in the last 12 months.`}
        wide
      >
        <ColumnChart
          label="App opens by hour of day"
          series={[{ name: "Opens", tone: "accent" }]}
          data={opens.by_hour.map((count, hour) => ({
            key: String(hour),
            label: `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`,
            tick: hour % 6 === 0 ? String(hour).padStart(2, "0") : undefined,
            values: [count],
          }))}
          format={formatCount}
        />
      </InsightCard>
    </InsightSection>
  );
}

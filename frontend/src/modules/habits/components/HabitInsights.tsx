import { formatCount, formatPercent, plural } from "../../../core/insights/format";
import {
  formatDayShort,
  formatMonthShort,
  startOfWeekOf,
  WEEKDAYS_SHORT,
} from "../../../core/time";
import { ColumnChart } from "../../../ui/ColumnChart";
import { InsightCard } from "../../../ui/InsightCard";
import { InsightSection } from "../../../ui/InsightSection";
import { StatTile } from "../../../ui/StatTile";
import { rate30, sumRates, weekdayRates, weeklyCheckins } from "../insights";
import { useHabitData } from "../queries";
import { HabitStatsTable } from "./HabitStatsTable";

const ID = "insights-habits";

/** The habits block of the Insights page: consistency, streaks and check-ins over time. */
export function HabitInsights() {
  const { habits, today, loading } = useHabitData();

  if (today === null || loading) {
    return <InsightSection id={ID} title="Habits" subtitle="Loading…" />;
  }
  if (habits.length === 0) {
    return <InsightSection id={ID} title="Habits" subtitle="No habits yet." />;
  }
  const month = sumRates(habits.map((h) => rate30(h, today)));
  const byWeekday = weekdayRates(habits, today);
  const weeks = weeklyCheckins(habits, today);
  const thisWeek = weeks.find((w) => w.start === startOfWeekOf(today))?.count ?? 0;
  const leader = [...habits].sort((a, b) => b.current_streak - a.current_streak)[0];
  const best = [...habits].sort((a, b) => b.best_streak - a.best_streak)[0];

  return (
    <InsightSection
      id={ID}
      title="Habits"
      subtitle="How consistently scheduled days get done, from the last 26 weeks."
      tiles={
        <>
          <StatTile label="Habits" value={formatCount(habits.length)} />
          <StatTile
            label="Consistency, 30 days"
            value={formatPercent(month.done, month.due)}
            detail={`${formatCount(month.done)} of ${plural(month.due, "scheduled day")}`}
          />
          <StatTile label="Check-ins this week" value={formatCount(thisWeek)} />
          <StatTile
            label="Longest current streak"
            value={plural(leader?.current_streak ?? 0, "day")}
            detail={leader?.name}
          />
          <StatTile
            label="Best streak ever"
            value={plural(best?.best_streak ?? 0, "day")}
            detail={best?.name}
          />
        </>
      }
    >
      <InsightCard title="Per habit" subtitle="Streaks count scheduled days in a row." wide>
        <HabitStatsTable habits={habits} today={today} />
      </InsightCard>
      <InsightCard title="Consistency by weekday" subtitle="Share of scheduled days done.">
        <ColumnChart
          label="Habit consistency by weekday"
          series={[{ name: "Done", tone: "accent" }]}
          data={WEEKDAYS_SHORT.map((name, i) => {
            const rate = byWeekday[i] ?? { done: 0, due: 0 };
            return {
              key: name,
              label: `${name} (${formatCount(rate.done)} of ${formatCount(rate.due)})`,
              tick: name,
              values: [rate.due > 0 ? Math.round((rate.done / rate.due) * 100) : 0],
            };
          })}
          format={(v) => `${v.toString()} %`}
        />
      </InsightCard>
      <InsightCard title="Check-ins per week" subtitle="Every habit together.">
        <ColumnChart
          label="Habit check-ins per week"
          series={[{ name: "Check-ins", tone: "accent" }]}
          data={weeks.map((week, i) => ({
            key: week.start,
            label: `Week of ${formatDayShort(week.start)}`,
            tick: i % 4 === 0 ? formatMonthShort(week.start) : undefined,
            values: [week.count],
          }))}
          format={formatCount}
        />
      </InsightCard>
    </InsightSection>
  );
}

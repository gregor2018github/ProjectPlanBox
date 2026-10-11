import { format, parseISO } from "date-fns";

import {
  formatCount,
  formatDays,
  formatDelta,
  formatPercent,
  plural,
} from "../../../core/insights/format";
import { useTags } from "../../../core/tags/tagQueries";
import { WEEKDAYS_SHORT } from "../../../core/time";
import { BarList } from "../../../ui/BarList";
import { ColumnChart } from "../../../ui/ColumnChart";
import { HeatGrid } from "../../../ui/HeatGrid";
import { InsightCard } from "../../../ui/InsightCard";
import { InsightSection } from "../../../ui/InsightSection";
import { StatTile } from "../../../ui/StatTile";
import { completionsByWeekday, peakHour, punchcardColumns, weekColumns } from "../insights";
import { useTodoStats } from "../queries";
import { PRIORITY_LABELS, type Priority } from "../types";
import { ListBucketsTable } from "./ListBucketsTable";
import { OldestOpenList } from "./OldestOpenList";

const ID = "insights-todos";

/** The todos block of the Insights page: flow, lead times, buckets and habits of work. */
export function TodoInsights() {
  const { data: stats } = useTodoStats();
  const { data: tags = [] } = useTags();

  if (!stats) return <InsightSection id={ID} title="Todos" subtitle="Loading…" />;
  const { totals, recent, lead_time: lead, due, streaks } = stats;
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const peak = peakHour(stats.punchcard);
  const byWeekday = completionsByWeekday(stats.punchcard);
  const leadPriorities = lead.by_priority.filter((p) => p.count > 0);

  return (
    <InsightSection
      id={ID}
      title="Todos"
      subtitle={`${plural(totals.added, "todo")} added so far, ${formatCount(totals.completed)} completed.`}
      tiles={
        <>
          <StatTile
            label="Open"
            value={formatCount(totals.open)}
            detail={`${formatCount(totals.overdue)} overdue · ${formatCount(totals.due_today)} due today`}
          />
          <StatTile
            label="Completed this week"
            value={formatCount(recent.completed_7)}
            detail={formatDelta(recent.completed_7, recent.completed_prev_7, "the week before")}
          />
          <StatTile
            label="Added this week"
            value={formatCount(recent.added_7)}
            detail={formatDelta(recent.added_7, recent.added_prev_7, "the week before")}
          />
          <StatTile
            label="Typical lead time"
            value={formatDays(lead.median_days)}
            detail={
              lead.p90_days === null
                ? "Nothing completed yet"
                : `9 in 10 within ${formatDays(lead.p90_days)}`
            }
          />
          <StatTile
            label="Done on time"
            value={formatPercent(due.on_time, due.with_due_date)}
            detail={`${formatCount(due.on_time)} of ${plural(due.with_due_date, "todo")} with a due date`}
          />
          <StatTile
            label="Completion streak"
            value={plural(streaks.current, "day")}
            detail={`Longest ${plural(streaks.longest, "day")}`}
          />
        </>
      }
    >
      <InsightCard
        title="Added and completed"
        subtitle={`Per week, the last 26 weeks. Last 30 days: ${formatCount(recent.added_30)} added, ${formatCount(recent.completed_30)} completed.`}
        wide
      >
        <ColumnChart
          label="Todos completed and added per week"
          series={[
            { name: "Completed", tone: "accent" },
            { name: "Added", tone: "muted" },
          ]}
          data={weekColumns(stats.weeks)}
          format={formatCount}
        />
      </InsightCard>

      <InsightCard
        title="Lead time"
        subtitle={`From added to completed, one-off todos. Median ${formatDays(lead.median_days)}, average ${formatDays(lead.mean_days)}.`}
      >
        <BarList
          label="Lead times"
          items={lead.buckets.map((b) => ({ key: b.label, label: b.label, value: b.count }))}
          empty="Complete a todo to see how long things take."
        />
      </InsightCard>

      <InsightCard title="Lead time by priority" subtitle="Median days from added to completed.">
        <BarList
          label="Median lead time by priority"
          items={leadPriorities.map((p) => ({
            key: String(p.priority),
            label: PRIORITY_LABELS[p.priority as Priority],
            sublabel: plural(p.count, "todo"),
            value: p.median_days ?? 0,
            display: formatDays(p.median_days),
          }))}
          empty="Nothing completed yet."
        />
      </InsightCard>

      <InsightCard
        title="Biggest lists"
        subtitle="Where the open work sits and where it gets done."
        wide
      >
        <ListBucketsTable lists={stats.lists} />
      </InsightCard>

      <InsightCard
        title="Waiting"
        subtitle={`How long open todos have been around. Median ${formatDays(stats.open_age.median_days)}.`}
      >
        <BarList
          label="Age of open todos"
          items={stats.open_age.buckets.map((b) => ({
            key: b.label,
            label: b.label,
            value: b.count,
          }))}
          empty="No open todos."
        />
        <OldestOpenList todos={stats.oldest_open} />
      </InsightCard>

      <InsightCard title="Priorities" subtitle="Open todos per priority.">
        <BarList
          label="Open todos by priority"
          items={stats.priorities.map((p) => ({
            key: String(p.priority),
            label: PRIORITY_LABELS[p.priority as Priority],
            value: p.open,
            display: `${formatCount(p.open)} open · ${formatCount(p.overdue)} overdue · ${formatCount(p.completed)} done`,
          }))}
        />
      </InsightCard>

      <InsightCard
        title="When you get things done"
        subtitle={
          peak === null
            ? "Completions by weekday and hour."
            : `Completions by weekday and hour. Peak: ${WEEKDAYS_SHORT[peak[0]] ?? ""} around ${String(peak[1]).padStart(2, "0")}:00.`
        }
        wide
      >
        <HeatGrid
          label="Completions by weekday and hour"
          columns={punchcardColumns(stats.punchcard)}
          rowLabels={WEEKDAYS_SHORT}
          size="md"
          initial={peak === null ? undefined : [peak[1], peak[0]]}
        />
        <p className="text-sm text-text-muted">
          {WEEKDAYS_SHORT.map((name, i) => `${name} ${formatCount(byWeekday[i] ?? 0)}`).join(" · ")}
        </p>
      </InsightCard>

      <InsightCard title="Areas" subtitle="Open todos per area.">
        <BarList
          label="Open todos by area"
          items={stats.areas.map((a) => ({
            key: a.id ?? "none",
            label: a.name,
            value: a.open,
            display: `${formatCount(a.open)} open · ${formatCount(a.completed)} done`,
          }))}
        />
      </InsightCard>

      <InsightCard title="Tags" subtitle="Todos per tag, open and done.">
        <BarList
          label="Todos by tag"
          items={stats.tags.slice(0, 10).map((t) => ({
            key: t.tag_id,
            label: tagName.get(t.tag_id) ?? "…",
            value: t.open + t.completed,
            display: `${formatCount(t.open)} open · ${formatCount(t.completed)} done`,
          }))}
          empty="No tagged todos."
        />
      </InsightCard>

      <InsightCard title="Records" subtitle="All time.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[
            [
              "Best day",
              streaks.best_day === null
                ? "–"
                : `${plural(streaks.best_day.count, "todo")} on ${format(parseISO(streaks.best_day.date), "d MMM yyyy")}`,
            ],
            ["Days with a completion", formatCount(streaks.active_days)],
            ["Longest streak", plural(streaks.longest, "day")],
            [
              "Completed late",
              due.late === 0
                ? "Never"
                : `${plural(due.late, "time")}, ${formatDays(due.mean_days_late)} late on average`,
            ],
            ["Repeating todos", formatCount(totals.repeating)],
            ["Open subtasks", formatCount(totals.subtasks_open)],
            ["In the Inbox", formatCount(totals.inbox)],
            ["Deleted", formatCount(totals.deleted)],
          ].map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col">
              <dt className="text-text-muted">{term}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </InsightCard>
    </InsightSection>
  );
}

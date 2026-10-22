import { useMeta } from "../../../core/api/coreQueries";
import { formatCount, plural } from "../../../core/insights/format";
import { addDays, formatMonth, formatMonthShort, zonedParts } from "../../../core/time";
import { useToday } from "../../../core/useToday";
import { BarList } from "../../../ui/BarList";
import { ColumnChart } from "../../../ui/ColumnChart";
import { InsightCard } from "../../../ui/InsightCard";
import { InsightSection } from "../../../ui/InsightSection";
import { StatTile } from "../../../ui/StatTile";
import { addedPerMonth, countsByCollection, countsByTag, wordCount, type Count } from "../insights";
import { useKnowledgeData } from "../useKnowledgeData";

const ID = "insights-knowledge";
const TOP = 8;

/** The top counts as bar rows, e.g. "3 pages". */
function bars(counts: readonly Count[], one: string, many?: string) {
  return counts.slice(0, TOP).map((c) => ({
    key: c.key,
    label: c.label,
    value: c.count,
    display: plural(c.count, one, many),
  }));
}

/** The knowledge block of the Insights page: what is kept, where, and how it grows. */
export function KnowledgeInsights() {
  // The tag-filtered entries, so the numbers follow the global tag filter.
  const { entries, collections, loading, tagName } = useKnowledgeData();
  const today = useToday();
  const { data: meta } = useMeta();

  if (loading || today === null || !meta) {
    return <InsightSection id={ID} title="Knowledge" subtitle="Loading…" />;
  }
  const monthAgo = addDays(today, -29);
  const added30 = entries.filter(
    (e) => zonedParts(e.created_at, meta.timezone).date >= monthAgo,
  ).length;
  const months = addedPerMonth(entries, today, meta.timezone);
  const tags = countsByTag(entries).map((c) => ({ ...c, label: tagName(c.key) }));

  return (
    <InsightSection
      id={ID}
      title="Knowledge"
      subtitle={`${plural(entries.length, "page")} in ${plural(collections.length, "collection")}.`}
      tiles={
        <>
          <StatTile label="Pages" value={formatCount(entries.length)} />
          <StatTile label="Words" value={formatCount(wordCount(entries))} />
          <StatTile label="Added, 30 days" value={formatCount(added30)} />
          <StatTile label="Collections" value={formatCount(collections.length)} />
        </>
      }
    >
      <InsightCard title="Added per month" subtitle="Pages that still exist, by month added." wide>
        <ColumnChart
          label="Knowledge pages added per month"
          series={[{ name: "Added", tone: "accent" }]}
          data={months.map((m) => ({
            key: m.month,
            label: formatMonth(m.month),
            tick: formatMonthShort(m.month),
            values: [m.count],
          }))}
          format={formatCount}
        />
      </InsightCard>
      <InsightCard title="Collections" subtitle="Pages per collection.">
        <BarList
          label="Pages by collection"
          items={bars(countsByCollection(entries, collections), "page")}
        />
      </InsightCard>
      <InsightCard title="Tags" subtitle="Pages per tag.">
        <BarList label="Pages by tag" items={bars(tags, "page")} empty="No tagged pages." />
      </InsightCard>
    </InsightSection>
  );
}

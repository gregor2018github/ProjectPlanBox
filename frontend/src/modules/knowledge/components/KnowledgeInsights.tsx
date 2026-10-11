import { useMeta } from "../../../core/api/coreQueries";
import { formatCount, plural } from "../../../core/insights/format";
import { addDays, formatMonth, formatMonthShort, zonedParts } from "../../../core/time";
import { useToday } from "../../../core/useToday";
import { BarList } from "../../../ui/BarList";
import { ColumnChart } from "../../../ui/ColumnChart";
import { InsightCard } from "../../../ui/InsightCard";
import { InsightSection } from "../../../ui/InsightSection";
import { StatTile } from "../../../ui/StatTile";
import {
  addedPerMonth,
  countsByCollection,
  countsByKind,
  countsByLanguage,
  countsBySite,
  countsByTag,
  type Count,
} from "../insights";
import { useKnowledgeData } from "../useKnowledgeData";

const ID = "insights-knowledge";
const TOP = 8;

/** The top counts as bar rows, e.g. "3 links". */
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
  const { allEntries: entries, collections, loading, tagName } = useKnowledgeData();
  const today = useToday();
  const { data: meta } = useMeta();

  if (loading || today === null || !meta) {
    return <InsightSection id={ID} title="Knowledge" subtitle="Loading…" />;
  }
  const kinds = countsByKind(entries);
  const monthAgo = addDays(today, -29);
  const added30 = entries.filter(
    (e) => zonedParts(e.created_at, meta.timezone).date >= monthAgo,
  ).length;
  const months = addedPerMonth(entries, today, meta.timezone);
  const sites = countsBySite(entries);
  const languages = countsByLanguage(entries);
  const tags = countsByTag(entries).map((c) => ({ ...c, label: tagName(c.key) }));

  return (
    <InsightSection
      id={ID}
      title="Knowledge"
      subtitle={`${plural(entries.length, "entry", "entries")} in ${plural(collections.length, "collection")}.`}
      tiles={
        <>
          <StatTile label="Entries" value={formatCount(entries.length)} />
          <StatTile label="Notes" value={formatCount(kinds.note)} />
          <StatTile label="Links" value={formatCount(kinds.link)} />
          <StatTile label="Snippets" value={formatCount(kinds.snippet)} />
          <StatTile label="Added, 30 days" value={formatCount(added30)} />
          <StatTile label="Collections" value={formatCount(collections.length)} />
        </>
      }
    >
      <InsightCard
        title="Added per month"
        subtitle="Entries that still exist, by month added."
        wide
      >
        <ColumnChart
          label="Knowledge entries added per month"
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
      <InsightCard title="Collections" subtitle="Entries per collection.">
        <BarList
          label="Entries by collection"
          items={bars(countsByCollection(entries, collections), "entry", "entries")}
        />
      </InsightCard>
      <InsightCard title="Tags" subtitle="Entries per tag.">
        <BarList
          label="Entries by tag"
          items={bars(tags, "entry", "entries")}
          empty="No tagged entries."
        />
      </InsightCard>
      <InsightCard title="Most saved sites" subtitle="Links per website.">
        <BarList label="Links by site" items={bars(sites, "link")} empty="No links yet." />
      </InsightCard>
      <InsightCard title="Snippet languages" subtitle="Snippets per language.">
        <BarList
          label="Snippets by language"
          items={bars(languages, "snippet")}
          empty="No snippets yet."
        />
      </InsightCard>
    </InsightSection>
  );
}

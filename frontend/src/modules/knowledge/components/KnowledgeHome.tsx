import { Link, useSearch } from "@tanstack/react-router";

import { HomeCard } from "../../../core/home/HomeCard";
import { plural } from "../../../core/insights/format";
import { knowledgePaths } from "../paths";
import { entryRef } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { EntryRow } from "./EntryRow";

/** How many recently changed entries the card lists. */
export const HOME_ENTRIES = 5;

/** The knowledge card on Home: the latest entries, and what is still unsorted. */
export function KnowledgeHome() {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const search: Record<string, unknown> = useSearch({ strict: false });
  const openItem = typeof search.item === "string" ? search.item : undefined;
  if (data.loading) return <HomeCard title="Knowledge" to={knowledgePaths.all} />;

  const recent = data.entries.slice(0, HOME_ENTRIES);
  const unsorted = data.entries.filter((e) => e.collection_id === null).length;

  return (
    <HomeCard
      title="Knowledge"
      summary={
        data.entries.length === 0
          ? undefined
          : `${plural(data.entries.length, "entry", "entries")} in ${plural(data.collections.length, "collection")}`
      }
      to={knowledgePaths.all}
    >
      {recent.length > 0 ? (
        <>
          <h3 className="px-1 text-sm font-medium text-text-muted">Recently changed</h3>
          <ul aria-label="Recently changed entries" className="@container flex flex-col">
            {recent.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  entry={entry}
                  data={data}
                  actions={actions}
                  showCollection
                  tagColumn={recent.some((e) => e.tag_ids.length > 0)}
                  isOpen={openItem === entryRef(entry.id)}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="px-2 py-1 text-sm text-text-muted">No entries yet.</p>
      )}
      {unsorted > 0 && (
        <Link
          to={knowledgePaths.unsorted}
          className="self-start rounded-md px-3 py-1 text-sm text-accent transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11"
        >
          {plural(unsorted, "entry", "entries")} to sort
        </Link>
      )}
    </HomeCard>
  );
}

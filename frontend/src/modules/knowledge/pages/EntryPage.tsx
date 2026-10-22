import { useParams } from "@tanstack/react-router";

import { ViewLayout } from "../../../ui/ViewLayout";
import { PageView } from "../components/PageView";
import { paramOf } from "../paths";
import { useKnowledgeData } from "../useKnowledgeData";

/** One knowledge page, opened large (`/knowledge/pages/<id>`). */
export function EntryPage() {
  const entryId = paramOf(useParams({ strict: false }), "entryId") ?? "";
  const data = useKnowledgeData();
  const entry = data.allEntries.find((e) => e.id === entryId);

  if (entry === undefined) {
    return (
      <ViewLayout>
        <p className="px-3 text-base text-text-muted">
          {data.loading ? "" : "This page does not exist (anymore)."}
        </p>
      </ViewLayout>
    );
  }
  // Keyed by id: another page starts with its own content and editors.
  return <PageView key={entry.id} entry={entry} />;
}

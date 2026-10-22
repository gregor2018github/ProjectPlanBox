import { useNavigate } from "@tanstack/react-router";
import { FileText, Trash2 } from "lucide-react";

import { LinkedItems } from "../../../core/links/LinkedItems";
import { Button } from "../../../ui/Button";
import { InlineTitle } from "../../../ui/InlineTitle";
import { knowledgePaths } from "../paths";
import { entryRef } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { EntryProperties } from "./EntryProperties";

/** Props for {@link EntryDetail}. */
export interface EntryDetailProps {
  /** The entry's id (from `?item=knowledge.entry:<id>`). */
  id: string;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** How much of the page's text the panel previews. */
const PREVIEW = 600;

/**
 * A page in the side panel (opened from search, links or Home): its title,
 * collection, tags, the start of its text and its links. The page itself
 * opens large in the main area.
 */
export function EntryDetail({ id }: EntryDetailProps) {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const navigate = useNavigate();
  const entry = data.allEntries.find((e) => e.id === id);

  if (entry === undefined) {
    return (
      <p className="pt-4 text-base text-text-muted">
        {data.loading ? "" : "This page is not here anymore (deleted)."}
      </p>
    );
  }

  const preview = entry.body.length > PREVIEW ? `${entry.body.slice(0, PREVIEW)}…` : entry.body;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <FileText size={14} strokeWidth={1.75} aria-hidden />
          Page
        </span>
        <InlineTitle
          size="lg"
          label="Title"
          value={entry.title}
          onCommit={(title) => {
            actions.update(entry.id, { title });
          }}
        />
      </div>

      <div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void navigate({ to: knowledgePaths.page(entry.id) });
          }}
        >
          <FileText size={16} strokeWidth={1.75} aria-hidden />
          Open page
        </Button>
      </div>

      <EntryProperties entry={entry} data={data} actions={actions} />

      {preview !== "" && (
        <p className="line-clamp-12 text-base whitespace-pre-line text-text-muted">{preview}</p>
      )}

      <LinkedItems entity={entryRef(entry.id)} title={entry.title} />

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-text-muted">
        <span>Created {dateFormat.format(new Date(entry.created_at))}</span>
        <Button
          size="sm"
          className="text-danger"
          onClick={() => {
            actions.remove(entry);
          }}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}

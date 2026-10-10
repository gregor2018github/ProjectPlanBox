import { Copy, ExternalLink, Folder, Inbox, Trash2 } from "lucide-react";

import { LinkedItems } from "../../../core/links/LinkedItems";
import { TagPicker } from "../../../core/tags/TagPicker";
import { AutosaveTextArea } from "../../../ui/AutosaveTextArea";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { InlineTitle } from "../../../ui/InlineTitle";
import { Menu } from "../../../ui/Menu";
import { KIND_ICONS } from "../kindIcons";
import { isWebUrl, normalizeUrl } from "../selectors";
import { entryRef, KIND_LABELS } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";

/** Props for {@link EntryDetail}. */
export interface EntryDetailProps {
  /** The entry's id (from `?item=knowledge.entry:<id>`). */
  id: string;
}

const BODY_LABELS = { note: "Text", link: "Description", snippet: "Code" } as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The detail panel for one note, link or snippet: every field, links, delete. */
export function EntryDetail({ id }: EntryDetailProps) {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const entry = data.entries.find((e) => e.id === id);

  if (entry === undefined) {
    return (
      <p className="pt-4 text-base text-text-muted">
        {data.loading ? "" : "This entry is not here anymore (deleted)."}
      </p>
    );
  }

  const Icon = KIND_ICONS[entry.kind];
  const url = entry.url;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          {KIND_LABELS[entry.kind]}
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

      {entry.kind === "link" && (
        <div className="flex items-center gap-2">
          <InlineTitle
            label="Web address"
            value={url ?? ""}
            className="text-sm text-accent"
            onCommit={(next) => {
              const address = normalizeUrl(next);
              if (isWebUrl(address)) actions.update(entry.id, { url: address });
            }}
          />
          {isWebUrl(url) && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-text hover:bg-hover coarse:h-11"
            >
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
              Open
            </a>
          )}
        </div>
      )}

      {entry.kind === "snippet" && (
        <InlineTitle
          label="Language"
          placeholder="Language (e.g. python)"
          allowEmpty
          value={entry.language ?? ""}
          className="text-sm"
          onCommit={(language) => {
            actions.update(entry.id, { language: language === "" ? null : language });
          }}
        />
      )}

      <div className="flex flex-wrap gap-1">
        <Menu
          align="start"
          entries={[
            {
              id: "unsorted",
              label: "Unsorted",
              icon: Inbox,
              checked: entry.collection_id === null,
              onSelect: () => {
                actions.moveTo(entry, null);
              },
            },
            ...data.collections.map((c) => ({
              id: c.id,
              label: c.name,
              icon: Folder,
              checked: entry.collection_id === c.id,
              onSelect: () => {
                actions.moveTo(entry, c.id);
              },
            })),
          ]}
          trigger={
            <Button
              size="sm"
              aria-label={`Collection: ${data.collectionName(entry.collection_id)}`}
            >
              <Folder size={16} strokeWidth={1.75} aria-hidden />
              {data.collectionName(entry.collection_id)}
            </Button>
          }
        />
        <TagPicker
          tags={data.tags}
          selected={entry.tag_ids}
          onChange={(tag_ids) => {
            actions.update(entry.id, { tag_ids });
          }}
        />
        {entry.kind === "snippet" && entry.body !== "" && (
          <Button
            size="sm"
            onClick={() => {
              actions.copy(entry.body, "Code copied");
            }}
          >
            <Copy size={16} strokeWidth={1.75} aria-hidden />
            Copy code
          </Button>
        )}
      </div>

      <AutosaveTextArea
        aria-label={BODY_LABELS[entry.kind]}
        placeholder={BODY_LABELS[entry.kind]}
        value={entry.body}
        rows={entry.kind === "link" ? 4 : 12}
        spellCheck={entry.kind !== "snippet"}
        className={cx(entry.kind === "snippet" && "font-mono")}
        onSave={(body) => {
          actions.update(entry.id, { body });
        }}
      />

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

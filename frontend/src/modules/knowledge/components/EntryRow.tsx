import { MoreHorizontal } from "lucide-react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { entryMenuEntries } from "../entryMenu";
import { KIND_ICONS } from "../kindIcons";
import { hostOf } from "../selectors";
import { KIND_LABELS, type Entry } from "../types";
import type { KnowledgeActions } from "../useKnowledgeActions";
import type { KnowledgeData } from "../useKnowledgeData";

/** Props for {@link EntryRow}. */
export interface EntryRowProps {
  entry: Entry;
  data: KnowledgeData;
  actions: KnowledgeActions;
  /** Shows the collection name (in views spanning collections). */
  showCollection: boolean;
  /** True while this entry is open in the detail panel. */
  isOpen: boolean;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * One entry: kind icon, title, a one-line preview and metadata. Click (or
 * Enter) opens it in the detail panel; every action is in the ⋯ and context menus.
 */
export function EntryRow({ entry, data, actions, showCollection, isOpen }: EntryRowProps) {
  const Icon = KIND_ICONS[entry.kind];
  const menu = entryMenuEntries(entry, actions);
  const preview = entry.body.replace(/\s+/g, " ").trim();
  const meta = [
    entry.kind === "link" ? hostOf(entry.url) : null,
    entry.kind === "snippet" ? entry.language : null,
    showCollection ? data.collectionName(entry.collection_id) : null,
    ...entry.tag_ids.map((id) => `#${data.tagName(id)}`),
    dateFormat.format(new Date(entry.updated_at)),
  ].filter((part): part is string => part !== null && part !== "");

  return (
    <ContextMenu entries={menu}>
      <div
        className={cx(
          "group flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-(--duration-fast) ease-out",
          isOpen ? "bg-selected" : "hover:bg-hover",
        )}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="mt-0.5 h-5 shrink-0 text-text-muted"
        />
        <button
          type="button"
          data-entry-id={entry.id}
          aria-label={`${KIND_LABELS[entry.kind]}: ${entry.title}`}
          onClick={() => {
            actions.open(entry);
          }}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left"
        >
          <span className="min-w-0 break-words">{entry.title}</span>
          {preview !== "" && (
            <span
              className={cx(
                "truncate text-sm text-text-muted",
                entry.kind === "snippet" && "font-mono",
              )}
            >
              {preview}
            </span>
          )}
          <span className="truncate text-sm text-text-muted tabular-nums">{meta.join(" · ")}</span>
        </button>
        <Menu
          entries={menu}
          trigger={
            <button
              type="button"
              aria-label={`Actions for “${entry.title}”`}
              className={cx(
                "-my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 coarse:size-11 coarse:opacity-100",
                isOpen ? "opacity-100" : "opacity-0",
              )}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
            </button>
          }
        />
      </div>
    </ContextMenu>
  );
}

import { FileText, MoreHorizontal } from "lucide-react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { entryMenuEntries } from "../entryMenu";
import type { Entry } from "../types";
import type { KnowledgeActions } from "../useKnowledgeActions";
import type { KnowledgeData } from "../useKnowledgeData";

/** Props for {@link EntryRow}. */
export interface EntryRowProps {
  entry: Entry;
  data: KnowledgeData;
  actions: KnowledgeActions;
  /** Shows the collection name (in views spanning collections). */
  showCollection: boolean;
  /**
   * Gives tags a column of their own, so they start at the same x on every
   * row of the list. The list turns it on when any of its entries has tags.
   */
  tagColumn: boolean;
  /** True while this page's details are open in the side panel. */
  isOpen: boolean;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * One page: icon, title, a one-line preview of its text, metadata and tags. In a
 * wide list (container query on the list) the tags are a fixed-width column
 * at the right edge, lined up across rows; in a narrow one they wrap under
 * the metadata. Click (or Enter) opens the page; every action
 * is in the ⋯ and context menus.
 */
export function EntryRow({
  entry,
  data,
  actions,
  showCollection,
  tagColumn,
  isOpen,
}: EntryRowProps) {
  const menu = entryMenuEntries(entry, actions);
  const preview = entry.body.replace(/\s+/g, " ").trim();
  const meta = [
    showCollection ? data.collectionName(entry.collection_id) : null,
    dateFormat.format(new Date(entry.updated_at)),
  ].filter((part): part is string => part !== null && part !== "");

  return (
    <ContextMenu entries={menu} longPress={false}>
      <div
        className={cx(
          "group flex items-start gap-3 rounded-md px-3 py-2 transition-colors duration-(--duration-fast) ease-out",
          isOpen ? "bg-selected" : "hover:bg-hover",
        )}
      >
        <FileText
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="mt-0.5 h-5 shrink-0 text-text-muted"
        />
        <button
          type="button"
          data-entry-id={entry.id}
          aria-label={`Page: ${entry.title}`}
          onClick={() => {
            actions.open(entry);
          }}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-sm text-left @2xl:flex-nowrap"
        >
          <span className="flex min-w-0 basis-full flex-col gap-0.5 @2xl:flex-1 @2xl:basis-0">
            <span className="min-w-0 break-words">{entry.title}</span>
            {preview !== "" && <span className="truncate text-sm text-text-muted">{preview}</span>}
            <span className="truncate text-sm text-text-muted tabular-nums">
              {meta.join(" · ")}
            </span>
          </span>
          {tagColumn && (
            <span
              className={cx(
                "min-w-0 flex-wrap content-start gap-x-2 text-sm text-text-muted @2xl:w-40 @2xl:shrink-0",
                entry.tag_ids.length === 0 ? "hidden @2xl:flex" : "flex",
              )}
            >
              {entry.tag_ids.map((id) => (
                <span key={id} className="min-w-0 truncate">
                  #{data.tagName(id)}
                </span>
              ))}
            </span>
          )}
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

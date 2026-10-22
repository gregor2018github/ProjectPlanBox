import { useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "../../../ui/Button";
import { Input } from "../../../ui/Input";
import { IS_DEVICE } from "../../../core/platform";
import { Kbd } from "../../../ui/Kbd";
import { PageHeader } from "../../../ui/PageHeader";
import { ViewLayout } from "../../../ui/ViewLayout";
import type { EntryScope } from "../paths";
import { filterEntries } from "../selectors";
import { entryRef } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { EntryListItem } from "./EntryListItem";
import { EntryRow } from "./EntryRow";

/** Props for {@link EntriesView}. */
export interface EntriesViewProps {
  scope: EntryScope;
  title: string;
  /** Extra header buttons (e.g. a collection's ⋯ menu). */
  headerActions?: ReactNode;
}

/**
 * A knowledge view: pages in a scope, newest change first, narrowed by a text
 * filter. Arrow keys move between rows; Delete deletes (undoable).
 */
export function EntriesView({ scope, title, headerActions }: EntriesViewProps) {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const search: Record<string, unknown> = useSearch({ strict: false });
  const openItem = typeof search.item === "string" ? search.item : undefined;

  const inScope = useMemo(
    () => filterEntries(data.entries, { scope, query: "" }),
    [data.entries, scope],
  );
  const shown = useMemo(
    () => filterEntries(inScope, { scope: { kind: "all" }, query, tagName: data.tagName }),
    [inScope, query, data.tagName],
  );
  const tagColumn = shown.some((entry) => entry.tag_ids.length > 0);

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-entry-id]") ?? []),
    ];
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (index < 0) return;
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus();
    } else if (event.key === "Delete") {
      const entry = shown.find((e) => e.id === buttons[index]?.dataset.entryId);
      if (entry === undefined) return;
      event.preventDefault();
      (buttons[index + 1] ?? buttons[index - 1])?.focus();
      actions.remove(entry);
    }
  };

  const openNew = () => {
    actions.createPage(scope.kind === "collection" ? scope.id : null);
  };

  return (
    <ViewLayout>
      <PageHeader
        title={title}
        subtitle={`${inScope.length} page${inScope.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={openNew}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New page
            </Button>
            {headerActions}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 px-3">
        <Input
          type="search"
          aria-label="Filter pages"
          placeholder="Filter by words or #tag…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value.replace(/#/g, ""));
          }}
          className="min-w-40 flex-1"
        />
      </div>

      {!data.loading && inScope.length === 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 px-3 py-6 text-base text-text-muted">
          No pages here yet.
          {!IS_DEVICE && (
            <>
              Press <Kbd keys="E" /> to add one.
            </>
          )}
        </p>
      ) : (
        <>
          {shown.length === 0 && !data.loading && (
            <p className="px-3 pt-4 text-base text-text-muted">Nothing matches.</p>
          )}
          <ul
            ref={listRef}
            aria-label={title}
            onKeyDown={onListKeyDown}
            className="@container flex flex-col gap-0.5"
          >
            <AnimatePresence initial={false}>
              {shown.map((entry) => (
                <EntryListItem key={entry.id} entry={entry} actions={actions}>
                  <EntryRow
                    entry={entry}
                    data={data}
                    actions={actions}
                    showCollection={scope.kind === "all"}
                    tagColumn={tagColumn}
                    isOpen={openItem === entryRef(entry.id)}
                  />
                </EntryListItem>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </ViewLayout>
  );
}

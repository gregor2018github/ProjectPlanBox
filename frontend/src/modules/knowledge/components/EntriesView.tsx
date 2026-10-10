import { useSearch } from "@tanstack/react-router";
import { Layers, Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "../../../ui/Button";
import { Input } from "../../../ui/Input";
import { Kbd } from "../../../ui/Kbd";
import { PageHeader } from "../../../ui/PageHeader";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { ViewLayout } from "../../../ui/ViewLayout";
import { KIND_ICONS } from "../kindIcons";
import { newEntryDialog } from "../newEntryStore";
import type { EntryScope } from "../paths";
import { filterEntries } from "../selectors";
import { entryRef, ENTRY_KINDS, KIND_LABELS, type EntryKind } from "../types";
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

type KindFilter = EntryKind | "all";

const KIND_OPTIONS: readonly SegmentOption<KindFilter>[] = [
  { value: "all", label: "All kinds", icon: Layers },
  ...ENTRY_KINDS.map((kind) => ({
    value: kind,
    label: `${KIND_LABELS[kind]}s`,
    icon: KIND_ICONS[kind],
  })),
];

/**
 * A knowledge view: entries in a scope, newest change first, narrowed by kind
 * and a text filter. Arrow keys move between rows; Delete deletes (undoable).
 */
export function EntriesView({ scope, title, headerActions }: EntriesViewProps) {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const search: Record<string, unknown> = useSearch({ strict: false });
  const openItem = typeof search.item === "string" ? search.item : undefined;

  const inScope = useMemo(
    () => filterEntries(data.entries, { scope, kind: null, query: "" }),
    [data.entries, scope],
  );
  const shown = useMemo(
    () =>
      filterEntries(inScope, {
        scope: { kind: "all" },
        kind: kind === "all" ? null : kind,
        query,
        tagName: data.tagName,
      }),
    [inScope, kind, query, data.tagName],
  );

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
    newEntryDialog.open(kind === "all" ? "note" : kind);
  };

  return (
    <ViewLayout>
      <PageHeader
        title={title}
        subtitle={`${inScope.length} entr${inScope.length === 1 ? "y" : "ies"}`}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={openNew}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New entry
            </Button>
            {headerActions}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 px-3">
        <Input
          type="search"
          aria-label="Filter entries"
          placeholder="Filter by words or #tag…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value.replace(/#/g, ""));
          }}
          className="min-w-40 flex-1"
        />
        <SegmentedControl label="Kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
      </div>

      {!data.loading && inScope.length === 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 px-3 py-6 text-base text-text-muted">
          No notes, links or snippets here yet. Press <Kbd keys="E" /> to add one.
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
            className="flex flex-col gap-0.5"
          >
            <AnimatePresence initial={false}>
              {shown.map((entry) => (
                <EntryListItem key={entry.id} entry={entry} actions={actions}>
                  <EntryRow
                    entry={entry}
                    data={data}
                    actions={actions}
                    showCollection={scope.kind === "all"}
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

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cx } from "../../ui/cx";
import { Dialog } from "../../ui/Dialog";
import { Kbd } from "../../ui/Kbd";
import { entityTypeOf } from "../links/linkables";
import { useLinkableSources } from "../links/linkablesContext";
import { SearchHitContent } from "../search/SearchHitContent";
import { useSearch, type SearchHit } from "../search/searchQueries";
import { useCommandList } from "./commandsContext";
import { rank } from "./fuzzy";
import type { Command } from "./registry";

/** Commands matching the query that are listed before the search results. */
const MAX_COMMANDS_WITH_QUERY = 8;
const RESULTS_GROUP = "Search results";

type Entry = { kind: "command"; command: Command } | { kind: "hit"; hit: SearchHit };

const entryKey = (entry: Entry) =>
  entry.kind === "command" ? `command:${entry.command.id}` : `hit:${entry.hit.ref}`;
const entryGroup = (entry: Entry) =>
  entry.kind === "command" ? entry.command.group : RESULTS_GROUP;

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Ctrl+K palette: type to filter every registered command and to search
 * every module's items on the server; arrow keys to move, Enter to run or
 * open. Implements the ARIA combobox + listbox pattern.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const commands = useCommandList();
  const sources = useLinkableSources();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searching = query.trim() !== "";
  const { hits, pending } = useSearch(open ? query : "");

  const results = useMemo<Entry[]>(() => {
    const ranked = rank(commands, query);
    if (searching) {
      return [
        ...ranked
          .slice(0, MAX_COMMANDS_WITH_QUERY)
          .map((command) => ({ kind: "command" as const, command })),
        ...hits.map((hit) => ({ kind: "hit" as const, hit })),
      ];
    }
    // Without a query, keep commands together by group (first appearance order).
    const groups = [...new Set(ranked.map((c) => c.group))];
    return groups.flatMap((g) =>
      ranked.filter((c) => c.group === g).map((command) => ({ kind: "command" as const, command })),
    );
  }, [commands, query, searching, hits]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange(next);
  };

  const runEntry = (entry: Entry) => {
    handleOpenChange(false);
    if (entry.kind === "command") {
      entry.command.run();
      return;
    }
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, item: entry.hit.ref }),
    });
  };
  const sourceOf = (ref: string) => sources.find((s) => s.entityType === entityTypeOf(ref));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = results[activeIndex];
      if (entry) runEntry(entry);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command palette"
      hideTitle
      placement="top"
      size="md"
      initialFocus={inputRef}
    >
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        aria-label="Search commands"
        placeholder="Type a command or search…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-12 w-full border-b border-border bg-transparent px-5 text-lg text-text outline-none placeholder:text-text-subtle"
      />
      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
        {results.map((entry, index) => {
          const group = entryGroup(entry);
          const showGroup =
            (!searching || entry.kind === "hit") &&
            (index === 0 || entryGroup(results[index - 1] ?? entry) !== group);
          return (
            <li key={entryKey(entry)} role="presentation">
              {showGroup && (
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-medium text-text-muted"
                >
                  {group}
                </div>
              )}
              <div
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onPointerMove={() => {
                  if (index !== activeIndex) setActive(index);
                }}
                onClick={() => {
                  runEntry(entry);
                }}
                className={cx(
                  "flex cursor-default items-center justify-between gap-4 rounded-md px-3 text-base",
                  entry.kind === "command" ? "h-9 coarse:h-11" : "min-h-9 py-1.5 coarse:min-h-11",
                  index === activeIndex && "bg-selected",
                )}
              >
                {entry.kind === "command" ? (
                  <>
                    <span className="truncate">{entry.command.title}</span>
                    {entry.command.shortcut !== undefined && <Kbd keys={entry.command.shortcut} />}
                  </>
                ) : (
                  <SearchHitContent hit={entry.hit} source={sourceOf(entry.hit.ref)} />
                )}
              </div>
            </li>
          );
        })}
        {results.length === 0 && (
          <li role="presentation" className="px-3 py-6 text-center text-sm text-text-muted">
            {pending ? "Searching…" : searching ? "Nothing matches." : "No commands."}
          </li>
        )}
      </ul>
      <div className="flex items-center gap-4 border-t border-border px-5 py-2 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Kbd keys="Up" />
          <Kbd keys="Down" /> to move
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys="Enter" /> to run or open
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys="Esc" /> to close
        </span>
      </div>
    </Dialog>
  );
}

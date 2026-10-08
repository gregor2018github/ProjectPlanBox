import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cx } from "../../ui/cx";
import { Dialog } from "../../ui/Dialog";
import { Kbd } from "../../ui/Kbd";
import { useCommandList } from "./commandsContext";
import { rank } from "./fuzzy";
import type { Command } from "./registry";

/** Props for {@link CommandPalette}. */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Ctrl+K palette: type to filter every registered command, arrow keys to
 * move, Enter to run. Implements the ARIA combobox + listbox pattern.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const commands = useCommandList();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const ranked = rank(commands, query);
    if (query.trim() !== "") return ranked;
    // Without a query, keep commands together by group (first appearance order).
    const groups = [...new Set(ranked.map((c) => c.group))];
    return groups.flatMap((g) => ranked.filter((c) => c.group === g));
  }, [commands, query]);

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

  const runCommand = (command: Command) => {
    handleOpenChange(false);
    command.run();
  };

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
      const command = results[activeIndex];
      if (command) runCommand(command);
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
        placeholder="Type a command…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-12 w-full border-b border-border bg-transparent px-5 text-lg text-text outline-none placeholder:text-text-subtle"
      />
      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
        {results.map((command, index) => {
          const showGroup =
            query.trim() === "" && (index === 0 || results[index - 1]?.group !== command.group);
          return (
            <li key={command.id} role="presentation">
              {showGroup && (
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-medium text-text-muted"
                >
                  {command.group}
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
                  runCommand(command);
                }}
                className={cx(
                  "flex h-9 cursor-default items-center justify-between gap-4 rounded-md px-3 text-base coarse:h-11",
                  index === activeIndex && "bg-selected",
                )}
              >
                <span className="truncate">{command.title}</span>
                {command.shortcut !== undefined && <Kbd keys={command.shortcut} />}
              </div>
            </li>
          );
        })}
        {results.length === 0 && (
          <li role="presentation" className="px-3 py-6 text-center text-sm text-text-muted">
            No matching commands.
          </li>
        )}
      </ul>
      <div className="flex items-center gap-4 border-t border-border px-5 py-2 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Kbd keys="Up" />
          <Kbd keys="Down" /> to move
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys="Enter" /> to run
        </span>
        <span className="flex items-center gap-1">
          <Kbd keys="Esc" /> to close
        </span>
      </div>
    </Dialog>
  );
}

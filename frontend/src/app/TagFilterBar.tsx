import { Tag as TagIcon, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useCommands } from "../core/commands/commandsContext";
import type { Command } from "../core/commands/registry";
import { useShortcut } from "../core/shortcuts/useShortcut";
import { useTagFilter } from "../core/tags/tagFilter";
import { useTags } from "../core/tags/tagQueries";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { PickerList } from "../ui/PickerList";
import { Popover } from "../ui/Popover";

/**
 * The pane above every view for the global tag filter. Typing a tag name
 * narrows all views to items with that tag; while a filter is on, the pane
 * glows and offers "Clear filters".
 */
export function TagFilterBar() {
  const filter = useTagFilter();
  const { data: tags = [] } = useTags();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { tagIds, active, setTagIds, clear } = filter;
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "…";

  const openPicker = () => {
    setOpen(true);
  };
  useShortcut({
    id: "shell.tagFilter",
    keys: "F",
    description: "Filter by tag",
    group: "General",
    run: openPicker,
  });
  useShortcut(
    active
      ? {
          id: "shell.tagFilterClear",
          keys: "Shift+F",
          description: "Clear tag filters",
          group: "General",
          run: clear,
        }
      : null,
  );
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "shell.tagFilter",
        title: "Filter by tag…",
        group: "General",
        keywords: ["tags", "show only", "narrow"],
        shortcut: "F",
        run: () => {
          setOpen(true);
        },
      },
      ...(active
        ? [
            {
              id: "shell.tagFilterClear",
              title: "Clear tag filters",
              group: "General",
              keywords: ["tags", "show all", "reset"],
              shortcut: "Shift+F",
              run: clear,
            },
          ]
        : []),
    ],
    [active, clear],
  );
  useCommands(commands);

  return (
    <div className="shrink-0 px-3 pt-2 pb-1">
      <div
        role="search"
        aria-label="Tag filter"
        data-active={active}
        className={cx(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 transition-[background-color,box-shadow] duration-(--duration-base) ease-out",
          active && "bg-accent-subtle shadow-glow",
        )}
      >
        <TagIcon
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className={cx("ml-1 shrink-0", active ? "text-accent" : "text-text-subtle")}
        />
        {tagIds.map((id) => (
          <span
            key={id}
            className="inline-flex h-7 items-center rounded-md bg-surface pl-2 text-sm font-medium text-accent coarse:h-11"
          >
            #{tagName(id)}
            <button
              type="button"
              aria-label={`Remove filter #${tagName(id)}`}
              onClick={() => {
                setTagIds(tagIds.filter((t) => t !== id));
              }}
              className="ml-0.5 inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-colors duration-(--duration-fast) ease-out hover:bg-hover hover:text-text coarse:size-11"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <Popover
          open={open}
          onOpenChange={setOpen}
          label="Filter by tag"
          initialFocus={inputRef}
          trigger={
            <Button size="sm" className="text-text-muted">
              {active ? "Add tag" : "Filter by tag…"}
            </Button>
          }
        >
          <PickerList
            label="Filter by tag"
            placeholder="Type a tag…"
            inputRef={inputRef}
            options={tags.map((t) => ({ id: t.id, label: t.name, checked: tagIds.includes(t.id) }))}
            onPick={(option) => {
              setTagIds(
                tagIds.includes(option.id)
                  ? tagIds.filter((t) => t !== option.id)
                  : [...tagIds, option.id],
              );
              setOpen(false);
            }}
          />
        </Popover>
        {active && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={clear}>
            <X size={14} strokeWidth={2} aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

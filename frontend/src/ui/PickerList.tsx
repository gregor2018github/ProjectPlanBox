import { Check, Plus } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from "react";

import { rank } from "../core/commands/fuzzy";
import { cx } from "./cx";

/** One choice in a {@link PickerList}. */
export interface PickerOption {
  id: string;
  label: string;
  /** Muted text on the right (e.g. the list a section belongs to). */
  hint?: string;
  /** Indents the option under the one before (e.g. sections under a list). */
  nested?: boolean;
  checked?: boolean;
}

/** Props for {@link PickerList}. */
export interface PickerListProps {
  /** Accessible name of the list. */
  label: string;
  options: readonly PickerOption[];
  onPick: (option: PickerOption) => void;
  /** Offers "Create “query”" when nothing matches exactly. */
  onCreate?: (query: string) => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Called with every change of the typed text (e.g. to search the server). */
  onQueryChange?: (query: string) => void;
  /**
   * Listed after the filtered options without being filtered themselves
   * (e.g. server search results); ids already listed are skipped.
   */
  extraOptions?: readonly PickerOption[];
}

/**
 * A type-to-filter list (combobox + listbox pattern) for pickers such as
 * tags or "move to". Arrow keys move, Enter picks.
 */
export function PickerList({
  label,
  options,
  onPick,
  onCreate,
  placeholder = "Filter…",
  inputRef,
  onQueryChange,
  extraOptions,
}: PickerListProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    const matching =
      trimmed === ""
        ? [...options]
        : rank(
            options.map((o) => ({ ...o, title: o.label })),
            trimmed,
          );
    if (extraOptions === undefined || extraOptions.length === 0) return matching;
    const listed = new Set(matching.map((o) => o.id));
    return [...matching, ...extraOptions.filter((o) => !listed.has(o.id))];
  }, [options, trimmed, extraOptions]);
  const exact = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = onCreate !== undefined && trimmed !== "" && !exact;
  const total = filtered.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, Math.max(total - 1, 0));
  const optionId = (index: number) => `${listId}-${index}`;

  const choose = (index: number) => {
    const option = filtered[index];
    if (option) onPick(option);
    else if (canCreate) {
      onCreate(trimmed);
      setQuery("");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && total > 0) {
      event.preventDefault();
      setActive((activeIndex + 1) % total);
    } else if (event.key === "ArrowUp" && total > 0) {
      event.preventDefault();
      setActive((activeIndex - 1 + total) % total);
    } else if (event.key === "Enter" && total > 0) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className="flex w-64 flex-col">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={total > 0 ? optionId(activeIndex) : undefined}
        aria-label={label}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          onQueryChange?.(event.target.value);
        }}
        onKeyDown={onKeyDown}
        className="h-10 border-b border-border bg-transparent px-3 text-base outline-none placeholder:text-text-subtle"
      />
      <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
        {filtered.map((option, index) => (
          <li
            key={option.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            onPointerMove={() => {
              if (index !== activeIndex) setActive(index);
            }}
            onClick={() => {
              choose(index);
            }}
            className={cx(
              "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-base coarse:h-11",
              option.nested === true && trimmed === "" && "pl-6",
              index === activeIndex && "bg-selected",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-accent">
              {option.checked === true && <Check size={16} strokeWidth={2} aria-hidden />}
            </span>
            <span className="flex-1 truncate">{option.label}</span>
            {option.hint !== undefined && (
              <span className="truncate text-sm text-text-muted">{option.hint}</span>
            )}
          </li>
        ))}
        {canCreate && (
          <li
            id={optionId(filtered.length)}
            role="option"
            aria-selected={activeIndex === filtered.length}
            onClick={() => {
              choose(filtered.length);
            }}
            className={cx(
              "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-base text-accent coarse:h-11",
              activeIndex === filtered.length && "bg-selected",
            )}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Create “{trimmed}”
          </li>
        )}
        {total === 0 && (
          <li role="presentation" className="px-2 py-3 text-center text-sm text-text-muted">
            Nothing matches.
          </li>
        )}
      </ul>
    </div>
  );
}

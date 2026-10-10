import { Plus } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { Input } from "../../../ui/Input";
import { parseQuickAdd } from "../quickAddParser";
import type { Placement } from "../types";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { ParsedChips } from "./ParsedChips";

/** Props for {@link NewTodoInline}. */
export interface NewTodoInlineProps {
  placement: Placement;
  data: TodoData;
  actions: TodoActions;
  /** Defaults for new todos here, e.g. a due date in Today. */
  defaults?: { due_date?: string | null };
  label?: string;
}

/**
 * "+ Add todo" at the end of a group. Enter adds and keeps the field open for
 * the next one; Esc closes. Understands the quick-add syntax.
 */
export function NewTodoInline({
  placement,
  data,
  actions,
  defaults,
  label = "Add todo",
}: NewTodoInlineProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = data.parseContext ? parseQuickAdd(text, data.parseContext) : null;

  const submit = () => {
    if (parsed === null || parsed.title === "") return;
    actions.create({
      ...(parsed.place ? { ...placement, ...parsed.place } : placement),
      title: parsed.title,
      due_date: parsed.due_date ?? defaults?.due_date ?? null,
      priority: parsed.priority ?? 0,
      tag_ids: parsed.tag_ids,
      new_tags: parsed.new_tags,
      ...(parsed.rrule !== null &&
        placement.parent_id === null && { rrule: parsed.rrule, repeat_from: parsed.repeat_from }),
    });
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setText("");
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true);
        }}
        className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-base text-text-muted hover:bg-hover hover:text-text coarse:h-11"
      >
        <Plus size={18} strokeWidth={1.75} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface px-3 py-1.5 shadow-sm dark:inset-ring dark:inset-ring-border">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-4.5 shrink-0 rounded-full border-[1.5px] border-dashed border-border-strong"
        />
        <Input
          ref={inputRef}
          autoFocus
          variant="plain"
          aria-label="New todo"
          placeholder="New todo… try “fri !1 @tag”"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text.trim() === "") setEditing(false);
          }}
        />
      </div>
      {parsed && parsed.tokens.length > 0 && (
        <ParsedChips tokens={parsed.tokens} today={data.today} />
      )}
    </div>
  );
}

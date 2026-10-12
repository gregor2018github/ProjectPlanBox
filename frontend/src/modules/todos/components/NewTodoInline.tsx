import { Plus, X } from "lucide-react";
import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { IconButton } from "../../../ui/IconButton";
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
 * the next one; clicking or tabbing away adds and closes. Esc or the ✕
 * button discards. Understands the quick-add syntax.
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const parsed = data.parseContext ? parseQuickAdd(text, data.parseContext) : null;

  /** Adds the typed todo; returns whether there was one to add. */
  const submit = (): boolean => {
    if (parsed === null || parsed.title === "") return false;
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
    return true;
  };

  const cancel = () => {
    setText("");
    setEditing(false);
  };

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    // Moving to the ✕ button is not "done typing"; its click discards instead.
    if (event.relatedTarget !== null && event.relatedTarget === cancelRef.current) return;
    // Switching to another window keeps the draft; focus comes back to it.
    if (!document.hasFocus()) return;
    // Leaving the field counts as Enter. Text that is only quick-add tokens
    // (no title yet) stays open, as Enter would.
    if (text.trim() === "" || submit()) setEditing(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
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
          onBlur={onBlur}
        />
        <IconButton
          ref={cancelRef}
          label="Discard new todo"
          shortcut="Escape"
          icon={X}
          className="-my-1 -mr-2"
          onPointerDown={(event) => {
            // Keep focus in the field, so the click discards instead of the blur adding.
            event.preventDefault();
          }}
          onClick={cancel}
        />
      </div>
      {parsed && parsed.tokens.length > 0 && (
        <ParsedChips tokens={parsed.tokens} today={data.today} />
      )}
    </div>
  );
}

import { Plus, X } from "lucide-react";
import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { IconButton } from "../../../ui/IconButton";
import { Input } from "../../../ui/Input";
import { newTodoFields, NO_OPTIONS, type NewTodoOptions } from "../newTodoOptions";
import { parseQuickAdd } from "../quickAddParser";
import type { Placement } from "../types";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { NewTodoOptionsBar } from "./NewTodoOptionsBar";
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
 * button discards. Understands the quick-add syntax, and has buttons for the
 * date, repeat, priority and tags.
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
  const [options, setOptions] = useState<NewTodoOptions>(NO_OPTIONS);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // While a picker is open, focus is in its popup (outside the box) on purpose.
  const pickerOpen = useRef(false);
  const parsed = data.parseContext ? parseQuickAdd(text, data.parseContext) : null;

  /** Adds the typed todo; returns whether there was one to add. */
  const submit = (): boolean => {
    if (parsed === null || parsed.title === "") return false;
    actions.create({
      ...(parsed.place ? { ...placement, ...parsed.place } : placement),
      ...newTodoFields(parsed, options, defaults?.due_date ?? null, placement.parent_id === null),
    });
    setText("");
    setOptions(NO_OPTIONS);
    return true;
  };

  const cancel = () => {
    setText("");
    setOptions(NO_OPTIONS);
    pickerOpen.current = false;
    setEditing(false);
  };

  // On the box, so it also hears blurs from the option buttons and pickers.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (pickerOpen.current) return;
    // Moving to an option or the ✕ button is not "done typing"; ✕ discards instead.
    const next = event.relatedTarget;
    if (next instanceof Node && boxRef.current?.contains(next)) return;
    // Switching to another window keeps the draft; focus comes back to it.
    if (!document.hasFocus()) return;
    // Leaving the field counts as Enter. Text that is only quick-add tokens
    // (no title yet) stays open, as Enter would.
    if (text.trim() === "" || submit()) cancel();
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
    <div
      ref={boxRef}
      onBlur={onBlur}
      className="flex flex-col gap-1 rounded-md bg-surface px-3 py-1.5 shadow-sm dark:inset-ring dark:inset-ring-border"
    >
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
        />
        <IconButton
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
      {data.today !== null && (
        <NewTodoOptionsBar
          value={options}
          onChange={setOptions}
          today={data.today}
          tags={data.tags}
          actions={actions}
          canRepeat={placement.parent_id === null}
          field={inputRef}
          onPickerOpenChange={(open) => {
            pickerOpen.current = open;
          }}
        />
      )}
      {parsed && parsed.tokens.length > 0 && (
        <ParsedChips tokens={parsed.tokens} today={data.today} />
      )}
    </div>
  );
}

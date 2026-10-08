import { useRef, useState, type SubmitEvent } from "react";

import { Dialog } from "../../../ui/Dialog";
import { Kbd } from "../../../ui/Kbd";
import { parseQuickAdd } from "../quickAddParser";
import type { Placement } from "../types";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { ParsedChips } from "./ParsedChips";

/** Props for {@link QuickAddDialog}. */
export interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TodoData;
  actions: TodoActions;
  /** Where the todo goes unless the text names a #list. */
  placement: Placement;
  /** Due date applied when the text has none (e.g. today on the Today view). */
  defaultDue: string | null;
  /** "Inbox", "Project", or "Subtask of …", shown under the field. */
  targetLabel: string;
}

/** The global quick-add: one line, parsed as you type, Enter to add. */
export function QuickAddDialog({
  open,
  onOpenChange,
  data,
  actions,
  placement,
  defaultDue,
  targetLabel,
}: QuickAddDialogProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = data.parseContext ? parseQuickAdd(text, data.parseContext) : null;
  const isSubtask = placement.parent_id !== null;

  const close = (next: boolean) => {
    if (!next) setText("");
    onOpenChange(next);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (parsed === null || parsed.title === "") return;
    actions.create({
      ...(parsed.place && !isSubtask ? { ...parsed.place, parent_id: null } : placement),
      title: parsed.title,
      due_date: parsed.due_date ?? defaultDue,
      priority: parsed.priority ?? 0,
      tag_ids: parsed.tag_ids,
      new_tags: parsed.new_tags,
    });
    close(false);
  };

  const target =
    parsed?.place && !isSubtask
      ? (parsed.tokens.find((t) => t.kind === "place")?.label ?? targetLabel)
      : targetLabel;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Quick add"
      hideTitle
      placement="top"
      initialFocus={inputRef}
    >
      <form onSubmit={submit} className="flex flex-col gap-2 px-5 pt-4 pb-3">
        <input
          ref={inputRef}
          aria-label={isSubtask ? "New subtask" : "New todo"}
          placeholder={isSubtask ? "New subtask…" : "New todo…  e.g. Pay rent fri !1 @money #Home"}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="h-10 w-full bg-transparent text-lg text-text outline-none placeholder:text-text-subtle"
        />
        {parsed && parsed.tokens.length > 0 && (
          <ParsedChips tokens={parsed.tokens} today={data.today} />
        )}
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-text-muted">
          <span>Adds to {target}</span>
          <span className="flex items-center gap-1">
            <Kbd keys="Enter" /> to add
          </span>
        </div>
      </form>
    </Dialog>
  );
}

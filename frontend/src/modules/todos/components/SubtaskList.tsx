import { ArrowLeftToLine, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Checkbox } from "../../../ui/Checkbox";
import { cx } from "../../../ui/cx";
import { IconButton } from "../../../ui/IconButton";
import { Input } from "../../../ui/Input";
import { childrenOf } from "../selectors";
import type { Todo } from "../types";
import type { TodoActions } from "../useTodoActions";
import { InlineTitle } from "../../../ui/InlineTitle";

/** Props for {@link SubtaskList}. */
export interface SubtaskListProps {
  parent: Todo;
  todos: readonly Todo[];
  actions: TodoActions;
}

/** The checklist of subtasks in the detail panel, with an "add" field. */
export function SubtaskList({ parent, todos, actions }: SubtaskListProps) {
  const [draft, setDraft] = useState("");
  const children = childrenOf(todos, parent.id);
  const done = children.filter((c) => c.completed_at !== null).length;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && draft.trim() !== "") {
      event.preventDefault();
      actions.create({
        title: draft,
        list_id: parent.list_id,
        section_id: parent.section_id,
        parent_id: parent.id,
      });
      setDraft("");
    }
  };

  return (
    <section aria-label="Subtasks" className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-text-muted">
        Subtasks{children.length > 0 && ` · ${done}/${children.length}`}
      </h2>
      <ul className="flex flex-col">
        {children.map((child) => (
          <li
            key={child.id}
            className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-hover"
          >
            <Checkbox
              size="sm"
              checked={child.completed_at !== null}
              onCheckedChange={() => {
                actions.toggleComplete(child);
              }}
              label={`${child.completed_at === null ? "Complete" : "Reopen"} “${child.title}”`}
            />
            <InlineTitle
              value={child.title}
              label="Subtask title"
              className={cx(child.completed_at !== null && "text-text-muted line-through")}
              onCommit={(title) => {
                actions.update(child.id, { title });
              }}
            />
            <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100">
              <IconButton
                label="Promote to todo"
                icon={ArrowLeftToLine}
                onClick={() => {
                  actions.outdent(child);
                }}
              />
              <IconButton
                label="Delete subtask"
                icon={X}
                onClick={() => {
                  actions.remove(child);
                }}
              />
            </span>
          </li>
        ))}
      </ul>
      {parent.completed_at === null && (
        <Input
          aria-label="Add subtask"
          placeholder="Add subtask…"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
      )}
    </section>
  );
}

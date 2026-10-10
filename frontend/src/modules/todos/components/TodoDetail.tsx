import { CornerLeftUp, Flag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LinkedItems } from "../../../core/links/LinkedItems";
import { TagPicker } from "../../../core/tags/TagPicker";
import { Button } from "../../../ui/Button";
import { Checkbox } from "../../../ui/Checkbox";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import { TextArea } from "../../../ui/TextArea";
import { PRIORITY_LABELS, type Priority } from "../types";
import { todoUi, useTodoUi } from "../uiStore";
import { todoItemRef, useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { DueDatePicker } from "./DueDatePicker";
import { InlineTitle } from "../../../ui/InlineTitle";
import { PastTodoDetail } from "./PastTodoDetail";
import { PlacementPicker } from "./PlacementPicker";
import { RepeatPicker } from "./RepeatPicker";
import { SubtaskList } from "./SubtaskList";

/** Props for {@link TodoDetail}. */
export interface TodoDetailProps {
  /** The todo's id (from `?item=todos.todo:<id>`). */
  id: string;
}

const NOTES_SAVE_DELAY_MS = 600;

/** The detail panel for one todo: every field, subtasks, delete. */
export function TodoDetail({ id }: TodoDetailProps) {
  const data = useTodoData();
  const actions = useTodoActions();
  const todo = data.todos.find((t) => t.id === id);
  const [dueOpenLocal, setDueOpenLocal] = useState(false);
  const [placeOpenLocal, setPlaceOpenLocal] = useState(false);
  // A shortcut (D or V) may ask for a picker; it stays open until closed here.
  const pending = useTodoUi((s) => s.pendingPicker);
  const dueOpen = dueOpenLocal || pending === "due";
  const placeOpen = placeOpenLocal || pending === "place";
  const setDueOpen = (open: boolean) => {
    setDueOpenLocal(open);
    if (!open) todoUi.requestPicker(null);
  };
  const setPlaceOpen = (open: boolean) => {
    setPlaceOpenLocal(open);
    if (!open) todoUi.requestPicker(null);
  };

  const [notes, setNotes] = useState(todo?.notes ?? "");
  const [notesSource, setNotesSource] = useState(todo?.notes ?? "");
  const [notesFocused, setNotesFocused] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  // Follow outside changes to the notes unless the user is typing in them.
  if (todo !== undefined && todo.notes !== notesSource && !notesFocused) {
    setNotesSource(todo.notes);
    setNotes(todo.notes);
  }

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
    },
    [],
  );

  if (todo === undefined) {
    // Not in the cache of open and today's todos: completed earlier, or gone.
    return data.loading ? null : <PastTodoDetail id={id} />;
  }

  const saveNotes = (value: string) => {
    window.clearTimeout(saveTimer.current);
    if (value !== todo.notes) actions.update(todo.id, { notes: value });
  };
  const done = todo.completed_at !== null;
  const parentTitle = data.lookup.todoTitle(todo.parent_id);
  const priorities: Priority[] = [3, 2, 1, 0];

  return (
    <div className="flex flex-col gap-5">
      {parentTitle !== null && todo.parent_id !== null && (
        <button
          type="button"
          onClick={() => {
            const parent = data.todos.find((t) => t.id === todo.parent_id);
            if (parent) actions.open(parent);
          }}
          className="inline-flex items-center gap-1 self-start text-sm text-text-muted hover:text-text"
        >
          <CornerLeftUp size={14} strokeWidth={1.75} aria-hidden />
          Subtask of {parentTitle}
        </button>
      )}

      <div className="flex items-center gap-3">
        <Checkbox
          checked={done}
          onCheckedChange={() => {
            actions.toggleComplete(todo);
          }}
          label={done ? "Reopen" : "Complete"}
          tone={todo.priority === 3 ? "danger" : todo.priority === 2 ? "warning" : "default"}
        />
        <InlineTitle
          size="lg"
          label="Title"
          value={todo.title}
          className={cx(done && "text-text-muted line-through")}
          onCommit={(title) => {
            actions.update(todo.id, { title });
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {data.today !== null && (
          <DueDatePicker
            value={todo.due_date}
            today={data.today}
            open={dueOpen}
            onOpenChange={setDueOpen}
            actions={actions}
            onChange={(date) => {
              actions.setDue(todo, date);
            }}
          />
        )}
        {data.today !== null && todo.parent_id === null && (
          <RepeatPicker
            todo={todo}
            today={data.today}
            onChange={(rrule) => {
              actions.setRepeat(todo, rrule);
            }}
          />
        )}
        <Menu
          align="start"
          entries={priorities.map((p) => ({
            id: `p${p}`,
            label: PRIORITY_LABELS[p],
            checked: todo.priority === p,
            onSelect: () => {
              actions.setPriority(todo, p);
            },
          }))}
          trigger={
            <Button
              size="sm"
              className={cx(
                todo.priority === 0 && "text-text-muted",
                todo.priority === 3 && "text-danger",
                todo.priority === 2 && "text-warning",
              )}
            >
              <Flag size={16} strokeWidth={1.75} aria-hidden />
              {todo.priority === 0 ? "Priority" : PRIORITY_LABELS[todo.priority as Priority]}
            </Button>
          }
        />
        <PlacementPicker
          todo={todo}
          data={data}
          open={placeOpen}
          onOpenChange={setPlaceOpen}
          onPick={(target) => {
            actions.moveTo(todo, target);
          }}
        />
        <TagPicker
          tags={data.tags}
          selected={todo.tag_ids}
          onChange={(tag_ids) => {
            actions.update(todo.id, { tag_ids });
          }}
        />
      </div>

      <TextArea
        aria-label="Notes"
        placeholder="Notes"
        value={notes}
        onFocus={() => {
          setNotesFocused(true);
        }}
        onChange={(event) => {
          const value = event.target.value;
          setNotes(value);
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            saveNotes(value);
          }, NOTES_SAVE_DELAY_MS);
        }}
        onBlur={() => {
          setNotesFocused(false);
          saveNotes(notes);
        }}
      />

      {todo.parent_id === null && (
        <SubtaskList parent={todo} todos={data.todos} actions={actions} />
      )}

      <LinkedItems entity={todoItemRef(todo.id)} title={todo.title} />

      <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-text-muted">
        <span>
          Created{" "}
          {new Date(todo.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <Button
          size="sm"
          className="text-danger"
          onClick={() => {
            actions.remove(todo);
          }}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}

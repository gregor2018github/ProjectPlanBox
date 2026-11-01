import { Flag } from "lucide-react";
import { useRef, useState, type SubmitEvent } from "react";

import { TagPicker } from "../../../core/tags/TagPicker";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Dialog } from "../../../ui/Dialog";
import { Input } from "../../../ui/Input";
import { Menu } from "../../../ui/Menu";
import { TextArea } from "../../../ui/TextArea";
import { NO_OPTIONS, type NewTodoOptions } from "../newTodoOptions";
import { PRIORITY_LABELS, type Placement, type Priority } from "../types";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { DueDatePicker } from "./DueDatePicker";
import { PlacementPicker } from "./PlacementPicker";
import { RepeatPicker } from "./RepeatPicker";

/** Props for {@link NewTodoDialog}. */
export interface NewTodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TodoData;
  actions: TodoActions;
  /** Where the todo goes unless another list is picked (the current view's). */
  placement: Placement;
  /** The due date the form starts with (e.g. today on the Today view). */
  defaultDue: string | null;
}

const PRIORITIES: Priority[] = [3, 2, 1, 0];

/**
 * The full "New todo" form: title, notes, due date, repeat, priority, list
 * and tags, all picked before the todo is added. The title is taken as typed
 * (no quick-add parsing).
 */
export function NewTodoDialog({
  open,
  onOpenChange,
  data,
  actions,
  placement,
  defaultDue,
}: NewTodoDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [options, setOptions] = useState<NewTodoOptions>(NO_OPTIONS);
  const [place, setPlace] = useState({
    list_id: placement.list_id,
    section_id: placement.section_id,
  });
  const [dueOpen, setDueOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const titleRef = useRef<HTMLInputElement>(null);
  // Start empty, in the current view's place, every time the form opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setNotes("");
      setOptions({ ...NO_OPTIONS, due_date: defaultDue });
      setPlace({ list_id: placement.list_id, section_id: placement.section_id });
    }
  }

  const set = (patch: Partial<NewTodoOptions>) => {
    setOptions((current) => ({ ...current, ...patch }));
  };
  const priority = options.priority ?? 0;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "") return;
    actions.create({
      ...place,
      parent_id: null,
      title: trimmed,
      notes: notes.trim(),
      due_date: options.due_date,
      priority,
      tag_ids: options.tag_ids,
      ...(options.rrule !== null && { rrule: options.rrule, repeat_from: options.repeat_from }),
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New todo"
      placement="top"
      initialFocus={titleRef}
    >
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 pt-3 pb-5">
        <Input
          ref={titleRef}
          aria-label="Title"
          placeholder="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <div role="group" aria-label="Options" className="flex flex-wrap gap-1">
          {data.today !== null && (
            <DueDatePicker
              value={options.due_date}
              today={data.today}
              open={dueOpen}
              onOpenChange={setDueOpen}
              actions={actions}
              onChange={(due_date) => {
                set({ due_date });
              }}
            />
          )}
          {data.today !== null && (
            <RepeatPicker
              todo={{ ...options, recurrence_anchor: null }}
              today={data.today}
              onChange={(rrule, repeat_from) => {
                set({ rrule, repeat_from });
              }}
            />
          )}
          <Menu
            align="start"
            entries={PRIORITIES.map((p) => ({
              id: `p${p}`,
              label: PRIORITY_LABELS[p],
              checked: priority === p,
              onSelect: () => {
                set({ priority: p === 0 ? null : p });
              },
            }))}
            trigger={
              <Button
                size="sm"
                className={cx(
                  priority === 0 && "text-text-muted",
                  priority === 3 && "text-danger",
                  priority === 2 && "text-warning",
                )}
              >
                <Flag size={16} strokeWidth={1.75} aria-hidden />
                {priority === 0 ? "Priority" : PRIORITY_LABELS[priority]}
              </Button>
            }
          />
          <PlacementPicker
            todo={{ ...place, parent_id: null }}
            data={data}
            open={placeOpen}
            onOpenChange={setPlaceOpen}
            label="Add to"
            onPick={setPlace}
          />
          <TagPicker
            tags={data.tags}
            selected={options.tag_ids}
            onChange={(tag_ids) => {
              set({ tag_ids });
            }}
          />
        </div>
        <TextArea
          aria-label="Notes"
          placeholder="Notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={title.trim() === ""}>
            Add todo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { Flag } from "lucide-react";
import { useState, type RefObject } from "react";

import type { Tag } from "../../../core/tags/tagQueries";
import { TagPicker } from "../../../core/tags/TagPicker";
import type { IsoDate } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Menu } from "../../../ui/Menu";
import type { NewTodoOptions } from "../newTodoOptions";
import { PRIORITY_LABELS, type Priority } from "../types";
import type { TodoActions } from "../useTodoActions";
import { DueDatePicker } from "./DueDatePicker";
import { RepeatPicker } from "./RepeatPicker";

/** Props for {@link NewTodoOptionsBar}. */
export interface NewTodoOptionsBarProps {
  value: NewTodoOptions;
  onChange: (value: NewTodoOptions) => void;
  today: IsoDate;
  tags: readonly Tag[];
  actions: TodoActions;
  /** False for subtasks, which cannot repeat. */
  canRepeat: boolean;
  /** The text field, which gets focus back when a picker closes. */
  field: RefObject<HTMLInputElement | null>;
  /** Told when a picker opens or closes (focus then leaves the field on purpose). */
  onPickerOpenChange?: (open: boolean) => void;
}

const PRIORITIES: Priority[] = [3, 2, 1, 0];

/**
 * Small date, repeat, priority and tag buttons under a new todo's field.
 * Each is only an icon until something is picked; untouched, the todo gets
 * the defaults.
 */
export function NewTodoOptionsBar({
  value,
  onChange,
  today,
  tags,
  actions,
  canRepeat,
  field,
  onPickerOpenChange,
}: NewTodoOptionsBarProps) {
  const [dueOpen, setDueOpen] = useState(false);
  const pickerOpenChange = (open: boolean) => {
    onPickerOpenChange?.(open);
  };
  const set = (patch: Partial<NewTodoOptions>) => {
    onChange({ ...value, ...patch });
  };
  const priority = value.priority ?? 0;

  return (
    <div role="group" aria-label="Options" className="flex flex-wrap items-center gap-0.5 pl-6">
      <DueDatePicker
        compact
        value={value.due_date}
        today={today}
        open={dueOpen}
        onOpenChange={(open) => {
          setDueOpen(open);
          pickerOpenChange(open);
        }}
        actions={actions}
        finalFocus={field}
        onChange={(due_date) => {
          set({ due_date });
        }}
      />
      {canRepeat && (
        <RepeatPicker
          compact
          todo={{ ...value, recurrence_anchor: null }}
          today={today}
          onOpenChange={pickerOpenChange}
          finalFocus={field}
          onChange={(rrule, repeat_from) => {
            set({ rrule, repeat_from });
          }}
        />
      )}
      <Menu
        align="start"
        onOpenChange={pickerOpenChange}
        finalFocus={field}
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
            aria-label={priority === 0 ? "Priority" : `Priority: ${PRIORITY_LABELS[priority]}`}
            className={cx(
              "px-1.5 font-normal",
              priority === 3 ? "text-danger" : priority === 2 ? "text-warning" : "text-text-muted",
            )}
          >
            <Flag size={14} strokeWidth={1.75} aria-hidden />
            {priority !== 0 && PRIORITY_LABELS[priority]}
          </Button>
        }
      />
      <TagPicker
        compact
        tags={tags}
        selected={value.tag_ids}
        onOpenChange={pickerOpenChange}
        finalFocus={field}
        onChange={(tag_ids) => {
          set({ tag_ids });
        }}
      />
    </div>
  );
}

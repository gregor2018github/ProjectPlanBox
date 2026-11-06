import { FolderInput } from "lucide-react";
import { useRef, type RefObject } from "react";

import { byPosition } from "../../../core/ordering";
import { Button } from "../../../ui/Button";
import { PickerList, type PickerOption } from "../../../ui/PickerList";
import { Popover } from "../../../ui/Popover";
import type { Todo } from "../types";
import type { TodoData } from "../useTodoData";

/** Props for {@link PlacementPicker}. */
export interface PlacementPickerProps {
  /** Where the todo is now; subtasks (with a parent) cannot be moved. */
  todo: Pick<Todo, "list_id" | "section_id" | "parent_id">;
  data: TodoData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (target: { list_id: string | null; section_id: string | null }) => void;
  /** The popover's name and search placeholder; "Move to" by default. */
  label?: string;
  /** A small trigger: only the icon while in the Inbox, the place's name otherwise. */
  compact?: boolean;
  /** Where focus goes on close (default: back to the trigger). */
  finalFocus?: RefObject<HTMLElement | null> | undefined;
}

/** "Move to…": Inbox, every list, and the sections under each list. */
export function PlacementPicker({
  todo,
  data,
  open,
  onOpenChange,
  onPick,
  label = "Move to",
  compact = false,
  finalFocus,
}: PlacementPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const areaName = new Map(data.areas.map((a) => [a.id, a.name]));
  const options: PickerOption[] = [
    { id: "inbox", label: "Inbox", checked: todo.list_id === null },
    ...[...data.lists].sort(byPosition).flatMap((list) => [
      {
        id: `list:${list.id}`,
        label: list.name,
        ...(list.area_id !== null && { hint: areaName.get(list.area_id) ?? "" }),
        checked: todo.list_id === list.id && todo.section_id === null,
      },
      ...data.sections
        .filter((s) => s.list_id === list.id)
        .sort(byPosition)
        .map((s) => ({
          id: `section:${s.id}:${list.id}`,
          label: s.name,
          hint: list.name,
          nested: true,
          checked: todo.section_id === s.id,
        })),
    ]),
  ];

  const pick = (option: PickerOption) => {
    const [kind, id, listId] = option.id.split(":");
    if (kind === "inbox") onPick({ list_id: null, section_id: null });
    else if (kind === "list" && id !== undefined) onPick({ list_id: id, section_id: null });
    else if (id !== undefined && listId !== undefined) onPick({ list_id: listId, section_id: id });
    onOpenChange(false);
  };

  const place = data.lookup.listName(todo.list_id);
  const section = data.lookup.sectionName(todo.section_id);
  const name = section === null ? place : `${place} / ${section}`;

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      initialFocus={inputRef}
      finalFocus={finalFocus}
      trigger={
        compact ? (
          <Button
            size="sm"
            aria-label={`${label}: ${name}`}
            disabled={todo.parent_id !== null}
            className="px-1.5 font-normal text-text-muted"
          >
            <FolderInput size={14} strokeWidth={1.75} aria-hidden />
            {todo.list_id !== null && name}
          </Button>
        ) : (
          <Button size="sm" disabled={todo.parent_id !== null}>
            <FolderInput size={16} strokeWidth={1.75} aria-hidden />
            {name}
          </Button>
        )
      }
    >
      <PickerList
        label={label}
        options={options}
        onPick={pick}
        placeholder={`${label}…`}
        inputRef={inputRef}
      />
    </Popover>
  );
}

import { FolderInput } from "lucide-react";
import { useRef } from "react";

import { byPosition } from "../../../core/ordering";
import { Button } from "../../../ui/Button";
import { PickerList, type PickerOption } from "../../../ui/PickerList";
import { Popover } from "../../../ui/Popover";
import type { Todo } from "../types";
import type { TodoData } from "../useTodoData";

/** Props for {@link PlacementPicker}. */
export interface PlacementPickerProps {
  todo: Todo;
  data: TodoData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (target: { list_id: string | null; section_id: string | null }) => void;
}

/** "Move to…": Inbox, every list, and the sections under each list. */
export function PlacementPicker({ todo, data, open, onOpenChange, onPick }: PlacementPickerProps) {
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

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label="Move to"
      initialFocus={inputRef}
      trigger={
        <Button size="sm" disabled={todo.parent_id !== null}>
          <FolderInput size={16} strokeWidth={1.75} aria-hidden />
          {section === null ? place : `${place} / ${section}`}
        </Button>
      }
    >
      <PickerList
        label="Move to"
        options={options}
        onPick={pick}
        placeholder="Move to…"
        inputRef={inputRef}
      />
    </Popover>
  );
}

import { Tag as TagIcon } from "lucide-react";
import { useRef, useState } from "react";

import { newTagVars, useCreateTag, type Tag } from "./tagQueries";
import { Button } from "../../ui/Button";
import { PickerList } from "../../ui/PickerList";
import { Popover } from "../../ui/Popover";

/** Props for {@link TagPicker}. */
export interface TagPickerProps {
  tags: readonly Tag[];
  selected: readonly string[];
  onChange: (tagIds: string[]) => void;
}

/** Toggle tags on an item; typing a new name and pressing Enter creates it. */
export function TagPicker({ tags, selected, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTag = useCreateTag();

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Tags"
      initialFocus={inputRef}
      trigger={
        <Button size="sm" className={selected.length === 0 ? "text-text-muted" : undefined}>
          <TagIcon size={16} strokeWidth={1.75} aria-hidden />
          {selected.length === 0
            ? "Add tags"
            : `${selected.length} tag${selected.length === 1 ? "" : "s"}`}
        </Button>
      }
    >
      <PickerList
        label="Tags"
        placeholder="Find or create a tag…"
        inputRef={inputRef}
        options={tags.map((t) => ({ id: t.id, label: t.name, checked: selected.includes(t.id) }))}
        onPick={(option) => {
          toggle(option.id);
        }}
        onCreate={(name) => {
          const vars = newTagVars(name.replace(/[\s#@]/g, ""));
          if (vars.name === "") return;
          void createTag.mutateAsync(vars).then(() => {
            onChange([...selected, vars.id]);
          });
        }}
      />
    </Popover>
  );
}

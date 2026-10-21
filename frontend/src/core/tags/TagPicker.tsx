import { Tag as TagIcon } from "lucide-react";
import { useRef, useState, type RefObject } from "react";

import { newTagVars, useCreateTag, type Tag } from "./tagQueries";
import { Button } from "../../ui/Button";
import { PickerList } from "../../ui/PickerList";
import { Popover } from "../../ui/Popover";

/** Props for {@link TagPicker}. */
export interface TagPickerProps {
  tags: readonly Tag[];
  selected: readonly string[];
  onChange: (tagIds: string[]) => void;
  /** Controlled opening (e.g. by the L shortcut); uncontrolled when absent. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A small trigger: only the icon without tags, the count with some. */
  compact?: boolean;
  /** Where focus goes on close (default: back to the trigger). */
  finalFocus?: RefObject<HTMLElement | null> | undefined;
}

/** Toggle tags on an item; typing a new name and pressing Enter creates it. */
export function TagPicker({
  tags,
  selected,
  onChange,
  open: openProp,
  onOpenChange,
  compact = false,
  finalFocus,
}: TagPickerProps) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (next: boolean) => {
    setOpenLocal(next);
    onOpenChange?.(next);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const createTag = useCreateTag();

  const names = tags.filter((t) => selected.includes(t.id)).map((t) => t.name);
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Tags"
      initialFocus={inputRef}
      finalFocus={finalFocus}
      trigger={
        compact ? (
          <Button
            size="sm"
            aria-label={names.length === 0 ? "Add tags" : `Tags: ${names.join(", ")}`}
            className="px-1.5 font-normal text-text-muted"
          >
            <TagIcon size={14} strokeWidth={1.75} aria-hidden />
            {names.length > 0 && names.join(", ")}
          </Button>
        ) : (
          <Button size="sm" className={selected.length === 0 ? "text-text-muted" : undefined}>
            <TagIcon size={16} strokeWidth={1.75} aria-hidden />
            {selected.length === 0
              ? "Add tags"
              : `${selected.length} tag${selected.length === 1 ? "" : "s"}`}
          </Button>
        )
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

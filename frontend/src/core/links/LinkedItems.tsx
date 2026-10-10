import { useNavigate } from "@tanstack/react-router";
import { Link2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "../../ui/Button";
import { PickerList, type PickerOption } from "../../ui/PickerList";
import { Popover } from "../../ui/Popover";
import { entityTypeOf } from "./linkables";
import { useLinkableSources } from "./linkablesContext";
import { otherEnd, useLinkActions, useLinks } from "./linkQueries";
import { LinkedItemRow } from "./LinkedItemRow";

/** Props for {@link LinkedItems}. */
export interface LinkedItemsProps {
  /** The entity being viewed, e.g. "todos.todo:<id>". */
  entity: string;
  /** Its title (shown on the other end until the server confirms). */
  title: string;
}

/**
 * The "Links" block of a detail panel: what this item links to and what
 * links to it, in any module. Items open in the detail panel; "Link…" picks
 * from everything the modules publish as linkable.
 */
export function LinkedItems({ entity, title }: LinkedItemsProps) {
  const { data: links = [] } = useLinks(entity);
  const sources = useLinkableSources();
  const actions = useLinkActions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const linked = useMemo(() => new Set(links.map((l) => otherEnd(l, entity).ref)), [links, entity]);
  const options = useMemo<PickerOption[]>(
    () =>
      sources.flatMap((source) =>
        source.items
          .filter((item) => item.ref !== entity && !linked.has(item.ref))
          .map((item) => ({
            id: item.ref,
            label: item.title,
            hint: item.hint ?? source.noun,
          })),
      ),
    [sources, entity, linked],
  );
  const sourceOf = (ref: string) => sources.find((s) => s.entityType === entityTypeOf(ref));

  return (
    <section aria-label="Links" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-text-muted">Links</h2>
        <Popover
          open={open}
          onOpenChange={setOpen}
          label="Link to"
          align="end"
          initialFocus={inputRef}
          trigger={
            <Button size="sm" className="text-text-muted">
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              Link…
            </Button>
          }
        >
          <PickerList
            label="Link to"
            placeholder="Find a todo, note, link…"
            inputRef={inputRef}
            options={options}
            onPick={(option) => {
              actions.add(
                { ref: entity, title, deleted: false },
                { ref: option.id, title: option.label, deleted: false },
              );
              setOpen(false);
            }}
          />
        </Popover>
      </div>
      {links.length === 0 ? (
        <p className="px-2 text-sm text-text-muted">Nothing linked yet.</p>
      ) : (
        <ul className="flex flex-col">
          {links.map((link) => {
            const end = otherEnd(link, entity);
            const source = sourceOf(end.ref);
            return (
              <LinkedItemRow
                key={link.id}
                end={end}
                icon={source?.icon ?? Link2}
                noun={source?.noun ?? "Item"}
                onOpen={() => {
                  void navigate({
                    to: ".",
                    search: (prev: Record<string, unknown>) => ({ ...prev, item: end.ref }),
                  });
                }}
                onRemove={() => {
                  actions.remove(link, entity);
                }}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

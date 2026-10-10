import { List, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { useSortableItem } from "../../../ui/dnd";
import { resolveContainerDrop } from "../dropRules";
import { todoPaths } from "../paths";
import type { TodoList } from "../types";
import type { ContainerActions } from "../useContainerActions";
import { NameDialog } from "../../../ui/NameDialog";
import { SidebarLink } from "./SidebarLink";

/** Props for {@link ListLink}. */
export interface ListLinkProps {
  list: TodoList;
  count: number;
  containers: ContainerActions;
  /** Position among the lists of the same area (for drag and drop). */
  index: number;
  /** Ids of the lists shown in the same area, in order. */
  siblingIds: readonly string[];
  indent?: boolean;
}

/**
 * A list in the sidebar. Drag it to reorder or move between areas; drop
 * todos on it to move them here; right-click to rename or delete.
 */
export function ListLink({
  list,
  count,
  containers,
  index,
  siblingIds,
  indent = false,
}: ListLinkProps) {
  const [renaming, setRenaming] = useState(false);
  const { ref, isDragging } = useSortableItem({
    id: list.id,
    index,
    group: `lists:${list.area_id ?? "loose"}`,
    type: "list",
    accept: "list",
    data: { kind: "container-row", parentId: list.area_id, ids: siblingIds },
    onDragEnd: (info) => {
      const move = resolveContainerDrop(list.id, info);
      if (move) containers.move({ kind: "list", id: list.id, parent_id: move.parentId, ...move });
    },
  });

  return (
    <>
      <ContextMenu
        entries={[
          {
            id: "rename",
            label: "Rename list",
            icon: Pencil,
            onSelect: () => {
              setRenaming(true);
            },
          },
          {
            id: "delete",
            label: "Delete list",
            icon: Trash2,
            danger: true,
            onSelect: () => {
              containers.remove("list", list.id, list.name);
            },
          },
        ]}
      >
        <div
          ref={ref}
          className={cx("touch-manipulation", isDragging && "rounded-md bg-surface shadow-md")}
        >
          <SidebarLink
            to={todoPaths.list(list.id)}
            label={list.name}
            icon={List}
            count={count}
            indent={indent}
            dropPlacement={{ list_id: list.id, section_id: null, parent_id: null }}
          />
        </div>
      </ContextMenu>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename list"
        initial={list.name}
        submitLabel="Rename"
        onSubmit={(name) => {
          containers.rename("list", list.id, name);
        }}
      />
    </>
  );
}

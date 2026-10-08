import { List, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { todoPaths } from "../paths";
import type { TodoList } from "../types";
import type { ContainerActions } from "../useContainerActions";
import { NameDialog } from "./NameDialog";
import { SidebarLink } from "./SidebarLink";

/** Props for {@link ListLink}. */
export interface ListLinkProps {
  list: TodoList;
  count: number;
  containers: ContainerActions;
  indent?: boolean;
}

/** A list in the sidebar; right-click (or long-press) to rename or delete. */
export function ListLink({ list, count, containers, indent = false }: ListLinkProps) {
  const [renaming, setRenaming] = useState(false);
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
        <div>
          <SidebarLink
            to={todoPaths.list(list.id)}
            label={list.name}
            icon={List}
            count={count}
            indent={indent}
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

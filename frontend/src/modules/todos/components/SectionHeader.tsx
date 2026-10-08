import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import type { Section } from "../types";
import type { ContainerActions } from "../useContainerActions";
import { NameDialog } from "./NameDialog";

/** Props for {@link SectionHeader}. */
export interface SectionHeaderProps {
  section: Section;
  containers: ContainerActions;
}

/** A section heading inside a list, with rename and delete. */
export function SectionHeader({ section, containers }: SectionHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="group mt-6 mb-1 flex items-center justify-between gap-2 border-b border-border px-3 pb-1">
      <h2 className="truncate text-base font-semibold">{section.name}</h2>
      <Menu
        entries={[
          {
            id: "rename",
            label: "Rename section",
            icon: Pencil,
            onSelect: () => {
              setRenaming(true);
            },
          },
          {
            id: "delete",
            label: "Delete section",
            icon: Trash2,
            danger: true,
            onSelect: () => {
              containers.remove("section", section.id, section.name);
            },
          },
        ]}
        trigger={
          <IconButton
            label={`Actions for section “${section.name}”`}
            icon={MoreHorizontal}
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100"
          />
        }
      />
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename section"
        initial={section.name}
        submitLabel="Rename"
        onSubmit={(name) => {
          containers.rename("section", section.id, name);
        }}
      />
    </div>
  );
}

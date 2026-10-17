import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { IconButton } from "../../../ui/IconButton";
import { cx } from "../../../ui/cx";
import { useDropTarget } from "../../../ui/dnd";
import { washProps } from "../../../ui/tint";
import { TintDot } from "../../../ui/TintDot";
import { todoCreate } from "../createStore";
import { todoPaths } from "../paths";
import type { Area, TodoList } from "../types";
import type { ContainerActions } from "../useContainerActions";
import { AreaSettingsDialog } from "./AreaSettingsDialog";
import { ListLink } from "./ListLink";

/** Props for {@link AreaNavGroup}. */
export interface AreaNavGroupProps {
  area: Area;
  lists: readonly TodoList[];
  counts: Record<string, number>;
  collapsed: boolean;
  onToggle: () => void;
  containers: ContainerActions;
}

/**
 * An area in the sidebar: a collapsible heading (drop lists on it; "+" adds a
 * list to it; right-click for settings) with its lists, on a wash of the area's colour.
 */
export function AreaNavGroup({
  area,
  lists,
  counts,
  collapsed,
  onToggle,
  containers,
}: AreaNavGroupProps) {
  const { ref, isDropTarget } = useDropTarget({
    id: `area:${area.id}`,
    accept: "list",
    data: { kind: "container-destination", parentId: area.id },
  });
  const ids = lists.map((l) => l.id);
  const [settings, setSettings] = useState(false);

  return (
    <div
      {...washProps(area.hue)}
      className="flex flex-col gap-0.5 rounded-lg bg-wash p-0.5 transition-colors duration-(--duration-base) ease-out"
    >
      <ContextMenu
        entries={[
          {
            id: "list",
            label: "New list in this area",
            icon: Plus,
            onSelect: () => {
              todoCreate.list(area.id);
            },
          },
          {
            id: "settings",
            label: "Area settings…",
            icon: Settings2,
            onSelect: () => {
              setSettings(true);
            },
          },
          {
            id: "delete",
            label: "Delete area",
            icon: Trash2,
            danger: true,
            onSelect: () => {
              containers.remove("area", area.id, area.name);
            },
          },
        ]}
      >
        <div
          ref={ref}
          className={cx(
            "group flex h-8 items-center gap-1 rounded-md coarse:h-11",
            isDropTarget && "bg-accent-subtle ring-2 ring-accent",
          )}
        >
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Show" : "Hide"} lists in ${area.name}`}
            onClick={onToggle}
            className="inline-flex size-6 items-center justify-center rounded-sm text-text-muted hover:bg-hover coarse:size-11"
          >
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              aria-hidden
              className={cx(
                "transition-transform duration-(--duration-fast) ease-out",
                !collapsed && "rotate-90",
              )}
            />
          </button>
          <Link
            to={todoPaths.area(area.id)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-sm font-medium text-text-muted hover:text-text data-[status=active]:text-text"
          >
            <TintDot hue={area.hue} />
            <span className="truncate">{area.name}</span>
          </Link>
          <IconButton
            label={`New list in ${area.name}`}
            icon={Plus}
            onClick={() => {
              todoCreate.list(area.id);
            }}
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100"
          />
        </div>
      </ContextMenu>
      {!collapsed && (
        <div className="flex flex-col gap-0.5">
          {lists.map((list, index) => (
            <ListLink
              key={list.id}
              list={list}
              count={counts[list.id] ?? 0}
              containers={containers}
              index={index}
              siblingIds={ids}
              indent
            />
          ))}
        </div>
      )}
      <AreaSettingsDialog
        area={area}
        open={settings}
        onOpenChange={setSettings}
        containers={containers}
      />
    </div>
  );
}

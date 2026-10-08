import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cx } from "../../../ui/cx";
import { todoPaths } from "../paths";
import type { Area, TodoList } from "../types";
import type { ContainerActions } from "../useContainerActions";
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

/** An area in the sidebar: a collapsible heading with its lists. */
export function AreaNavGroup({
  area,
  lists,
  counts,
  collapsed,
  onToggle,
  containers,
}: AreaNavGroupProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-8 items-center gap-1 coarse:h-11">
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
          className="flex-1 truncate rounded-md px-1 text-sm font-medium text-text-muted hover:text-text data-[status=active]:text-text"
        >
          {area.name}
        </Link>
      </div>
      {!collapsed &&
        lists.map((list) => (
          <ListLink
            key={list.id}
            list={list}
            count={counts[list.id] ?? 0}
            containers={containers}
            indent
          />
        ))}
    </div>
  );
}

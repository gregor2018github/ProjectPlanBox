import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cx } from "../../../ui/cx";
import { useDropTarget } from "../../../ui/dnd";
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

/** An area in the sidebar: a collapsible heading (drop lists on it) with its lists. */
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

  return (
    <div className="flex flex-col gap-0.5">
      <div
        ref={ref}
        className={cx(
          "flex h-8 items-center gap-1 rounded-md coarse:h-11",
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
          className="flex-1 truncate rounded-md px-1 text-sm font-medium text-text-muted hover:text-text data-[status=active]:text-text"
        >
          {area.name}
        </Link>
      </div>
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
    </div>
  );
}

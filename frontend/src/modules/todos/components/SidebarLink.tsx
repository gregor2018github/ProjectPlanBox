import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cx } from "../../../ui/cx";
import { useDropTarget } from "../../../ui/dnd";
import type { Placement } from "../types";

/** Props for {@link SidebarLink}. */
export interface SidebarLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Tints the count (e.g. overdue items in Today). */
  alert?: boolean;
  indent?: boolean;
  /** Dropping a todo here moves it to the end of this container. */
  dropPlacement?: Placement;
}

/** A navigation entry with an optional open-count badge; optionally a drop target for todos. */
export function SidebarLink({
  to,
  label,
  icon: Icon,
  count,
  alert = false,
  indent = false,
  dropPlacement,
}: SidebarLinkProps) {
  const { ref, isDropTarget } = useDropTarget({
    id: `dest:${to}`,
    accept: "todo",
    data: { kind: "todo-destination", placement: dropPlacement ?? null },
    disabled: dropPlacement === undefined,
  });
  return (
    <Link
      ref={ref}
      to={to}
      className={cx(
        "flex h-8 items-center gap-2 rounded-md px-2 text-base text-text transition-colors duration-(--duration-fast) ease-out hover:bg-hover data-[status=active]:bg-selected data-[status=active]:font-medium coarse:h-11",
        indent && "pl-7",
        isDropTarget && "bg-accent-subtle ring-2 ring-accent",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cx("text-sm tabular-nums", alert ? "text-danger" : "text-text-muted")}>
          {count}
        </span>
      )}
    </Link>
  );
}

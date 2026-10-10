import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cx } from "../../../ui/cx";
import { useDropTarget } from "../../../ui/dnd";
import { collectionDropData, ENTRY_DRAG_TYPE } from "../entryDrop";

/** Props for {@link KnowledgeNavLink}. */
export interface KnowledgeNavLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Exact match only (for "All entries", whose path prefixes the others). */
  exact?: boolean;
  /** Dropping an entry here moves it to this collection (null = Unsorted). */
  dropCollection?: string | null;
}

/** A knowledge navigation entry with a count; optionally a drop target for entries. */
export function KnowledgeNavLink({
  to,
  label,
  icon: Icon,
  count,
  exact = false,
  dropCollection,
}: KnowledgeNavLinkProps) {
  const { ref, isDropTarget } = useDropTarget({
    id: `knowledge-dest:${to}`,
    accept: ENTRY_DRAG_TYPE,
    data: { ...collectionDropData(dropCollection ?? null) },
    disabled: dropCollection === undefined,
  });
  return (
    <Link
      ref={ref}
      to={to}
      activeOptions={{ exact }}
      className={cx(
        "flex h-8 items-center gap-2 rounded-md px-2 text-base text-text transition-colors duration-(--duration-fast) ease-out hover:bg-hover data-[status=active]:bg-selected data-[status=active]:font-medium coarse:h-11",
        isDropTarget && "bg-accent-subtle ring-2 ring-accent",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-sm text-text-muted tabular-nums">{count}</span>
      )}
    </Link>
  );
}

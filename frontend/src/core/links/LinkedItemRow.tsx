import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

import { cx } from "../../ui/cx";
import { IconButton } from "../../ui/IconButton";
import type { LinkEnd } from "./linkQueries";

/** Props for {@link LinkedItemRow}. */
export interface LinkedItemRowProps {
  end: LinkEnd;
  icon: LucideIcon;
  /** What the item is, e.g. "Todo" (shown to screen readers and as a hint). */
  noun: string;
  onOpen: () => void;
  onRemove: () => void;
}

/** One linked item: click opens it in the detail panel; × removes the link. */
export function LinkedItemRow({ end, icon: Icon, noun, onOpen, onRemove }: LinkedItemRowProps) {
  return (
    <li className="flex items-center gap-1 rounded-md hover:bg-hover">
      <button
        type="button"
        disabled={end.deleted}
        onClick={onOpen}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-base coarse:min-h-11"
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
        <span className={cx("truncate", end.deleted && "text-text-muted line-through")}>
          {end.title}
        </span>
        <span className="sr-only">({end.deleted ? `deleted ${noun.toLowerCase()}` : noun})</span>
      </button>
      <IconButton label={`Remove link to “${end.title}”`} icon={X} onClick={onRemove} />
    </li>
  );
}

import { CalendarDays, Flag, Hash, Tag } from "lucide-react";

import { formatRelativeDay, type IsoDate } from "../../../core/time";
import type { ParsedToken } from "../quickAddParser";

/** Props for {@link ParsedChips}. */
export interface ParsedChipsProps {
  tokens: readonly ParsedToken[];
  today: IsoDate | null;
}

const icons = { due: CalendarDays, priority: Flag, place: Hash, tag: Tag } as const;

/** Shows what the quick-add parser understood, as you type. */
export function ParsedChips({ tokens, today }: ParsedChipsProps) {
  return (
    <ul aria-label="Recognised" className="flex flex-wrap gap-1.5 pl-7.5">
      {tokens.map((token, i) => {
        const Icon = icons[token.kind];
        const label =
          token.kind === "due" && today !== null
            ? formatRelativeDay(token.label, today)
            : token.label;
        return (
          <li
            key={`${token.kind}-${i}`}
            className="inline-flex h-6 items-center gap-1 rounded-sm bg-accent-subtle px-1.5 text-xs text-text"
          >
            <Icon size={12} strokeWidth={2} aria-hidden className="text-accent" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

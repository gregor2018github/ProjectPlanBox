import { FileText } from "lucide-react";

import type { LinkableSource } from "../links/linkables";
import { MarkedText } from "./MarkedText";
import type { SearchHit } from "./searchQueries";

/** Props for {@link SearchHitContent}. */
export interface SearchHitContentProps {
  hit: SearchHit;
  /** The linkable source of the hit's entity type (icon and noun), if a module publishes one. */
  source: LinkableSource | undefined;
}

/** One search result inside a list option: icon, marked title, context and snippet. */
export function SearchHitContent({ hit, source }: SearchHitContentProps) {
  const Icon = source?.icon ?? FileText;
  const hint = hit.hint !== "" ? hit.hint : (source?.noun ?? "Item");
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3">
      <Icon size={16} strokeWidth={1.75} aria-hidden className="mt-1 shrink-0 text-text-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="truncate">
            <MarkedText text={hit.title} />
          </span>
          <span className="shrink-0 text-sm text-text-muted">{hint}</span>
        </span>
        {hit.snippet !== "" && (
          <span className="truncate text-sm text-text-muted">
            <MarkedText text={hit.snippet} />
          </span>
        )}
      </span>
    </span>
  );
}

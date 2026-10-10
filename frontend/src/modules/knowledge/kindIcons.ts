import { Code2, Globe, StickyNote, type LucideIcon } from "lucide-react";

import type { EntryKind } from "./types";

/** The icon of each entry kind. */
export const KIND_ICONS: Record<EntryKind, LucideIcon> = {
  note: StickyNote,
  link: Globe,
  snippet: Code2,
};

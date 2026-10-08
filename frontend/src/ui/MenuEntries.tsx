import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check } from "lucide-react";

import { cx } from "./cx";
import { Kbd } from "./Kbd";
import type { MenuEntry } from "./menuTypes";

/** Props for {@link MenuEntries}. */
export interface MenuEntriesProps {
  entries: readonly MenuEntry[];
}

/** Renders menu entries; shared by the dropdown and the context menu. */
export function MenuEntries({ entries }: MenuEntriesProps) {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === "separator" ? (
          <BaseMenu.Separator key={entry.id} className="my-1 h-px bg-border" />
        ) : (
          <BaseMenu.Item
            key={entry.id}
            label={entry.label}
            disabled={entry.disabled === true}
            onClick={entry.onSelect}
            className={cx(
              "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-base outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover coarse:h-11",
              entry.danger === true ? "text-danger" : "text-text",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {entry.checked === true ? (
                <Check size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                entry.icon && <entry.icon size={16} strokeWidth={1.75} aria-hidden />
              )}
            </span>
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.shortcut !== undefined && <Kbd keys={entry.shortcut} />}
          </BaseMenu.Item>
        ),
      )}
    </>
  );
}

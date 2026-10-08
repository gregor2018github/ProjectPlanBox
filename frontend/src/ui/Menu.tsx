import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement } from "react";

import { MenuEntries } from "./MenuEntries";
import type { MenuEntry } from "./menuTypes";

/** Classes shared by dropdown and context menu popups. */
export const MENU_POPUP_CLASS =
  "min-w-52 rounded-lg bg-surface-raised p-1 text-text shadow-md outline-none transition-[opacity,transform] duration-(--duration-base) ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[starting-style]:scale-97 data-[starting-style]:opacity-0 dark:inset-ring dark:inset-ring-border";

/** Props for {@link Menu}. */
export interface MenuProps {
  /** The button that opens the menu (must accept props and a ref). */
  trigger: ReactElement;
  entries: readonly MenuEntry[];
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** A dropdown menu of actions, fully keyboard operable. */
export function Menu({ trigger, entries, align = "end", open, onOpenChange }: MenuProps) {
  return (
    <BaseMenu.Root
      {...(open !== undefined && { open })}
      {...(onOpenChange && {
        onOpenChange: (next: boolean) => {
          onOpenChange(next);
        },
      })}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} sideOffset={4} collisionPadding={8} className="z-50">
          <BaseMenu.Popup className={MENU_POPUP_CLASS}>
            <MenuEntries entries={entries} />
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

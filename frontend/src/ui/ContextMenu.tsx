import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type { ReactElement } from "react";

import { MENU_POPUP_CLASS } from "./Menu";
import { MenuEntries } from "./MenuEntries";
import type { MenuEntry } from "./menuTypes";

/** Props for {@link ContextMenu}. */
export interface ContextMenuProps {
  /** The element that opens the menu on right-click or long-press. */
  children: ReactElement;
  entries: readonly MenuEntry[];
}

/** Right-click (or long-press on touch) menu; the same actions as the row's ⋯ button. */
export function ContextMenu({ children, entries }: ContextMenuProps) {
  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger render={children} />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner collisionPadding={8} className="z-50">
          <BaseContextMenu.Popup className={MENU_POPUP_CLASS}>
            <MenuEntries entries={entries} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}

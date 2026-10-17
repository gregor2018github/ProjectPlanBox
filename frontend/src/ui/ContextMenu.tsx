import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { useState, type ReactElement } from "react";

import { isDragMoving, useDragMoving } from "./dnd";
import { MENU_POPUP_CLASS } from "./Menu";
import { MenuEntries } from "./MenuEntries";
import { safeCollisionPadding } from "./safeArea";
import { isTouchOpen } from "./touchHold";
import type { MenuEntry } from "./menuTypes";

/** Props for {@link ContextMenu}. */
export interface ContextMenuProps {
  /** The element that opens the menu on right-click or long-press. */
  children: ReactElement;
  entries: readonly MenuEntry[];
  /**
   * Whether a long-press on touch opens the menu (default true). Rows with
   * their own ⋯ button turn it off, so a long-press only starts a drag.
   */
  longPress?: boolean;
}

/**
 * Right-click (or long-press on touch) menu; the same actions as the row's ⋯
 * button. On touch a long-press also picks the row up for dragging, so the
 * menu closes (and stays shut) once the drag moves. With `longPress` off,
 * touch never opens it at all.
 */
export function ContextMenu({ children, entries, longPress = true }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const dragMoving = useDragMoving();
  if (open && dragMoving) setOpen(false);
  return (
    <BaseContextMenu.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next && isDragMoving()) return;
        if (next && !longPress && isTouchOpen(details.event)) return;
        setOpen(next);
      }}
    >
      <BaseContextMenu.Trigger render={children} />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner collisionPadding={safeCollisionPadding()} className="z-50">
          <BaseContextMenu.Popup className={MENU_POPUP_CLASS}>
            <MenuEntries entries={entries} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}

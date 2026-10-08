import type { LucideIcon } from "lucide-react";

/** One action in a {@link Menu} or {@link ContextMenu}. */
export interface MenuAction {
  kind?: "action";
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Key spec shown on the right, e.g. "T". */
  shortcut?: string;
  /** Destructive actions are tinted. */
  danger?: boolean;
  /** Shows a check mark (for "current value" items such as a priority). */
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A divider between groups of actions. */
export interface MenuSeparator {
  kind: "separator";
  id: string;
}

/** An entry of a menu. */
export type MenuEntry = MenuAction | MenuSeparator;

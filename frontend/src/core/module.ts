import type { AnyRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/** Props the shell passes to a rail pane. */
export interface RailPaneProps {
  /** Closes the pane. */
  onClose: () => void;
}

/** A module's entry in the right-hand icon rail and the pane it opens. */
export interface RailItem {
  /** Accessible name and tooltip, e.g. "Calendar". */
  label: string;
  icon: LucideIcon;
  /** Key spec that toggles the pane, e.g. "C". */
  shortcut?: string;
  /** The pane's whole content, header included. */
  Pane: ComponentType<RailPaneProps>;
}

/**
 * What a feature module contributes to the app shell. Modules are listed
 * only in `src/modules/index.ts` (the composition root).
 */
export interface ModuleManifest {
  /** Matches the backend module id (URL prefix, entity type prefix). */
  id: string;
  /** Human-readable name. */
  label: string;
  /** Where "/" sends the user (the first module with one wins). */
  homePath?: string;
  /** The module's routes, attached under the root route. */
  routes: (parent: AnyRoute) => AnyRoute[];
  /** Rendered in the sidebar navigation. */
  SidebarSection?: ComponentType;
  /** Mounted once for the app's lifetime: registers commands, shortcuts, quick-add. */
  Host?: ComponentType;
  /** Detail panel content per entity type, e.g. `{ "todos.todo": TodoDetail }`. */
  detail?: Readonly<Record<string, ComponentType<{ id: string }>>>;
  /** An icon in the right-hand rail that toggles a side pane (e.g. the calendar). */
  rail?: RailItem;
}

import type { AnyRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";

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
}

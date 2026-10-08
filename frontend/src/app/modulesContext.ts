import { createContext, useContext } from "react";

import type { ModuleManifest } from "../core/module";

/** The enabled modules, provided by <App>. */
export const ModulesContext = createContext<readonly ModuleManifest[]>([]);

/** Returns the enabled modules. */
export function useModules(): readonly ModuleManifest[] {
  return useContext(ModulesContext);
}

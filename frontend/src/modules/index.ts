/**
 * Composition root for feature modules: the only list of modules.
 * Adding a module means adding one entry here and touching no other module.
 */
import type { ModuleManifest } from "../core/module";

/** Every enabled module, in sidebar order. */
export const MODULES: readonly ModuleManifest[] = [];

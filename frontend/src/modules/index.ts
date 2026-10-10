/**
 * Composition root for feature modules: the only list of modules.
 * Adding a module means adding one entry here and touching no other module.
 */
import type { ModuleManifest } from "../core/module";
import { calendarModule } from "./calendar";
import { knowledgeModule } from "./knowledge";
import { todosModule } from "./todos";

/** Every enabled module, in sidebar order. */
export const MODULES: readonly ModuleManifest[] = [todosModule, knowledgeModule, calendarModule];

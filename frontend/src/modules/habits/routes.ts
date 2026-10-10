import { createRoute, type AnyRoute } from "@tanstack/react-router";

import { HabitsPage } from "./pages/HabitsPage";
import { HABITS_PATH } from "./paths";

/** The module's routes, attached under the app's root route. */
export function habitRoutes(parent: AnyRoute): AnyRoute[] {
  return [createRoute({ getParentRoute: () => parent, path: HABITS_PATH, component: HabitsPage })];
}

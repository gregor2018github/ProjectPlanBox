import { createRoute, type AnyRoute } from "@tanstack/react-router";

import { CalendarPage } from "./pages/CalendarPage";
import { CALENDAR_PATH, parseCalendarSearch } from "./paths";

/** The module's routes, attached under the app's root route. */
export function calendarRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: CALENDAR_PATH,
      component: CalendarPage,
      validateSearch: parseCalendarSearch,
    }),
  ];
}

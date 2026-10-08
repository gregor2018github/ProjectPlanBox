import { createRoute, type AnyRoute, type RouteComponent } from "@tanstack/react-router";

import { AreaPage } from "./pages/AreaPage";
import { InboxPage } from "./pages/InboxPage";
import { ListPage } from "./pages/ListPage";
import { LogbookPage } from "./pages/LogbookPage";
import { TodayPage } from "./pages/TodayPage";
import { UpcomingPage } from "./pages/UpcomingPage";

const PAGES: [path: string, component: RouteComponent][] = [
  ["/todos/inbox", InboxPage],
  ["/todos/today", TodayPage],
  ["/todos/upcoming", UpcomingPage],
  ["/todos/logbook", LogbookPage],
  ["/todos/lists/$listId", ListPage],
  ["/todos/areas/$areaId", AreaPage],
];

/** The module's routes, attached under the app's root route. */
export function todoRoutes(parent: AnyRoute): AnyRoute[] {
  return PAGES.map(([path, component]) =>
    createRoute({ getParentRoute: () => parent, path, component }),
  );
}

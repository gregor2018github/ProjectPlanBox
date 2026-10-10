/** The calendar module's manifest: route, host and the right-hand rail pane. */
import { CalendarDays } from "lucide-react";

import type { ModuleManifest } from "../../core/module";
import { CalendarHost } from "./components/CalendarHost";
import { CalendarPane } from "./components/CalendarPane";
import { calendarRoutes } from "./routes";

/** Calendar: events, recurring series and dated todos, as a pane and a full page. */
export const calendarModule: ModuleManifest = {
  id: "calendar",
  label: "Calendar",
  routes: calendarRoutes,
  Host: CalendarHost,
  rail: { label: "Calendar", icon: CalendarDays, shortcut: "C", Pane: CalendarPane },
};

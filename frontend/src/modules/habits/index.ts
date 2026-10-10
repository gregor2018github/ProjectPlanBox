/** The habits module's manifest: page, sidebar, host, detail panel and rail pane. */
import { Flame } from "lucide-react";

import type { ModuleManifest } from "../../core/module";
import { HabitDetail } from "./components/HabitDetail";
import { HabitsHost } from "./components/HabitsHost";
import { HabitsPane } from "./components/HabitsPane";
import { HabitsSidebarSection } from "./components/HabitsSidebarSection";
import { habitRoutes } from "./routes";
import { HABIT_TYPE } from "./types";

/** Habits: things to do on a schedule, checked off day by day, with streaks. */
export const habitsModule: ModuleManifest = {
  id: "habits",
  label: "Habits",
  routes: habitRoutes,
  SidebarSection: HabitsSidebarSection,
  Host: HabitsHost,
  detail: { [HABIT_TYPE]: HabitDetail },
  rail: { label: "Habits", icon: Flame, shortcut: "H", Pane: HabitsPane },
};

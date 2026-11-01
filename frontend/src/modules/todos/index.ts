/** The todos module's manifest: routes, sidebar, host, detail panel, rail action and Home card. */
import { SquarePen } from "lucide-react";

import type { ModuleManifest } from "../../core/module";
import { TodoDetail } from "./components/TodoDetail";
import { TodoHome } from "./components/TodoHome";
import { TodoInsights } from "./components/TodoInsights";
import { TodosHost } from "./components/TodosHost";
import { TodosSidebarSection } from "./components/TodosSidebarSection";
import { todoCreate } from "./createStore";
import { todoRoutes } from "./routes";

/** Todos: areas, lists, sections, todos and subtasks. */
export const todosModule: ModuleManifest = {
  id: "todos",
  label: "Todos",
  routes: todoRoutes,
  SidebarSection: TodosSidebarSection,
  Host: TodosHost,
  detail: { "todos.todo": TodoDetail },
  railAction: { label: "New todo with details", icon: SquarePen, run: todoCreate.form },
  InsightsSection: TodoInsights,
  HomeSection: TodoHome,
  homeOrder: 1,
};

/** The todos module's manifest: routes, sidebar, host, detail panel and Home card. */
import type { ModuleManifest } from "../../core/module";
import { TodoDetail } from "./components/TodoDetail";
import { TodoHome } from "./components/TodoHome";
import { TodoInsights } from "./components/TodoInsights";
import { TodosHost } from "./components/TodosHost";
import { TodosSidebarSection } from "./components/TodosSidebarSection";
import { todoRoutes } from "./routes";

/** Todos: areas, lists, sections, todos and subtasks. */
export const todosModule: ModuleManifest = {
  id: "todos",
  label: "Todos",
  routes: todoRoutes,
  SidebarSection: TodosSidebarSection,
  Host: TodosHost,
  detail: { "todos.todo": TodoDetail },
  InsightsSection: TodoInsights,
  HomeSection: TodoHome,
  homeOrder: 1,
};

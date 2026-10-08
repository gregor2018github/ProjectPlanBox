/** The todos module's manifest: routes, sidebar, host and detail panel. */
import type { ModuleManifest } from "../../core/module";
import { TodoDetail } from "./components/TodoDetail";
import { TodosHost } from "./components/TodosHost";
import { TodosSidebarSection } from "./components/TodosSidebarSection";
import { todoPaths } from "./paths";
import { todoRoutes } from "./routes";

/** Todos: areas, lists, sections, todos and subtasks. */
export const todosModule: ModuleManifest = {
  id: "todos",
  label: "Todos",
  homePath: todoPaths.today,
  routes: todoRoutes,
  SidebarSection: TodosSidebarSection,
  Host: TodosHost,
  detail: { "todos.todo": TodoDetail },
};

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  retainSearchParams,
  type RouterHistory,
} from "@tanstack/react-router";

import type { ModuleManifest } from "../core/module";
import { AppShell } from "./AppShell";
import { HomePage } from "./HomePage";
import { NotFoundPage } from "./NotFoundPage";

/** Search params every route understands. */
export interface RootSearch {
  /** The entity shown in the detail panel, e.g. "todos.todo:<id>". */
  item?: string;
  /** The global tag filter: comma-separated tag ids (see core/tags/tagFilter). */
  tags?: string;
}

/** Builds the router from the shell's routes plus every module's routes. */
export function createAppRouter(options: {
  modules: readonly ModuleManifest[];
  history?: RouterHistory | undefined;
}) {
  const rootRoute = createRootRoute({
    component: AppShell,
    notFoundComponent: NotFoundPage,
    validateSearch: (search: Record<string, unknown>): RootSearch => ({
      ...(typeof search.item === "string" && { item: search.item }),
      ...(typeof search.tags === "string" && search.tags !== "" && { tags: search.tags }),
    }),
    // The tag filter follows the user from view to view.
    search: { middlewares: [retainSearchParams<RootSearch>(["tags"])] },
  });
  const homePath = options.modules.find((m) => m.homePath !== undefined)?.homePath;
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
    ...(homePath !== undefined && {
      beforeLoad: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect protocol
        throw redirect({ to: homePath });
      },
    }),
  });
  const routeTree = rootRoute.addChildren([
    homeRoute,
    ...options.modules.flatMap((module) => module.routes(rootRoute)),
  ]);
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    ...(options.history && { history: options.history }),
  });
}

/** The app's router type. */
export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

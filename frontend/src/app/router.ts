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
import { DataPage } from "./DataPage";
import { HomePage } from "./HomePage";
import { InsightsPage } from "./InsightsPage";
import { DATA_PATH, INSIGHTS_PATH } from "./paths";
import { NotFoundPage } from "./NotFoundPage";

/** Search params every route understands. */
export interface RootSearch {
  /** The entity shown in the detail panel, e.g. "todos.todo:<id>". */
  item?: string;
  /** The global tag filter: comma-separated tag ids (see core/tags/tagFilter). */
  tags?: string;
}

/**
 * Builds the router from the shell's routes plus every module's routes.
 * With `openStartPage`, an app opened at "/" goes to the first module's
 * `startPath` instead (the owner starts the day in Day Plan). Only that
 * first visit is redirected; Home stays at "/" afterwards.
 */
export function createAppRouter(options: {
  modules: readonly ModuleManifest[];
  history?: RouterHistory | undefined;
  openStartPage?: boolean;
}) {
  const startPath = options.modules.find((m) => m.startPath !== undefined)?.startPath;
  const launchPath = options.history?.location.pathname ?? window.location.pathname;
  let openStart = options.openStartPage === true && startPath !== undefined && launchPath === "/";

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
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomePage,
    staticData: { tagFilter: true },
    beforeLoad: ({ location }) => {
      if (!openStart || startPath === undefined) return;
      openStart = false;
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack redirects are thrown by design
      throw redirect({ href: `${startPath}${location.searchStr}`, replace: true });
    },
  });
  const insightsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: INSIGHTS_PATH,
    component: InsightsPage,
    staticData: { tagFilter: true },
  });
  const dataRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: DATA_PATH,
    component: DataPage,
  });
  const routeTree = rootRoute.addChildren([
    homeRoute,
    insightsRoute,
    dataRoute,
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
  interface StaticDataRouteOption {
    /** Shows the global tag filter bar above the page (only where the filter applies). */
    tagFilter?: boolean;
  }
}

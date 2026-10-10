import { createRoute, type AnyRoute, type RouteComponent } from "@tanstack/react-router";

import { AllEntriesPage } from "./pages/AllEntriesPage";
import { CollectionPage } from "./pages/CollectionPage";
import { UnsortedPage } from "./pages/UnsortedPage";

const PAGES: [path: string, component: RouteComponent][] = [
  ["/knowledge", AllEntriesPage],
  ["/knowledge/unsorted", UnsortedPage],
  ["/knowledge/collections/$collectionId", CollectionPage],
];

/** The module's routes, attached under the app's root route. */
export function knowledgeRoutes(parent: AnyRoute): AnyRoute[] {
  return PAGES.map(([path, component]) =>
    createRoute({ getParentRoute: () => parent, path, component }),
  );
}

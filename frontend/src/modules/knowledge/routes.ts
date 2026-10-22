import { createRoute, type AnyRoute, type RouteComponent } from "@tanstack/react-router";

import { AllEntriesPage } from "./pages/AllEntriesPage";
import { CollectionPage } from "./pages/CollectionPage";
import { EntryPage } from "./pages/EntryPage";
import { UnsortedPage } from "./pages/UnsortedPage";

/** Path, view, and whether the global tag filter applies there (lists only). */
const PAGES: [path: string, component: RouteComponent, tagFilter: boolean][] = [
  ["/knowledge", AllEntriesPage, true],
  ["/knowledge/unsorted", UnsortedPage, true],
  ["/knowledge/collections/$collectionId", CollectionPage, true],
  ["/knowledge/pages/$entryId", EntryPage, false],
];

/** The module's routes, attached under the app's root route. */
export function knowledgeRoutes(parent: AnyRoute): AnyRoute[] {
  return PAGES.map(([path, component, tagFilter]) =>
    createRoute({ getParentRoute: () => parent, path, component, staticData: { tagFilter } }),
  );
}

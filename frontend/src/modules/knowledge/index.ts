/** The knowledge module's manifest: routes, sidebar, host and detail panel. */
import type { ModuleManifest } from "../../core/module";
import { EntryDetail } from "./components/EntryDetail";
import { KnowledgeHome } from "./components/KnowledgeHome";
import { KnowledgeHost } from "./components/KnowledgeHost";
import { KnowledgeInsights } from "./components/KnowledgeInsights";
import { KnowledgeSidebarSection } from "./components/KnowledgeSidebarSection";
import { knowledgeRoutes } from "./routes";
import { ENTRY_TYPE } from "./types";

/** Knowledge: collections of pages (text boxes placed freely, like OneNote). */
export const knowledgeModule: ModuleManifest = {
  id: "knowledge",
  label: "Knowledge",
  routes: knowledgeRoutes,
  SidebarSection: KnowledgeSidebarSection,
  Host: KnowledgeHost,
  detail: { [ENTRY_TYPE]: EntryDetail },
  InsightsSection: KnowledgeInsights,
  HomeSection: KnowledgeHome,
  homeOrder: 4,
};

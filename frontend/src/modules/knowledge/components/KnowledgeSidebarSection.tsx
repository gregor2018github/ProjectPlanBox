import { useRouterState } from "@tanstack/react-router";
import { FolderPlus, Inbox, Library, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { IconButton } from "../../../ui/IconButton";
import { NameDialog } from "../../../ui/NameDialog";
import { knowledgePaths } from "../paths";
import { collectionOnScreen, entryCounts } from "../selectors";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { CollectionLink } from "./CollectionLink";
import { KnowledgeNavLink } from "./KnowledgeNavLink";

/** The knowledge part of the sidebar: all entries, Unsorted and the collections. */
export function KnowledgeSidebarSection() {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const [creating, setCreating] = useState(false);
  const counts = useMemo(() => entryCounts(data.entries), [data.entries]);
  const orderedIds = data.collections.map((c) => c.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div className="mt-4 flex items-center justify-between pl-2">
        <span className="text-xs font-medium text-text-muted">Knowledge</span>
        <div className="flex items-center">
          <IconButton
            label="New knowledge page"
            icon={Plus}
            shortcut="E"
            onClick={() => {
              actions.createPage(collectionOnScreen(pathname, orderedIds));
            }}
          />
          <IconButton
            label="New collection"
            icon={FolderPlus}
            onClick={() => {
              setCreating(true);
            }}
          />
        </div>
      </div>
      <KnowledgeNavLink
        to={knowledgePaths.all}
        label="All pages"
        icon={Library}
        count={counts.total}
        exact
      />
      <KnowledgeNavLink
        to={knowledgePaths.unsorted}
        label="Unsorted"
        icon={Inbox}
        count={counts.unsorted}
        dropCollection={null}
      />
      <div className="flex flex-col gap-0.5">
        {data.collections.map((collection, index) => (
          <CollectionLink
            key={collection.id}
            collection={collection}
            count={counts.byCollection[collection.id] ?? 0}
            index={index}
            orderedIds={orderedIds}
            actions={actions}
          />
        ))}
      </div>
      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title="New collection"
        submitLabel="Add collection"
        onSubmit={(name) => {
          actions.createCollection(name);
        }}
      />
    </>
  );
}

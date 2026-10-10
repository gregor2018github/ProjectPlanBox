import { useNavigate, useParams } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import { NameDialog } from "../../../ui/NameDialog";
import { ViewLayout } from "../../../ui/ViewLayout";
import { EntriesView } from "../components/EntriesView";
import { knowledgePaths, paramOf } from "../paths";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";

/** One collection's entries, with rename and delete in the ⋯ menu. */
export function CollectionPage() {
  const collectionId = paramOf(useParams({ strict: false }), "collectionId") ?? "";
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const scope = useMemo(() => ({ kind: "collection", id: collectionId }) as const, [collectionId]);
  const collection = data.collections.find((c) => c.id === collectionId);

  if (collection === undefined) {
    return (
      <ViewLayout>
        <p className="px-3 text-base text-text-muted">
          {data.loading ? "" : "This collection does not exist (anymore)."}
        </p>
      </ViewLayout>
    );
  }

  return (
    <>
      <EntriesView
        scope={scope}
        title={collection.name}
        headerActions={
          <Menu
            entries={[
              {
                id: "rename",
                label: "Rename collection",
                icon: Pencil,
                onSelect: () => {
                  setRenaming(true);
                },
              },
              {
                id: "delete",
                label: "Delete collection",
                icon: Trash2,
                danger: true,
                onSelect: () => {
                  actions.removeCollection(collection);
                  void navigate({ to: knowledgePaths.all });
                },
              },
            ]}
            trigger={<IconButton label="Collection actions" icon={MoreHorizontal} />}
          />
        }
      />
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename collection"
        initial={collection.name}
        submitLabel="Rename"
        onSubmit={(name) => {
          actions.renameCollection(collection.id, name);
        }}
      />
    </>
  );
}

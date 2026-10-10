import { Folder, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "../../../ui/ContextMenu";
import { cx } from "../../../ui/cx";
import { useSortableItem } from "../../../ui/dnd";
import { NameDialog } from "../../../ui/NameDialog";
import { collectionMove, COLLECTION_DRAG_TYPE } from "../entryDrop";
import { knowledgePaths } from "../paths";
import type { Collection } from "../types";
import type { KnowledgeActions } from "../useKnowledgeActions";
import { KnowledgeNavLink } from "./KnowledgeNavLink";

/** Props for {@link CollectionLink}. */
export interface CollectionLinkProps {
  collection: Collection;
  count: number;
  index: number;
  /** Ids of all collections, in sidebar order. */
  orderedIds: readonly string[];
  actions: KnowledgeActions;
}

/**
 * A collection in the sidebar. Drag it to reorder; drop entries on it to
 * move them here; right-click to rename or delete.
 */
export function CollectionLink({
  collection,
  count,
  index,
  orderedIds,
  actions,
}: CollectionLinkProps) {
  const [renaming, setRenaming] = useState(false);
  const { ref, isDragging } = useSortableItem({
    id: collection.id,
    index,
    group: "knowledge-collections",
    type: COLLECTION_DRAG_TYPE,
    accept: COLLECTION_DRAG_TYPE,
    onDragEnd: (info) => {
      const move = collectionMove(collection.id, orderedIds, info);
      if (move) actions.moveCollection({ id: collection.id, ...move });
    },
  });

  return (
    <>
      <ContextMenu
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
            },
          },
        ]}
      >
        <div
          ref={ref}
          className={cx("touch-manipulation", isDragging && "rounded-md bg-surface shadow-md")}
        >
          <KnowledgeNavLink
            to={knowledgePaths.collection(collection.id)}
            label={collection.name}
            icon={Folder}
            count={count}
            dropCollection={collection.id}
          />
        </div>
      </ContextMenu>
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

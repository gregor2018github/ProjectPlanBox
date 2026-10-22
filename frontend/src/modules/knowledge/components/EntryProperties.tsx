import { Folder, Inbox } from "lucide-react";
import { useState } from "react";

import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { TagPicker } from "../../../core/tags/TagPicker";
import { Button } from "../../../ui/Button";
import { Menu } from "../../../ui/Menu";
import type { Entry } from "../types";
import type { KnowledgeActions } from "../useKnowledgeActions";
import type { KnowledgeData } from "../useKnowledgeData";

/** Props for {@link EntryProperties}. */
export interface EntryPropertiesProps {
  entry: Entry;
  data: KnowledgeData;
  actions: KnowledgeActions;
}

/** A page's collection and tags as two small buttons; `L` opens the tag picker. */
export function EntryProperties({ entry, data, actions }: EntryPropertiesProps) {
  const [tagsOpen, setTagsOpen] = useState(false);
  useShortcut({
    id: "knowledge.tags",
    keys: "L",
    description: "Add or remove tags of the open page",
    group: "Knowledge",
    run: () => {
      setTagsOpen(true);
    },
  });

  return (
    <div className="flex flex-wrap gap-1">
      <Menu
        align="start"
        entries={[
          {
            id: "unsorted",
            label: "Unsorted",
            icon: Inbox,
            checked: entry.collection_id === null,
            onSelect: () => {
              actions.moveTo(entry, null);
            },
          },
          ...data.collections.map((c) => ({
            id: c.id,
            label: c.name,
            icon: Folder,
            checked: entry.collection_id === c.id,
            onSelect: () => {
              actions.moveTo(entry, c.id);
            },
          })),
        ]}
        trigger={
          <Button size="sm" aria-label={`Collection: ${data.collectionName(entry.collection_id)}`}>
            <Folder size={16} strokeWidth={1.75} aria-hidden />
            {data.collectionName(entry.collection_id)}
          </Button>
        }
      />
      <TagPicker
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        tags={data.tags}
        selected={entry.tag_ids}
        onChange={(tag_ids) => {
          actions.update(entry.id, { tag_ids });
        }}
      />
    </div>
  );
}

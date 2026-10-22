import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";

import { useCommands } from "../../../core/commands/commandsContext";
import type { Command } from "../../../core/commands/registry";
import { useLinkableSource } from "../../../core/links/linkablesContext";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { NameDialog } from "../../../ui/NameDialog";
import { knowledgePaths } from "../paths";
import { collectionOnScreen } from "../selectors";
import { entryRef, ENTRY_TYPE } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";

/**
 * Mounted once for the app's lifetime: the module's shortcuts and palette
 * commands, the "new collection" dialog, and its pages as link targets.
 */
export function KnowledgeHost() {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [creatingCollection, setCreatingCollection] = useState(false);

  const linkables = useMemo(
    () => ({
      entityType: ENTRY_TYPE,
      noun: "Page",
      icon: BookOpen,
      items: data.allEntries.map((e) => ({
        ref: entryRef(e.id),
        title: e.title,
        hint: `Page · ${data.collectionName(e.collection_id)}`,
      })),
    }),
    [data],
  );
  useLinkableSource(linkables);

  const go = (to: string) => () => {
    void navigate({ to });
  };
  // New pages go to the collection on screen, else to Unsorted.
  const newPage = () => {
    actions.createPage(
      collectionOnScreen(
        pathname,
        data.collections.map((c) => c.id),
      ),
    );
  };

  useShortcut({
    id: "knowledge.new",
    keys: "E",
    description: "New knowledge page",
    group: "Knowledge",
    run: newPage,
  });
  useShortcut({
    id: "knowledge.go",
    keys: "G K",
    description: "Go to Knowledge",
    group: "Navigation",
    run: go(knowledgePaths.all),
  });

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "knowledge.new.page",
        title: "New page",
        group: "Knowledge",
        keywords: ["add", "create", "knowledge", "note"],
        shortcut: "E",
        run: newPage,
      },
      {
        id: "knowledge.new.collection",
        title: "New collection",
        group: "Knowledge",
        keywords: ["folder", "create"],
        run: () => {
          setCreatingCollection(true);
        },
      },
      {
        id: "knowledge.go",
        title: "Go to Knowledge",
        group: "Navigation",
        keywords: ["notes", "pages"],
        shortcut: "G K",
        run: go(knowledgePaths.all),
      },
      {
        id: "knowledge.go.unsorted",
        title: "Go to Unsorted pages",
        group: "Navigation",
        run: go(knowledgePaths.unsorted),
      },
      ...data.collections.map((c) => ({
        id: `knowledge.go.collection.${c.id}`,
        title: `Go to collection: ${c.name}`,
        group: "Collections",
        run: go(knowledgePaths.collection(c.id)),
      })),
    ],
    // go and newPage read navigate, actions and the path through their closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, navigate, actions, pathname],
  );
  useCommands(commands);

  return (
    <NameDialog
      open={creatingCollection}
      onOpenChange={setCreatingCollection}
      title="New collection"
      submitLabel="Add collection"
      onSubmit={(name) => {
        const id = actions.createCollection(name);
        void navigate({ to: knowledgePaths.collection(id) });
      }}
    />
  );
}

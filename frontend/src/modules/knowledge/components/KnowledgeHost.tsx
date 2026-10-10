import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";

import { useCommands } from "../../../core/commands/commandsContext";
import type { Command } from "../../../core/commands/registry";
import { useLinkableSource } from "../../../core/links/linkablesContext";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { NameDialog } from "../../../ui/NameDialog";
import { newEntryDialog, useNewEntryRequest } from "../newEntryStore";
import { knowledgePaths } from "../paths";
import { entryRef, ENTRY_KINDS, ENTRY_TYPE, KIND_LABELS } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { NewEntryDialog } from "./NewEntryDialog";

/**
 * Mounted once for the app's lifetime: the module's shortcuts and palette
 * commands, the "new entry" and "new collection" dialogs, and its entries as
 * link targets.
 */
export function KnowledgeHost() {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const request = useNewEntryRequest();
  const [creatingCollection, setCreatingCollection] = useState(false);

  // New entries go to the collection on screen, else to Unsorted.
  const match = /^\/knowledge\/collections\/([^/]+)/.exec(pathname);
  const target = match ? data.collections.find((c) => c.id === match[1]) : undefined;

  const linkables = useMemo(
    () => ({
      entityType: ENTRY_TYPE,
      noun: "Entry",
      icon: BookOpen,
      items: data.entries.map((e) => ({
        ref: entryRef(e.id),
        title: e.title,
        hint: `${KIND_LABELS[e.kind]} · ${data.collectionName(e.collection_id)}`,
      })),
    }),
    [data],
  );
  useLinkableSource(linkables);

  const go = (to: string) => () => {
    void navigate({ to });
  };

  useShortcut({
    id: "knowledge.new",
    keys: "E",
    description: "New note, link or snippet",
    group: "Knowledge",
    run: () => {
      newEntryDialog.open();
    },
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
      ...ENTRY_KINDS.map((kind) => ({
        id: `knowledge.new.${kind}`,
        title: `New ${KIND_LABELS[kind].toLowerCase()}`,
        group: "Knowledge",
        keywords: ["add", "create", "knowledge"],
        ...(kind === "note" && { shortcut: "E" }),
        run: () => {
          newEntryDialog.open(kind);
        },
      })),
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
        keywords: ["notes", "links", "snippets"],
        shortcut: "G K",
        run: go(knowledgePaths.all),
      },
      {
        id: "knowledge.go.unsorted",
        title: "Go to Unsorted entries",
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
    // go reads navigate through its closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, navigate],
  );
  useCommands(commands);

  return (
    <>
      <NewEntryDialog
        initialKind={request?.kind ?? null}
        onClose={newEntryDialog.close}
        collectionId={target?.id ?? null}
        collectionLabel={target?.name ?? "Unsorted"}
        onCreate={(input) => {
          const id = actions.create(input);
          void navigate({
            to: ".",
            search: (prev: Record<string, unknown>) => ({ ...prev, item: entryRef(id) }),
          });
        }}
      />
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
    </>
  );
}

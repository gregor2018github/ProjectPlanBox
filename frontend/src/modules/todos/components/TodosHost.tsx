import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useCommands } from "../../../core/commands/commandsContext";
import type { Command } from "../../../core/commands/registry";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { todoPaths } from "../paths";
import { INBOX, type Placement } from "../types";
import { todoUi } from "../uiStore";
import { useContainerActions } from "../useContainerActions";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { NameDialog } from "./NameDialog";
import { QuickAddDialog } from "./QuickAddDialog";

interface QuickAddTarget {
  placement: Placement;
  defaultDue: string | null;
  label: string;
}

/**
 * Mounted once for the app's lifetime: the module's global shortcuts and
 * palette commands, the quick-add dialog and the "new list/area" dialogs.
 */
export function TodosHost() {
  const data = useTodoData();
  const actions = useTodoActions();
  const containers = useContainerActions();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [quickAdd, setQuickAdd] = useState<QuickAddTarget | null>(null);
  const [dialog, setDialog] = useState<"list" | "area" | null>(null);

  /** The default target follows the current view: the open list, or Today's date. */
  const contextualTarget = (): QuickAddTarget => {
    const listMatch = /^\/todos\/lists\/([^/]+)/.exec(pathname);
    const list = listMatch ? data.lists.find((l) => l.id === listMatch[1]) : undefined;
    if (list)
      return {
        placement: { list_id: list.id, section_id: null, parent_id: null },
        defaultDue: null,
        label: list.name,
      };
    if (pathname === todoPaths.today)
      return { placement: INBOX, defaultDue: data.today, label: "Inbox, due today" };
    return { placement: INBOX, defaultDue: null, label: "Inbox" };
  };

  const openQuickAdd = () => {
    setQuickAdd(contextualTarget());
  };
  const openSubtaskAdd = () => {
    const selected = data.todos.find((t) => t.id === todoUi.get().selectedId);
    const canHaveSubtasks = selected?.parent_id === null && selected.completed_at === null;
    if (!canHaveSubtasks) {
      openQuickAdd();
      return;
    }
    setQuickAdd({
      placement: {
        list_id: selected.list_id,
        section_id: selected.section_id,
        parent_id: selected.id,
      },
      defaultDue: null,
      label: `subtasks of “${selected.title}”`,
    });
  };
  const go = (to: string) => () => {
    void navigate({ to });
  };

  useShortcut({
    id: "todos.quickadd",
    keys: "Q",
    description: "Quick add todo",
    group: "Todos",
    run: openQuickAdd,
  });
  useShortcut({
    id: "todos.quickadd.sub",
    keys: "Shift+Q",
    description: "Quick add subtask to the selection",
    group: "Todos",
    run: openSubtaskAdd,
  });
  useShortcut({
    id: "todos.go.inbox",
    keys: "G I",
    description: "Go to Inbox",
    group: "Navigation",
    run: go(todoPaths.inbox),
  });
  useShortcut({
    id: "todos.go.today",
    keys: "G T",
    description: "Go to Today",
    group: "Navigation",
    run: go(todoPaths.today),
  });
  useShortcut({
    id: "todos.go.upcoming",
    keys: "G U",
    description: "Go to Upcoming",
    group: "Navigation",
    run: go(todoPaths.upcoming),
  });
  useShortcut({
    id: "todos.go.logbook",
    keys: "G L",
    description: "Go to Logbook",
    group: "Navigation",
    run: go(todoPaths.logbook),
  });

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "todos.new",
        title: "New todo",
        group: "Todos",
        keywords: ["add", "task", "create"],
        shortcut: "Q",
        run: openQuickAdd,
      },
      {
        id: "todos.new.sub",
        title: "New subtask of the selected todo",
        group: "Todos",
        keywords: ["add", "child"],
        shortcut: "Shift+Q",
        run: openSubtaskAdd,
      },
      {
        id: "todos.new.list",
        title: "New list",
        group: "Todos",
        keywords: ["project", "create"],
        run: () => {
          setDialog("list");
        },
      },
      {
        id: "todos.new.area",
        title: "New area",
        group: "Todos",
        keywords: ["folder", "group", "create"],
        run: () => {
          setDialog("area");
        },
      },
      {
        id: "todos.go.inbox",
        title: "Go to Inbox",
        group: "Navigation",
        shortcut: "G I",
        run: go(todoPaths.inbox),
      },
      {
        id: "todos.go.today",
        title: "Go to Today",
        group: "Navigation",
        shortcut: "G T",
        run: go(todoPaths.today),
      },
      {
        id: "todos.go.upcoming",
        title: "Go to Upcoming",
        group: "Navigation",
        shortcut: "G U",
        run: go(todoPaths.upcoming),
      },
      {
        id: "todos.go.logbook",
        title: "Go to Logbook",
        group: "Navigation",
        shortcut: "G L",
        keywords: ["done", "completed"],
        run: go(todoPaths.logbook),
      },
      ...data.lists.map((list) => ({
        id: `todos.go.list.${list.id}`,
        title: `Go to list: ${list.name}`,
        group: "Lists",
        run: go(todoPaths.list(list.id)),
      })),
      ...data.areas.map((area) => ({
        id: `todos.go.area.${area.id}`,
        title: `Go to area: ${area.name}`,
        group: "Lists",
        run: go(todoPaths.area(area.id)),
      })),
      ...data.todos
        .filter((t) => t.completed_at === null)
        .map((t) => ({
          id: `todos.open.${t.id}`,
          title: t.title,
          group: "Open todos",
          keywords: [data.lookup.listName(t.list_id)],
          run: () => {
            actions.open(t);
          },
        })),
    ],
    // openQuickAdd/openSubtaskAdd/go read fresh state through closures over data and pathname.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, actions, pathname, navigate],
  );
  useCommands(commands);

  return (
    <>
      <QuickAddDialog
        open={quickAdd !== null}
        onOpenChange={(open) => {
          if (!open) setQuickAdd(null);
        }}
        data={data}
        actions={actions}
        placement={quickAdd?.placement ?? INBOX}
        defaultDue={quickAdd?.defaultDue ?? null}
        targetLabel={quickAdd?.label ?? "Inbox"}
      />
      <NameDialog
        open={dialog === "list"}
        onOpenChange={(open) => {
          setDialog(open ? "list" : null);
        }}
        title="New list"
        submitLabel="Add list"
        onSubmit={(name) => {
          const id = containers.createList(name, null);
          void navigate({ to: todoPaths.list(id) });
        }}
      />
      <NameDialog
        open={dialog === "area"}
        onOpenChange={(open) => {
          setDialog(open ? "area" : null);
        }}
        title="New area"
        submitLabel="Add area"
        onSubmit={(name) => {
          containers.createArea(name);
        }}
      />
    </>
  );
}

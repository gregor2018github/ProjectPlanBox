import { useNavigate, useParams } from "@tanstack/react-router";
import { ListPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { NameDialog } from "../components/NameDialog";
import { NewTodoInline } from "../components/NewTodoInline";
import { PageHeader } from "../components/PageHeader";
import { SectionHeader } from "../components/SectionHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../components/ViewLayout";
import { paramOf, todoPaths } from "../paths";
import { flattenWithChildren, listView } from "../selectors";
import type { Todo } from "../types";
import { useTodoUi } from "../uiStore";
import { useContainerActions } from "../useContainerActions";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** One list: todos above the first section, then each section, then done. */
export function ListPage() {
  const listId = paramOf(useParams({ strict: false }), "listId") ?? "";
  const data = useTodoData();
  const actions = useTodoActions();
  const containers = useContainerActions();
  const navigate = useNavigate();
  const expanded = useTodoUi((s) => s.expanded);
  const [dialog, setDialog] = useState<"rename" | "section" | null>(null);

  const list = data.lists.find((l) => l.id === listId);
  const view = useMemo(
    () => listView(data.todos, data.sections, listId),
    [data.todos, data.sections, listId],
  );
  const visible = useMemo(
    () => [
      ...view.groups.flatMap((g) => flattenWithChildren(g.todos, data.todos, expanded)),
      ...view.done,
    ],
    [view, data.todos, expanded],
  );
  useTodoKeyboard(visible, actions, { reorder: true });

  if (list === undefined) {
    return (
      <ViewLayout>
        {!data.loading && (
          <PageHeader title="List not found" subtitle="It may have been deleted." />
        )}
      </ViewLayout>
    );
  }

  const empty = visible.length === 0 && view.groups.length === 1;

  return (
    <ViewLayout>
      <PageHeader
        title={list.name}
        actions={
          <Menu
            entries={[
              {
                id: "section",
                label: "New section",
                icon: ListPlus,
                onSelect: () => {
                  setDialog("section");
                },
              },
              {
                id: "rename",
                label: "Rename list",
                icon: Pencil,
                onSelect: () => {
                  setDialog("rename");
                },
              },
              { kind: "separator", id: "sep" },
              {
                id: "delete",
                label: "Delete list",
                icon: Trash2,
                danger: true,
                onSelect: () => {
                  containers.remove("list", list.id, list.name);
                  void navigate({ to: todoPaths.inbox });
                },
              },
            ]}
            trigger={<IconButton label="List actions" icon={MoreHorizontal} />}
          />
        }
      />
      {!data.loading && empty && <EmptyHint text="This list is empty." />}
      {view.groups.map((group) => {
        const sectionId = group.section?.id ?? null;
        const belongs = (t: Todo) =>
          t.list_id === list.id && t.section_id === sectionId && t.parent_id === null;
        return (
          <section key={sectionId ?? "top"} aria-label={group.section?.name ?? list.name}>
            {group.section && <SectionHeader section={group.section} containers={containers} />}
            <TodoGroup
              todos={group.todos}
              data={data}
              actions={actions}
              label={group.section?.name ?? list.name}
              container={{ list_id: list.id, section_id: sectionId, parent_id: null }}
              includes={belongs}
            />
            <NewTodoInline
              placement={{ list_id: list.id, section_id: sectionId, parent_id: null }}
              data={data}
              actions={actions}
            />
          </section>
        );
      })}
      <CompletedGroup todos={view.done} data={data} actions={actions} />
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => {
          setDialog(open ? "rename" : null);
        }}
        title="Rename list"
        initial={list.name}
        submitLabel="Rename"
        onSubmit={(name) => {
          containers.rename("list", list.id, name);
        }}
      />
      <NameDialog
        open={dialog === "section"}
        onOpenChange={(open) => {
          setDialog(open ? "section" : null);
        }}
        title="New section"
        submitLabel="Add section"
        onSubmit={(name) => {
          containers.createSection(list.id, name);
        }}
      />
    </ViewLayout>
  );
}

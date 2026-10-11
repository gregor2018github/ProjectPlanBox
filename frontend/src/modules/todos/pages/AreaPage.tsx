import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { byPosition } from "../../../core/ordering";
import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import { EmptyHint } from "../components/EmptyHint";
import { NameDialog } from "../../../ui/NameDialog";
import { PageHeader } from "../../../ui/PageHeader";
import { TintDot } from "../../../ui/TintDot";
import { AreaSettingsDialog } from "../components/AreaSettingsDialog";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../../../ui/ViewLayout";
import { paramOf, todoPaths } from "../paths";
import { listView } from "../selectors";
import { useContainerActions } from "../useContainerActions";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** An area: each of its lists with their open todos. */
export function AreaPage() {
  const areaId = paramOf(useParams({ strict: false }), "areaId") ?? "";
  const data = useTodoData();
  const actions = useTodoActions();
  const containers = useContainerActions();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"settings" | "list" | null>(null);

  const area = data.areas.find((a) => a.id === areaId);
  const lists = useMemo(
    () => data.lists.filter((l) => l.area_id === areaId).sort(byPosition),
    [data.lists, areaId],
  );
  const groups = useMemo(
    () =>
      lists.map((list) => ({
        list,
        todos: listView(data.todos, data.sections, list.id).groups.flatMap((g) => g.todos),
      })),
    [lists, data.todos, data.sections],
  );
  const visible = useMemo(() => groups.flatMap((g) => g.todos), [groups]);
  useTodoKeyboard(visible, actions, { reorder: false });

  if (area === undefined) {
    return (
      <ViewLayout>
        {!data.loading && (
          <PageHeader title="Area not found" subtitle="It may have been deleted." />
        )}
      </ViewLayout>
    );
  }

  return (
    <ViewLayout tint={area.hue}>
      <PageHeader
        title={area.name}
        leading={<TintDot hue={area.hue} size="md" />}
        actions={
          <Menu
            entries={[
              {
                id: "list",
                label: "New list in this area",
                icon: Plus,
                onSelect: () => {
                  setDialog("list");
                },
              },
              {
                id: "settings",
                label: "Area settings…",
                icon: Settings2,
                onSelect: () => {
                  setDialog("settings");
                },
              },
              { kind: "separator", id: "sep" },
              {
                id: "delete",
                label: "Delete area",
                icon: Trash2,
                danger: true,
                onSelect: () => {
                  containers.remove("area", area.id, area.name);
                  void navigate({ to: todoPaths.inbox });
                },
              },
            ]}
            trigger={<IconButton label="Area actions" icon={MoreHorizontal} />}
          />
        }
      />
      {!data.loading && lists.length === 0 && <EmptyHint text="No lists in this area yet." />}
      {groups.map(({ list, todos }) => (
        <section key={list.id} className="mb-6">
          <h2 className="px-3 pb-1">
            <Link
              to={todoPaths.list(list.id)}
              className="text-base font-semibold hover:text-accent"
            >
              {list.name}
            </Link>
          </h2>
          {todos.length === 0 ? (
            <p className="px-3 text-sm text-text-muted">Nothing open.</p>
          ) : (
            <TodoGroup todos={todos} data={data} actions={actions} label={list.name} />
          )}
        </section>
      ))}
      <AreaSettingsDialog
        area={area}
        open={dialog === "settings"}
        onOpenChange={(open) => {
          setDialog(open ? "settings" : null);
        }}
        containers={containers}
      />
      <NameDialog
        open={dialog === "list"}
        onOpenChange={(open) => {
          setDialog(open ? "list" : null);
        }}
        title="New list"
        submitLabel="Add list"
        onSubmit={(name) => {
          containers.createList(name, area.id);
        }}
      />
    </ViewLayout>
  );
}

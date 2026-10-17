import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { byPosition } from "../../../core/ordering";
import { Button } from "../../../ui/Button";
import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import { NewTodoInline } from "../components/NewTodoInline";
import { PageHeader } from "../../../ui/PageHeader";
import { TintDot } from "../../../ui/TintDot";
import { AreaSettingsDialog } from "../components/AreaSettingsDialog";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../../../ui/ViewLayout";
import { todoCreate } from "../createStore";
import { paramOf, todoPaths } from "../paths";
import { listView } from "../selectors";
import { useContainerActions } from "../useContainerActions";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

/** An area: each of its lists with their open todos and an "Add todo" row. */
export function AreaPage() {
  const areaId = paramOf(useParams({ strict: false }), "areaId") ?? "";
  const data = useTodoData();
  const actions = useTodoActions();
  const containers = useContainerActions();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(false);

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

  const newList = () => {
    todoCreate.list(areaId);
  };

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
        wash
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={newList}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New list
            </Button>
            <Menu
              entries={[
                {
                  id: "settings",
                  label: "Area settings…",
                  icon: Settings2,
                  onSelect: () => {
                    setSettings(true);
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
          </div>
        }
      />
      {!data.loading && lists.length === 0 && (
        <div className="flex flex-col items-start gap-3 px-3 py-6">
          <p className="text-base text-text-muted">No lists in this area yet.</p>
          <Button variant="primary" onClick={newList}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New list
          </Button>
        </div>
      )}
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
          <TodoGroup todos={todos} data={data} actions={actions} label={list.name} />
          <NewTodoInline
            placement={{ list_id: list.id, section_id: null, parent_id: null }}
            data={data}
            actions={actions}
          />
        </section>
      ))}
      <AreaSettingsDialog
        area={area}
        open={settings}
        onOpenChange={setSettings}
        containers={containers}
      />
    </ViewLayout>
  );
}

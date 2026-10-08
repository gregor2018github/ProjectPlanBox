import { Archive, CalendarDays, FolderPlus, Inbox, ListPlus, Plus, Sun } from "lucide-react";
import { useMemo, useState } from "react";

import { readStorage, writeStorage } from "../../../core/storage";
import { IconButton } from "../../../ui/IconButton";
import { Menu } from "../../../ui/Menu";
import { todoPaths } from "../paths";
import { counts, listTree } from "../selectors";
import { useContainerActions } from "../useContainerActions";
import { useTodoData } from "../useTodoData";
import { AreaNavGroup } from "./AreaNavGroup";
import { ListLink } from "./ListLink";
import { NameDialog } from "./NameDialog";
import { SidebarLink } from "./SidebarLink";

const COLLAPSED_KEY = "planbox.todos.collapsedAreas";

function readCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readStorage(COLLAPSED_KEY) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** The todos part of the sidebar: smart views, lists, and areas with their lists. */
export function TodosSidebarSection() {
  const data = useTodoData();
  const containers = useContainerActions();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [dialog, setDialog] = useState<"list" | "area" | null>(null);
  const badge = useMemo(() => counts(data.todos, data.today), [data.todos, data.today]);
  const tree = useMemo(() => listTree(data.areas, data.lists), [data.areas, data.lists]);

  const toggleArea = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    writeStorage(COLLAPSED_KEY, JSON.stringify([...next]));
  };

  return (
    <>
      <SidebarLink to={todoPaths.inbox} label="Inbox" icon={Inbox} count={badge.inbox} />
      <SidebarLink
        to={todoPaths.today}
        label="Today"
        icon={Sun}
        count={badge.today}
        alert={badge.overdue > 0}
      />
      <SidebarLink to={todoPaths.upcoming} label="Upcoming" icon={CalendarDays} />
      <SidebarLink to={todoPaths.logbook} label="Logbook" icon={Archive} />

      <div className="mt-4 flex items-center justify-between pl-2">
        <span className="text-xs font-medium text-text-muted">Lists</span>
        <Menu
          entries={[
            {
              id: "list",
              label: "New list",
              icon: ListPlus,
              onSelect: () => {
                setDialog("list");
              },
            },
            {
              id: "area",
              label: "New area",
              icon: FolderPlus,
              onSelect: () => {
                setDialog("area");
              },
            },
          ]}
          trigger={<IconButton label="New list or area" icon={Plus} />}
        />
      </div>
      {tree.loose.map((list) => (
        <ListLink
          key={list.id}
          list={list}
          count={badge.lists[list.id] ?? 0}
          containers={containers}
        />
      ))}
      {tree.areas.map(({ area, lists }) => (
        <AreaNavGroup
          key={area.id}
          area={area}
          lists={lists}
          counts={badge.lists}
          collapsed={collapsed.has(area.id)}
          onToggle={() => {
            toggleArea(area.id);
          }}
          containers={containers}
        />
      ))}

      <NameDialog
        open={dialog === "list"}
        onOpenChange={(open) => {
          setDialog(open ? "list" : null);
        }}
        title="New list"
        submitLabel="Add list"
        onSubmit={(name) => {
          containers.createList(name, null);
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

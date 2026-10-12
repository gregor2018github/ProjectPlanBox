import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { plural } from "../../../core/insights/format";
import { PageHeader } from "../../../ui/PageHeader";
import { TintDot } from "../../../ui/TintDot";
import { ViewLayout } from "../../../ui/ViewLayout";
import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { TodoGroup } from "../components/TodoGroup";
import { todoPaths } from "../paths";
import { allView, flattenWithChildren, type PlaceGroup } from "../selectors";
import { useTodoUi } from "../uiStore";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

function placeName(group: PlaceGroup): string {
  if (group.key === "inbox") return "Inbox";
  return group.list?.name ?? "Other lists";
}

function placePath(group: PlaceGroup): string | null {
  if (group.key === "inbox") return todoPaths.inbox;
  return group.list === null ? null : todoPaths.list(group.list.id);
}

/**
 * All todos: every open todo at once, grouped by place (Inbox, then the
 * lists in sidebar order), with how many there are in total.
 */
export function AllTodosPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const expanded = useTodoUi((s) => s.expanded);
  const view = useMemo(
    () => allView(data.todos, data.areas, data.lists, data.sections),
    [data.todos, data.areas, data.lists, data.sections],
  );
  const visible = useMemo(
    () => [
      ...view.groups.flatMap((g) => flattenWithChildren(g.todos, data.todos, expanded)),
      ...view.done,
    ],
    [view, data.todos, expanded],
  );
  useTodoKeyboard(visible, actions, { reorder: false });

  const subtitle = data.loading
    ? undefined
    : `${plural(view.open, "open todo")} · ${plural(view.subtasksOpen, "open subtask")} · ${plural(view.groups.length, "place")}`;

  return (
    <ViewLayout>
      <PageHeader title="All todos" subtitle={subtitle} />
      {!data.loading && view.open === 0 && <EmptyHint text="Nothing open. Well done." />}
      {view.groups.map((group) => {
        const name = placeName(group);
        const to = placePath(group);
        return (
          <section key={group.key} aria-label={name} className="mb-6">
            <h2 className="flex items-baseline gap-2 px-3 pb-1">
              {group.area !== null && <TintDot hue={group.area.hue} />}
              {group.area !== null && (
                <Link
                  to={todoPaths.area(group.area.id)}
                  className="text-sm text-text-muted hover:text-text"
                >
                  {group.area.name}
                </Link>
              )}
              {to === null ? (
                <span className="text-base font-semibold">{name}</span>
              ) : (
                <Link to={to} className="text-base font-semibold hover:text-accent">
                  {name}
                </Link>
              )}
              <span className="text-sm text-text-muted tabular-nums">{group.todos.length}</span>
            </h2>
            <TodoGroup todos={group.todos} data={data} actions={actions} label={name} />
          </section>
        );
      })}
      <CompletedGroup view="all" todos={view.done} data={data} actions={actions} showPlace />
    </ViewLayout>
  );
}

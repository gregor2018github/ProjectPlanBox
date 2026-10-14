import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { TintDot } from "../../../ui/TintDot";
import { todoPaths } from "../paths";
import { flattenWithChildren, type AllViewData, type PlaceGroup } from "../selectors";
import { useTodoUi } from "../uiStore";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";
import { CompletedGroup } from "./CompletedGroup";
import { TodoGroup } from "./TodoGroup";

function placeName(group: PlaceGroup): string {
  if (group.key === "inbox") return "Inbox";
  return group.list?.name ?? "Other lists";
}

function placePath(group: PlaceGroup): string | null {
  if (group.key === "inbox") return todoPaths.inbox;
  return group.list === null ? null : todoPaths.list(group.list.id);
}

/** Props for {@link AllByPlace}. */
export interface AllByPlaceProps {
  view: AllViewData;
  data: TodoData;
  actions: TodoActions;
}

/** "All todos" by place: the Inbox, then the lists in sidebar order, then done. */
export function AllByPlace({ view, data, actions }: AllByPlaceProps) {
  const expanded = useTodoUi((s) => s.expanded);
  const visible = useMemo(
    () => [
      ...view.groups.flatMap((g) => flattenWithChildren(g.todos, data.todos, expanded)),
      ...view.done,
    ],
    [view, data.todos, expanded],
  );
  useTodoKeyboard(visible, actions, { reorder: false });

  return (
    <>
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
    </>
  );
}

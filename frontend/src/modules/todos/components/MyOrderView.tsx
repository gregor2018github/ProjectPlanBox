import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { useDropTarget, type DropInfo } from "../../../ui/dnd";
import { rankMenuEntries } from "../rankMenu";
import { rankView } from "../selectors";
import type { Todo } from "../types";
import { useTodoUi } from "../uiStore";
import { RANK_DRAG, useRanking } from "../useRanking";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";
import { RankRow } from "./RankRow";
import { SortableTodoItem } from "./SortableTodoItem";
import { UnsortedItem } from "./UnsortedItem";

/** Props for {@link MyOrderView}. */
export interface MyOrderViewProps {
  data: TodoData;
  actions: TodoActions;
}

/**
 * "My order": one flat ranking of every open todo and subtask, sorted by
 * hand (drag, Alt+↑/↓, or the row menu) and stored, so it is the same on
 * the next visit and on every device. New todos wait in "Unsorted" on top
 * until they are pulled into the ranking; a ranked todo dragged back onto
 * that box leaves the ranking again.
 */
export function MyOrderView({ data, actions }: MyOrderViewProps) {
  const lingering = useTodoUi((s) => s.lingering);
  const view = useMemo(
    () => rankView(data.todos, data.areas, data.lists, data.sections, lingering),
    [data.todos, data.areas, data.lists, data.sections, lingering],
  );
  const ranking = useRanking(data, actions);
  const [pulling, setPulling] = useState<string | null>(null);
  const onDragging = useCallback((id: string, dragging: boolean) => {
    setPulling((current) => (dragging ? id : current === id ? null : current));
  }, []);

  const rankedIds = view.ranked.map((t) => t.id);
  const shift = (todo: Todo, direction: -1 | 1) => {
    const i = rankedIds.indexOf(todo.id);
    const neighbour = i === -1 ? undefined : rankedIds[i + direction];
    if (neighbour === undefined) return;
    if (direction === -1) ranking.place(todo.id, neighbour, null);
    else ranking.place(todo.id, null, neighbour);
  };
  useTodoKeyboard([...view.unsorted, ...view.ranked], actions, { reorder: true, shift });

  const onReorder = (todoId: string) => (ids: string[]) => {
    const i = ids.indexOf(todoId);
    ranking.place(todoId, ids[i + 1] ?? null, ids[i - 1] ?? null);
  };
  const onDropOn = (todoId: string) => (info: DropInfo) => {
    const kind = info.canceled ? null : info.target?.data.kind;
    if (kind === "rank-unsorted") ranking.unrank(todoId);
    else if (kind === "rank-end") ranking.place(todoId, null, null);
    else return false;
    return true;
  };

  const { ref: boxRef, isDropTarget: overBox } = useDropTarget({
    id: "rank-unsorted",
    accept: RANK_DRAG,
    data: { kind: "rank-unsorted" },
  });
  const { ref: endRef, isDropTarget: overEnd } = useDropTarget({
    id: "rank-end",
    accept: RANK_DRAG,
    data: { kind: "rank-end" },
  });
  const openUnsorted = view.unsorted.filter((t) => t.completed_at === null);

  return (
    <>
      <section
        ref={boxRef}
        aria-label="Unsorted"
        className={cx(
          "mb-6 rounded-lg border border-border transition-colors duration-(--duration-fast) ease-out",
          overBox ? "bg-accent-subtle" : "bg-surface",
        )}
      >
        <h2 className="flex items-center gap-2 py-1 pr-1 pl-3">
          <span className="text-sm font-medium">Unsorted</span>
          <span className="text-sm text-text-muted tabular-nums">{openUnsorted.length}</span>
          <span className="flex-1" />
          {openUnsorted.length > 1 && (
            <Button
              size="sm"
              onClick={() => {
                ranking.append(openUnsorted.map((t) => t.id));
              }}
            >
              Add all to my order
            </Button>
          )}
        </h2>
        {view.unsorted.length === 0 ? (
          <p className="px-3 pb-2 text-sm text-text-muted">
            New todos land here. Drag a todo here to take it out of your order.
          </p>
        ) : (
          <ul aria-label="Unsorted todos" className="flex max-h-80 flex-col overflow-y-auto pb-1">
            <AnimatePresence initial={false}>
              {view.unsorted.map((todo) => (
                <UnsortedItem
                  key={todo.id}
                  todo={todo}
                  data={data}
                  actions={actions}
                  ranking={ranking}
                  onDragging={onDragging}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <ul aria-label="My order" className="flex flex-col">
        <AnimatePresence initial={false}>
          {view.ranked.map((todo, index) => (
            <SortableTodoItem
              key={todo.id}
              todo={todo}
              index={index}
              group="rank:ordered"
              type={RANK_DRAG}
              data={{ kind: "todo-row", placement: todo, ids: rankedIds }}
              actions={actions}
              onReorder={onReorder(todo.id)}
              onDropOn={onDropOn(todo.id)}
              dropHint={pulling !== null}
            >
              <RankRow
                todo={todo}
                actions={actions}
                lookup={data.lookup}
                today={data.today}
                rank={index + 1}
                rankEntries={rankMenuEntries(todo, ranking)}
              />
            </SortableTodoItem>
          ))}
        </AnimatePresence>
      </ul>
      <div
        ref={endRef}
        className={cx(
          "mt-1 flex items-center justify-center rounded-md border border-dashed px-3 text-sm text-text-muted transition-colors duration-(--duration-fast) ease-out",
          view.ranked.length === 0 ? "h-20" : pulling !== null ? "h-11" : "h-2",
          overEnd
            ? "border-accent bg-accent-subtle"
            : view.ranked.length === 0 || pulling !== null
              ? "border-border"
              : "border-transparent",
        )}
      >
        {view.ranked.length === 0
          ? "Drag todos here from Unsorted, or add them with ＋."
          : pulling !== null && "Drop here to put it last"}
      </div>
    </>
  );
}

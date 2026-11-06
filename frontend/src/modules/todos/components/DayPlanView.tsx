import { ChevronRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { useDropTarget, type DropInfo } from "../../../ui/dnd";
import { planMenuEntries } from "../rankMenu";
import { dayPlanView } from "../selectors";
import { INBOX, type Todo } from "../types";
import { useTodoUi } from "../uiStore";
import { RANK_DRAG, useDayPlan } from "../useRanking";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";
import { CompletedGroup } from "./CompletedGroup";
import { NewTodoInline } from "./NewTodoInline";
import { RankRow } from "./RankRow";
import { SortableTodoItem } from "./SortableTodoItem";
import { UnsortedItem } from "./UnsortedItem";

/** Props for {@link DayPlanView}. */
export interface DayPlanViewProps {
  data: TodoData;
  actions: TodoActions;
}

/**
 * The day plan: the todos picked for today, sorted by hand (drag, Alt+↑/↓,
 * or the row menu), with a field to add new ones straight into it. Below
 * are the proposals, every open todo not planned yet (My order first, then
 * by due date and priority), added with ＋, a drag, or a swipe to the right. The plan empties
 * itself at midnight; what was done today stays at the bottom until then.
 * The proposals start folded on every visit (owner request, 2026-11-01).
 */
export function DayPlanView({ data, actions }: DayPlanViewProps) {
  const lingering = useTodoUi((s) => s.lingering);
  const view = useMemo(
    () => dayPlanView(data.todos, data.today, lingering),
    [data.todos, data.today, lingering],
  );
  const plan = useDayPlan(data, actions);
  const [pulling, setPulling] = useState<string | null>(null);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const onDragging = useCallback((id: string, dragging: boolean) => {
    setPulling((current) => (dragging ? id : current === id ? null : current));
  }, []);

  const plannedIds = view.planned.map((t) => t.id);
  const shift = (todo: Todo, direction: -1 | 1) => {
    const i = plannedIds.indexOf(todo.id);
    const neighbour = i === -1 ? undefined : plannedIds[i + direction];
    if (neighbour === undefined) return;
    if (direction === -1) plan.place(todo.id, neighbour, null);
    else plan.place(todo.id, null, neighbour);
  };
  useTodoKeyboard([...view.planned, ...(proposalsOpen ? view.proposals : [])], actions, {
    reorder: true,
    shift,
  });

  const onReorder = (todoId: string) => (ids: string[]) => {
    const i = ids.indexOf(todoId);
    plan.place(todoId, ids[i + 1] ?? null, ids[i - 1] ?? null);
  };
  const onDropOn = (todoId: string) => (info: DropInfo) => {
    const kind = info.canceled ? null : info.target?.data.kind;
    if (kind === "rank-unsorted") plan.unrank(todoId);
    else if (kind === "rank-end") plan.place(todoId, null, null);
    else return false;
    return true;
  };

  const { ref: endRef, isDropTarget: overEnd } = useDropTarget({
    id: "rank-end",
    accept: RANK_DRAG,
    data: { kind: "rank-end" },
  });
  const { ref: boxRef, isDropTarget: overBox } = useDropTarget({
    id: "rank-unsorted",
    accept: RANK_DRAG,
    data: { kind: "rank-unsorted" },
  });

  return (
    <>
      <ul aria-label="DayPlan" className="flex flex-col">
        <AnimatePresence initial={false}>
          {view.planned.map((todo, index) => (
            <SortableTodoItem
              key={todo.id}
              todo={todo}
              index={index}
              group="plan:ordered"
              type={RANK_DRAG}
              data={{ kind: "todo-row", placement: todo, ids: plannedIds }}
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
                rankEntries={planMenuEntries(todo, plan)}
              />
            </SortableTodoItem>
          ))}
        </AnimatePresence>
      </ul>
      <div
        ref={endRef}
        className={cx(
          "mt-1 flex items-center justify-center rounded-md border border-dashed px-3 text-sm text-text-muted transition-colors duration-(--duration-fast) ease-out",
          view.planned.length === 0 ? "h-20" : pulling !== null ? "h-11" : "h-2",
          overEnd
            ? "border-accent bg-accent-subtle"
            : view.planned.length === 0 || pulling !== null
              ? "border-border"
              : "border-transparent",
        )}
      >
        {view.planned.length === 0
          ? "Nothing planned yet. Add todos below, or from the proposals with ＋."
          : pulling !== null && "Drop here to put it last"}
      </div>
      <NewTodoInline
        placement={INBOX}
        data={data}
        actions={actions}
        defaults={{ in_plan: true }}
        pickPlace
      />
      <CompletedGroup view="plan" todos={view.done} data={data} actions={actions} showPlace />

      <section
        ref={boxRef}
        aria-label="Proposals"
        className={cx(
          "mt-6 rounded-lg border border-border transition-colors duration-(--duration-fast) ease-out",
          overBox ? "bg-accent-subtle" : "bg-surface",
        )}
      >
        <h2 className="flex items-center gap-2 py-1 pr-1 pl-1">
          <button
            type="button"
            aria-expanded={proposalsOpen}
            onClick={() => {
              setProposalsOpen((open) => !open);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-hover coarse:h-11"
          >
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              aria-hidden
              className={cx(
                "transition-transform duration-(--duration-fast) ease-out",
                proposalsOpen && "rotate-90",
              )}
            />
            Proposals
            <span className="font-normal text-text-muted tabular-nums">
              {view.proposals.length}
            </span>
          </button>
          <span className="flex-1" />
          {proposalsOpen && view.proposals.length > 1 && (
            <Button
              size="sm"
              onClick={() => {
                plan.append(view.proposals.map((t) => t.id));
              }}
            >
              Add all to DayPlan
            </Button>
          )}
        </h2>
        {!proposalsOpen ? null : view.proposals.length === 0 ? (
          <p className="px-3 pb-2 text-sm text-text-muted">
            Every open todo not in the plan shows up here. Drag a todo here to take it out of the
            plan.
          </p>
        ) : (
          <ul aria-label="Proposed todos" className="flex flex-col pb-1">
            <AnimatePresence initial={false}>
              {view.proposals.map((todo) => (
                <UnsortedItem
                  key={todo.id}
                  todo={todo}
                  data={data}
                  actions={actions}
                  ranking={plan}
                  onDragging={onDragging}
                  addLabel="Add to DayPlan"
                  rankEntries={planMenuEntries(todo, plan)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </>
  );
}

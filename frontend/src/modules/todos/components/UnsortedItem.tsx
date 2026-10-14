import { ListPlus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";

import { cx } from "../../../ui/cx";
import { useDragItem } from "../../../ui/dnd";
import { IconButton } from "../../../ui/IconButton";
import { durations, easings, springs } from "../../../ui/motion";
import { rankMenuEntries } from "../rankMenu";
import type { Todo } from "../types";
import { RANK_DRAG, type Ranking } from "../useRanking";
import type { TodoActions } from "../useTodoActions";
import type { TodoData } from "../useTodoData";
import { RankRow } from "./RankRow";

/** Props for {@link UnsortedItem}. */
export interface UnsortedItemProps {
  todo: Todo;
  data: TodoData;
  actions: TodoActions;
  ranking: Ranking;
  /** Reports whether this row is being dragged (ranked rows then show where it would land). */
  onDragging: (todoId: string, dragging: boolean) => void;
}

const enter = { opacity: 0, y: -4 };
const visible = { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.out } };
const leave = { opacity: 0, transition: { duration: durations.exit, ease: easings.in } };

/**
 * A todo waiting in "Unsorted". Dragged onto a ranked row it goes in right
 * there; onto the end of the list, it goes last. The always-visible ＋ adds
 * it last without dragging (touch, keyboard).
 */
export function UnsortedItem({ todo, data, actions, ranking, onDragging }: UnsortedItemProps) {
  const { ref, isDragging } = useDragItem({
    id: `rank-pull:${todo.id}`,
    type: RANK_DRAG,
    data: { kind: "rank-pull" },
    onDragEnd: (info) => {
      if (info.canceled || info.target === null) return;
      const kind = info.target.data.kind;
      if (kind === "todo-row") ranking.place(todo.id, info.target.id, null);
      else if (kind === "rank-end") ranking.place(todo.id, null, null);
    },
  });
  useEffect(() => {
    onDragging(todo.id, isDragging);
    // A drop into the ranking unmounts this row mid-drag: report the end then.
    return () => {
      if (isDragging) onDragging(todo.id, false);
    };
  }, [onDragging, todo.id, isDragging]);

  return (
    <motion.li
      ref={ref}
      layout={isDragging ? false : "position"}
      initial={enter}
      animate={visible}
      exit={leave}
      transition={springs.layout}
      className={cx(
        "touch-manipulation",
        isDragging && "relative z-10 rounded-md bg-surface shadow-md",
      )}
    >
      <RankRow
        todo={todo}
        actions={actions}
        lookup={data.lookup}
        today={data.today}
        rank={null}
        rankEntries={rankMenuEntries(todo, ranking)}
        trailing={
          <IconButton
            label="Add to my order"
            icon={ListPlus}
            className="-my-1"
            onClick={() => {
              ranking.append([todo.id]);
            }}
          />
        }
      />
    </motion.li>
  );
}

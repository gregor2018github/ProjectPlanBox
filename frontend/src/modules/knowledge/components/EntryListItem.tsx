import { motion } from "motion/react";
import type { ReactNode } from "react";

import { cx } from "../../../ui/cx";
import { useDragItem } from "../../../ui/dnd";
import { durations, easings, springs } from "../../../ui/motion";
import { droppedCollection, ENTRY_DRAG_TYPE } from "../entryDrop";
import type { Entry } from "../types";
import type { KnowledgeActions } from "../useKnowledgeActions";

/** Props for {@link EntryListItem}. */
export interface EntryListItemProps {
  entry: Entry;
  actions: KnowledgeActions;
  children: ReactNode;
}

const enter = { opacity: 0, y: 4 };
const visible = { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.out } };
const leave = { opacity: 0, transition: { duration: durations.exit, ease: easings.in } };

/** A list item that animates in/out and can be dragged onto a collection in the sidebar. */
export function EntryListItem({ entry, actions, children }: EntryListItemProps) {
  const { ref, isDragging } = useDragItem({
    id: `entry:${entry.id}`,
    type: ENTRY_DRAG_TYPE,
    onDragEnd: (info) => {
      const target = droppedCollection(info);
      if (target !== undefined) actions.moveTo(entry, target);
    },
  });
  return (
    <motion.li
      ref={ref}
      layout={isDragging ? false : "position"}
      initial={enter}
      animate={visible}
      exit={leave}
      transition={springs.layout}
      className={cx("touch-manipulation", isDragging && "rounded-md bg-surface shadow-md")}
    >
      {children}
    </motion.li>
  );
}

import type { ReactNode } from "react";

import { cx } from "../../../ui/cx";
import { useSortableItem } from "../../../ui/dnd";
import { resolveContainerDrop } from "../dropRules";
import type { Section } from "../types";
import type { ContainerActions } from "../useContainerActions";

/** Props for {@link SortableSection}. */
export interface SortableSectionProps {
  section: Section;
  index: number;
  /** Section ids of this list, in order. */
  siblingIds: readonly string[];
  containers: ContainerActions;
  /** Renders the section; attach `handleRef` to the drag grip. */
  children: (handleRef: (element: Element | null) => void) => ReactNode;
}

/** A section of a list page that can be dragged (by its grip) to reorder. */
export function SortableSection({
  section,
  index,
  siblingIds,
  containers,
  children,
}: SortableSectionProps) {
  const { ref, handleRef, isDragging } = useSortableItem({
    id: section.id,
    index,
    group: `sections:${section.list_id}`,
    type: "section",
    accept: "section",
    data: { kind: "container-row", parentId: section.list_id, ids: siblingIds },
    onDragEnd: (info) => {
      const move = resolveContainerDrop(section.id, info);
      if (move) {
        containers.move({
          kind: "section",
          id: section.id,
          parent_id: move.parentId ?? section.list_id,
          before_id: move.before_id,
          after_id: move.after_id,
        });
      }
    },
  });

  return (
    <section
      ref={ref}
      aria-label={section.name}
      className={cx(isDragging && "relative z-10 rounded-lg bg-surface shadow-lg")}
    >
      {children(handleRef)}
    </section>
  );
}

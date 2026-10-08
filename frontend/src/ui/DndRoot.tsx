import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

import type { DragEndHandler } from "./dnd";

/** Props for {@link DndRoot}. */
export interface DndRootProps {
  children: ReactNode;
}

/**
 * One drag-and-drop context for the whole shell, so items can be dropped
 * anywhere (e.g. a todo onto a list in the sidebar). Pointer, touch and
 * keyboard sensors come from dnd-kit's defaults.
 */
export function DndRoot({ children }: DndRootProps) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        const { source, target } = event.operation;
        if (!source) return;
        const handler = (source.data as { onDragEnd?: DragEndHandler } | undefined)?.onDragEnd;
        const sortable = isSortable(source) ? source : null;
        handler?.({
          canceled: event.canceled,
          target: target ? { id: String(target.id), data: target.data } : null,
          group: sortable?.group === undefined ? null : String(sortable.group),
          index: sortable?.index ?? null,
          initialGroup: sortable?.initialGroup === undefined ? null : String(sortable.initialGroup),
          initialIndex: sortable?.initialIndex ?? null,
        });
      }}
    >
      {children}
    </DragDropProvider>
  );
}

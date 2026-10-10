import { Accessibility, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";

import type { DragEndHandler } from "./dnd";

/** The link inside the dragged element that the pointer went down on, if any. */
function linkInSource(target: EventTarget | null, element: Element | undefined): Element | null {
  if (!(target instanceof Element) || !element) return null;
  const link = target.closest("a[href]");
  return link && element.contains(link) ? link : null;
}

/**
 * dnd-kit never starts a drag on an interactive element, and a link counts
 * as one, so sidebar rows (lists, collections) could not be dragged. Links
 * inside the dragged element may start a drag, but a mouse only by moving:
 * the default 200 ms hold would swallow a slow click on the link.
 */
const pointerSensor = PointerSensor.configure({
  preventActivation: (event, source) =>
    linkInSource(event.target, source.element) === null &&
    (PointerSensor.defaults.preventActivation?.(event, source) ?? false),
  activationConstraints: (event, source) => {
    if (event.pointerType === "mouse" && linkInSource(event.target, source.element)) {
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    }
    const defaults = PointerSensor.defaults.activationConstraints;
    return typeof defaults === "function" ? defaults(event, source) : defaults;
  },
});

/** Props for {@link DndRoot}. */
export interface DndRootProps {
  children: ReactNode;
}

/**
 * One drag-and-drop context for the whole shell, so items can be dropped
 * anywhere (e.g. a todo onto a list in the sidebar).
 *
 * dnd-kit's Accessibility plugin is removed: it turns every sortable row
 * into role="button" with a tab stop, which nests our row buttons inside a
 * button. Keyboard users reorder with Alt+↑/↓ and "Move to…" instead.
 * The pointer sensor is configured so rows that are links can be dragged.
 */
export function DndRoot({ children }: DndRootProps) {
  return (
    <DragDropProvider
      plugins={(defaults) => defaults.filter((plugin) => plugin !== Accessibility)}
      sensors={(defaults) =>
        defaults.map((sensor) => (sensor === PointerSensor ? pointerSensor : sensor))
      }
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

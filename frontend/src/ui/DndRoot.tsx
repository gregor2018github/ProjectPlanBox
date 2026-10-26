import { Accessibility, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useEffect, type ReactNode } from "react";

import { DRAG_MOVE_THRESHOLD, setDragMoving, type DragEndHandler } from "./dnd";
import { installTouchHoldGuard, TOUCH_HOLD } from "./touchHold";

/** Marks dnd-kit's stand-in for the dragged element (see the Feedback plugin of `@dnd-kit/dom`). */
const PLACEHOLDER_ATTR = "data-dnd-placeholder";

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
 * On touch a drag starts after a 250 ms hold; dnd-kit's 5 px tolerance is
 * widened to what a resting finger drifts (see `touchHold.ts`).
 */
const pointerSensor = PointerSensor.configure({
  preventActivation: (event, source) =>
    linkInSource(event.target, source.element) === null &&
    (PointerSensor.defaults.preventActivation?.(event, source) ?? false),
  activationConstraints: (event, source) => {
    if (event.pointerType === "mouse" && linkInSource(event.target, source.element)) {
      return [new PointerActivationConstraints.Distance({ value: 5 })];
    }
    if (event.pointerType === "touch") {
      return [new PointerActivationConstraints.Delay(TOUCH_HOLD)];
    }
    const defaults = PointerSensor.defaults.activationConstraints;
    return typeof defaults === "function" ? defaults(event, source) : defaults;
  },
});

/** Where a dragged element sat in the DOM when its drag began. */
interface Origin {
  element: Element;
  parent: Element;
  next: Element | null;
}

/** The origin of the drag under way (there is only ever one). */
let origin: Origin | null = null;

/** Notes where `element` sits, skipping any placeholder dnd-kit already put after it. */
function rememberOrigin(element: Element | undefined): Origin | null {
  const parent = element?.parentElement;
  if (!element || !parent) return null;
  let next = element.nextElementSibling;
  while (next?.hasAttribute(PLACEHOLDER_ATTR)) next = next.nextElementSibling;
  return { element, parent, next };
}

/**
 * dnd-kit's live sorting moves the dragged element into the DOM container of
 * the group it hovers, and only moves it back when the drag is cancelled.
 * React still holds it under its old parent, so once the drop is applied it
 * would remove it from a container it is no longer in ("removeChild" crash).
 * Putting it back first leaves every DOM move to React.
 */
function restoreOrigin(at: Origin | null): void {
  if (!at?.parent.isConnected || at.element.parentElement === at.parent) return;
  at.parent.insertBefore(at.element, at.next?.parentElement === at.parent ? at.next : null);
}

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
 * The pointer sensor is configured so rows that are links can be dragged,
 * and a touch guard keeps the browser from scrolling during the hold.
 * On touch the same long-press starts a drag and, on rows without a ⋯
 * button, opens the row's context menu; once the drag moves,
 * {@link useDragMoving} closes that menu.
 */
export function DndRoot({ children }: DndRootProps) {
  useEffect(() => installTouchHoldGuard(), []);
  return (
    <DragDropProvider
      plugins={(defaults) => defaults.filter((plugin) => plugin !== Accessibility)}
      sensors={(defaults) =>
        defaults.map((sensor) => (sensor === PointerSensor ? pointerSensor : sensor))
      }
      onDragStart={(event) => {
        origin = rememberOrigin(event.operation.source?.element);
      }}
      onDragMove={(event) => {
        const { x, y } = event.operation.transform;
        if (Math.hypot(x, y) > DRAG_MOVE_THRESHOLD) setDragMoving(true);
      }}
      onDragEnd={(event, manager) => {
        setDragMoving(false);
        const { source } = event.operation;
        if (!source) return;
        const handler = (source.data as { onDragEnd?: DragEndHandler } | undefined)?.onDragEnd;
        const sortable = isSortable(source) ? source : null;
        let target: Pick<typeof source, "id" | "data"> | null = event.operation.target;
        // A sortable lands where live sorting shows it, even when released
        // over nothing. Sorted into another group, it is its own target with
        // data still describing the group it left: a neighbour from the new
        // group describes the drop instead.
        if (sortable && target === null) target = source;
        if (sortable && target?.id === source.id && sortable.group !== sortable.initialGroup) {
          for (const droppable of manager.registry.droppables) {
            if (
              isSortable(droppable) &&
              droppable.id !== source.id &&
              droppable.group === sortable.group
            ) {
              target = droppable;
              break;
            }
          }
        }
        restoreOrigin(origin);
        origin = null;
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

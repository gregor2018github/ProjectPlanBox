/**
 * Drag and drop, wrapped so the rest of the app never imports dnd-kit
 * directly (swapping the library stays local to this folder).
 *
 * Each draggable carries its own `onDragEnd` in its data; {@link DndRoot}
 * calls it with a library-neutral {@link DropInfo}.
 */
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

/** What happened when a drag ended. */
export interface DropInfo {
  canceled: boolean;
  /** The element dropped onto (a sortable item or a drop target), if any. */
  target: { id: string; data: Readonly<Record<string, unknown>> } | null;
  /** For sortables: the group and index the item ended up in. */
  group: string | null;
  index: number | null;
  initialGroup: string | null;
  initialIndex: number | null;
}

/** Called on the dragged item when its drag ends. */
export type DragEndHandler = (info: DropInfo) => void;

/** Options for {@link useSortableItem}. */
export interface SortableItemOptions {
  id: string;
  index: number;
  /** Items can move between groups that accept their type. */
  group: string;
  type: string;
  accept: string | string[];
  disabled?: boolean;
  data?: Record<string, unknown>;
  onDragEnd: DragEndHandler;
}

/** Makes an element a sortable item; spread `ref` on it (and `handleRef` on a grip, if any). */
export function useSortableItem({ onDragEnd, data, ...options }: SortableItemOptions) {
  const { ref, handleRef, isDragging } = useSortable({
    ...options,
    disabled: options.disabled ?? false,
    data: { ...data, onDragEnd },
    transition: { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  });
  return { ref, handleRef, isDragging };
}

/** Options for {@link useDropTarget}. */
export interface DropTargetOptions {
  id: string;
  accept: string | string[];
  data: Record<string, unknown>;
  disabled?: boolean;
}

/** Makes an element accept drops (e.g. a list in the sidebar); spread `ref` on it. */
export function useDropTarget({ id, accept, data, disabled = false }: DropTargetOptions) {
  const { ref, isDropTarget } = useDroppable({ id, accept, data, disabled });
  return { ref, isDropTarget };
}

/** Options for {@link useDragItem}. */
export interface DragItemOptions {
  id: string;
  /** Drop targets accept items by type. */
  type: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  onDragEnd: DragEndHandler;
}

/**
 * Makes an element draggable without sorting (e.g. an event chip moved to
 * another calendar day); spread `ref` on it.
 */
export function useDragItem({ id, type, disabled = false, data, onDragEnd }: DragItemOptions) {
  const { ref, isDragging } = useDraggable({ id, type, disabled, data: { ...data, onDragEnd } });
  return { ref, isDragging };
}

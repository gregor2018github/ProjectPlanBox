import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { GripHorizontal, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { cx } from "../../../ui/cx";
import { IconButton } from "../../../ui/IconButton";
import {
  MAX_BOX_HEIGHT,
  MAX_BOX_WIDTH,
  MIN_BOX_HEIGHT,
  MIN_BOX_WIDTH,
  RESIZE_DIRECTIONS,
  resizeBounds,
  type BoxBounds,
  type ResizeDirection,
} from "../pageContent";
import { imageFiles, isSafeHref, pageExtensions } from "../pageEditor";
import type { PageBox as Box, PageDoc } from "../types";

/** Props for {@link PageBox}. */
export interface PageBoxProps {
  box: Box;
  /** Puts the cursor into the box when it appears (a box just made by clicking). */
  autoFocus: boolean;
  onDocChange: (id: string, doc: PageDoc) => void;
  onMove: (id: string, x: number, y: number) => void;
  /** New place and size after dragging a side or corner (height: the text area's least height). */
  onResize: (id: string, bounds: BoxBounds) => void;
  /** Deletes the box (undoable). */
  onRemove: (id: string) => void;
  /** The box lost focus while empty: it goes away without a trace. */
  onLeaveEmpty: (id: string) => void;
  /** The box's editor got the focus (true), or went away (false): the toolbar follows it. */
  onActive: (editor: Editor, active: boolean) => void;
  uploadImage: (file: File) => Promise<string | null>;
}

/** Keyboard steps for moving and resizing (Shift for the big one). */
const STEP = 8;
const BIG_STEP = 40;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  mode: "move" | ResizeDirection;
  /** The bounds when the drag started (the text area measured if it has no height yet). */
  start: BoxBounds;
}

/** Where each handle sits on the text area, its cursor and its name. */
const HANDLES: Record<ResizeDirection, { place: string; cursor: string; label: string }> = {
  n: { place: "-top-1.5 left-3 right-3 h-3", cursor: "cursor-ns-resize", label: "top edge" },
  s: { place: "-bottom-1.5 left-3 right-3 h-3", cursor: "cursor-ns-resize", label: "bottom edge" },
  e: { place: "-right-1.5 top-3 bottom-3 w-3", cursor: "cursor-ew-resize", label: "right edge" },
  w: { place: "-left-1.5 top-3 bottom-3 w-3", cursor: "cursor-ew-resize", label: "left edge" },
  ne: {
    place: "-top-1.5 -right-1.5 size-4",
    cursor: "cursor-nesw-resize",
    label: "top right corner",
  },
  sw: {
    place: "-bottom-1.5 -left-1.5 size-4",
    cursor: "cursor-nesw-resize",
    label: "bottom left corner",
  },
  nw: {
    place: "-top-1.5 -left-1.5 size-4",
    cursor: "cursor-nwse-resize",
    label: "top left corner",
  },
  se: {
    place: "-bottom-1.5 -right-1.5 size-4",
    cursor: "cursor-nwse-resize",
    label: "bottom right corner",
  },
};

/**
 * One box on a page: rich text that can sit anywhere. Drag the grip above it
 * to move it (or focus the grip and use the arrow keys), and any side or
 * corner to resize it (the right and bottom edges take arrow keys too). Its
 * height is a least height: it still grows with its text, so nothing is cut
 * off. Images can be pasted or dropped into it.
 */
export function PageBox({
  box,
  autoFocus,
  onDocChange,
  onMove,
  onResize,
  onRemove,
  onLeaveEmpty,
  onActive,
  uploadImage,
}: PageBoxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  /** The bounds shown while a drag is under way, and whether it moves the box. */
  const [preview, setPreview] = useState<BoxBounds | null>(null);
  const [moving, setMoving] = useState(false);

  // The editor is made once per box; these refs give its callbacks the latest props.
  const props = useRef({ box, onDocChange, onLeaveEmpty, onActive, uploadImage });
  useEffect(() => {
    props.current = { box, onDocChange, onLeaveEmpty, onActive, uploadImage };
  });

  const extensions = useMemo(() => pageExtensions(), []);
  const editor = useEditor(
    {
      extensions,
      content: box.doc,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: "page-doc", "aria-label": "Text box", spellcheck: "true" },
        handlePaste: (view, event) => {
          const files = imageFiles(event.clipboardData?.files);
          if (files.length === 0) return false;
          event.preventDefault();
          void insertImages(view, files, undefined, props.current.uploadImage);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;
          const files = imageFiles(event.dataTransfer?.files);
          if (files.length === 0) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void insertImages(view, files, at, props.current.uploadImage);
          return true;
        },
        handleClick: (_view, _pos, event) => {
          // Links open with Ctrl (or ⌘) + click; a plain click edits.
          if (!(event.ctrlKey || event.metaKey)) return false;
          const link = (event.target as HTMLElement | null)?.closest("a[href]");
          const href = link?.getAttribute("href");
          if (href == null || !isSafeHref(href)) return false;
          window.open(href, "_blank", "noopener,noreferrer");
          return true;
        },
        handleKeyDown: (view, event) => {
          if (event.key !== "Escape") return false;
          view.dom.blur();
          rootRef.current?.querySelector<HTMLElement>("[data-box-grip]")?.focus();
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        props.current.onDocChange(props.current.box.id, e.getJSON() as PageDoc);
      },
      onFocus: ({ editor: e }) => {
        props.current.onActive(e, true);
      },
      onBlur: ({ editor: e }) => {
        // Wait for the focus to land: moving to the grip or the delete button stays in the box.
        setTimeout(() => {
          const inside = rootRef.current?.contains(document.activeElement) ?? false;
          if (!inside && e.isEmpty && !e.isDestroyed) {
            props.current.onLeaveEmpty(props.current.box.id);
          }
        }, 0);
      },
    },
    [],
  );

  useEffect(
    () => () => {
      props.current.onActive(editor, false);
    },
    [editor],
  );

  // Before the browser handles the next key: typing right after the click goes
  // into the new box, not into the box that had the focus or to the app's
  // shortcuts. Tiptap's focus command waits a frame, so focus the view first.
  useLayoutEffect(() => {
    if (!autoFocus) return;
    editor.view.focus();
    editor.commands.focus("end");
    // Only when the box appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The current bounds; a box without a height yet has its text area's. */
  const currentBounds = (): BoxBounds => ({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height ?? textRef.current?.offsetHeight ?? MIN_BOX_HEIGHT,
  });
  const boundsAfter = (d: Drag, event: PointerEvent<HTMLElement>): BoxBounds => {
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (d.mode !== "move") return resizeBounds(d.start, d.mode, dx, dy);
    return {
      ...d.start,
      x: Math.max(0, Math.round(d.start.x + dx)),
      y: Math.max(0, Math.round(d.start.y + dy)),
    };
  };
  const startDrag = (event: PointerEvent<HTMLElement>, mode: Drag["mode"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode,
      start: currentBounds(),
    };
    setMoving(mode === "move");
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    setPreview(boundsAfter(d, event));
  };
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (event.clientX === d.startX && event.clientY === d.startY) return;
    const next = boundsAfter(d, event);
    if (d.mode === "move") onMove(box.id, next.x, next.y);
    else onResize(box.id, next);
  };

  const onGripKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      onMove(box.id, box.x + move[0], box.y + move[1]);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(box.id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      editor.commands.focus("end");
    }
  };

  /** The right edge takes ←/→ (width), the bottom edge ↑/↓ (height). */
  const onEdgeKeyDown = (direction: ResizeDirection) => (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const steps: Record<string, [number, number]> =
      direction === "e"
        ? { ArrowLeft: [-step, 0], ArrowRight: [step, 0] }
        : { ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = steps[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    onResize(box.id, resizeBounds(currentBounds(), direction, delta[0], delta[1]));
  };

  const shown = preview ?? { ...box, height: box.height ?? null };

  return (
    <div
      ref={rootRef}
      data-box-id={box.id}
      className={cx("group absolute", preview !== null && "z-10")}
      style={{ left: shown.x, top: shown.y, width: shown.width }}
    >
      <div className="flex h-6 items-center justify-between opacity-0 transition-opacity duration-(--duration-fast) ease-out group-focus-within:opacity-100 group-hover:opacity-100 coarse:h-11 coarse:opacity-100">
        <button
          type="button"
          data-box-grip
          aria-label="Move box (arrow keys; Delete removes it)"
          title="Drag to move"
          onPointerDown={(event) => {
            startDrag(event, "move");
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onGripKeyDown}
          className={cx(
            "flex h-full flex-1 touch-none items-center justify-center rounded-t-md text-text-subtle hover:bg-hover hover:text-text-muted",
            preview !== null && moving ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <GripHorizontal size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <IconButton
          label="Delete box"
          icon={X}
          className="size-6"
          onClick={() => {
            onRemove(box.id);
          }}
        />
      </div>
      <div
        ref={textRef}
        className={cx(
          "relative rounded-md border border-transparent bg-surface px-3 py-2 transition-colors duration-(--duration-fast) ease-out group-hover:border-border focus-within:border-accent",
          preview !== null && "border-border shadow-md",
        )}
        style={shown.height === null ? undefined : { minHeight: shown.height }}
      >
        <EditorContent editor={editor} />
        {RESIZE_DIRECTIONS.map((direction) => {
          const handle = HANDLES[direction];
          const keyboard = direction === "e" || direction === "s";
          return (
            <div
              key={direction}
              data-resize={direction}
              role={keyboard ? "separator" : undefined}
              aria-orientation={
                keyboard ? (direction === "e" ? "vertical" : "horizontal") : undefined
              }
              aria-label={
                keyboard
                  ? direction === "e"
                    ? "Box width (left and right arrow keys)"
                    : "Box height (up and down arrow keys)"
                  : undefined
              }
              aria-hidden={keyboard ? undefined : true}
              aria-valuenow={
                keyboard
                  ? direction === "e"
                    ? shown.width
                    : (shown.height ?? undefined)
                  : undefined
              }
              aria-valuemin={
                keyboard ? (direction === "e" ? MIN_BOX_WIDTH : MIN_BOX_HEIGHT) : undefined
              }
              aria-valuemax={
                keyboard ? (direction === "e" ? MAX_BOX_WIDTH : MAX_BOX_HEIGHT) : undefined
              }
              tabIndex={keyboard ? 0 : undefined}
              title={`Drag the ${handle.label} to resize`}
              onPointerDown={(event) => {
                startDrag(event, direction);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={keyboard ? onEdgeKeyDown(direction) : undefined}
              className={cx(
                "absolute z-10 touch-none rounded-full opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent-subtle focus-visible:opacity-100 coarse:opacity-100",
                direction.length === 2 && "border-2 border-accent bg-surface",
                handle.place,
                handle.cursor,
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Uploads images and puts them into the document, at `at` or over the selection. */
async function insertImages(
  view: EditorView,
  files: readonly File[],
  at: number | undefined,
  upload: (file: File) => Promise<string | null>,
): Promise<void> {
  for (const file of files) {
    const src = await upload(file);
    if (src === null || view.isDestroyed) continue;
    const node = view.state.schema.nodes.image?.create({ src });
    if (node === undefined) return;
    const { tr, doc } = view.state;
    view.dispatch(
      at === undefined
        ? tr.replaceSelectionWith(node)
        : tr.insert(Math.min(at, doc.content.size), node),
    );
  }
}

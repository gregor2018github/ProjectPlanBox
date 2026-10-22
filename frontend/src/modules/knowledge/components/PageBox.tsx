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
import { MAX_BOX_WIDTH, MIN_BOX_WIDTH } from "../pageContent";
import { imageFiles, isSafeHref, pageExtensions } from "../pageEditor";
import type { PageBox as Box, PageDoc } from "../types";

/** Props for {@link PageBox}. */
export interface PageBoxProps {
  box: Box;
  /** Puts the cursor into the box when it appears (a box just made by clicking). */
  autoFocus: boolean;
  onDocChange: (id: string, doc: PageDoc) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number) => void;
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
  mode: "move" | "resize";
}

/**
 * One box on a page: rich text that can sit anywhere. Drag the grip above it
 * to move it (or focus the grip and use the arrow keys) and its right edge to
 * change its width. Images can be pasted or dropped into it.
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
  const drag = useRef<Drag | null>(null);
  const [offset, setOffset] = useState({ dx: 0, dy: 0, dw: 0 });

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

  const startDrag = (event: PointerEvent<HTMLElement>, mode: Drag["mode"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      mode,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    setOffset(d.mode === "move" ? { dx, dy, dw: 0 } : { dx: 0, dy: 0, dw: dx });
  };
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    drag.current = null;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    setOffset({ dx: 0, dy: 0, dw: 0 });
    if (d.mode === "move" && (dx !== 0 || dy !== 0)) onMove(box.id, box.x + dx, box.y + dy);
    if (d.mode === "resize" && dx !== 0) onResize(box.id, box.width + dx);
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

  const onEdgeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onResize(box.id, box.width + (event.key === "ArrowLeft" ? -step : step));
    }
  };

  const width = Math.min(Math.max(box.width + offset.dw, MIN_BOX_WIDTH), MAX_BOX_WIDTH);
  const dragging = offset.dx !== 0 || offset.dy !== 0;

  return (
    <div
      ref={rootRef}
      data-box-id={box.id}
      className={cx("group absolute", dragging && "z-10")}
      style={{ left: Math.max(0, box.x + offset.dx), top: Math.max(0, box.y + offset.dy), width }}
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
            dragging ? "cursor-grabbing" : "cursor-grab",
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
        className={cx(
          "relative rounded-md border border-transparent bg-surface px-3 py-2 transition-colors duration-(--duration-fast) ease-out group-hover:border-border focus-within:border-accent",
          dragging && "shadow-md",
        )}
      >
        <EditorContent editor={editor} />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Box width (left and right arrow keys)"
          aria-valuenow={width}
          aria-valuemin={MIN_BOX_WIDTH}
          aria-valuemax={MAX_BOX_WIDTH}
          tabIndex={0}
          onPointerDown={(event) => {
            startDrag(event, "resize");
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onEdgeKeyDown}
          className="absolute top-0 -right-1.5 h-full w-3 cursor-ew-resize touch-none rounded-full opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent-subtle focus-visible:opacity-100 coarse:-right-3 coarse:w-6 coarse:opacity-100"
        />
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

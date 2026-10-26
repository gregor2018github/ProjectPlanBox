import { useNavigate } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { newId } from "../../../core/ids";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { readStorage, writeStorage } from "../../../core/storage";
import { useUndo } from "../../../core/undo/undoContext";
import { cx } from "../../../ui/cx";
import { IconButton } from "../../../ui/IconButton";
import { InlineTitle } from "../../../ui/InlineTitle";
import { Menu } from "../../../ui/Menu";
import {
  addBox,
  isEmptyDoc,
  moveBox,
  newBox,
  removeBox,
  restoreBox,
  setBoxBounds,
  setBoxDoc,
} from "../pageContent";
import {
  addStroke,
  eraseAt,
  INK_COLORS,
  INK_WIDTHS,
  moveDrawing,
  putBackDrawings,
  removeDrawing,
  removeLastStroke,
  restackDrawing,
  type DrawingSnapshot,
  type Pen,
} from "../ink";
import { knowledgePaths } from "../paths";
import { UNTITLED, type Entry, type PageContent, type PageDoc } from "../types";
import { useKnowledgeActions } from "../useKnowledgeActions";
import { useKnowledgeData } from "../useKnowledgeData";
import { usePageContent } from "../usePageContent";
import { useUploadImage } from "../useUploadImage";
import { EntryProperties } from "./EntryProperties";
import { PageCanvas, type PageInk, type PageTool } from "./PageCanvas";
import { PageToolbar } from "./PageToolbar";

/** Props for {@link PageView}. */
export interface PageViewProps {
  entry: Entry;
}

/** A table to start with: a header row and two rows of three columns. */
function tableDoc(): PageDoc {
  const row = (cell: string) => ({
    type: "tableRow",
    content: [0, 1, 2].map(() => ({ type: cell, content: [{ type: "paragraph" }] })),
  });
  return {
    type: "doc",
    content: [
      { type: "table", content: [row("tableHeader"), row("tableCell"), row("tableCell")] },
      { type: "paragraph" },
    ],
  };
}

/** How far from the visible top left a box added from the toolbar goes. */
const INSET = 24;

/** Where this browser remembers the last pen. */
const PEN_KEY = "planbox.knowledge.pen";
/** How far around the eraser strokes go (pixels). */
const ERASER_REACH = 8;

/** The pen this browser used last, or a thin one in the text colour. */
function storedPen(): Pen {
  const fallback: Pen = { color: "default", width: 2 };
  try {
    const value = JSON.parse(readStorage(PEN_KEY) ?? "null") as Partial<Pen> | null;
    const color = INK_COLORS.find((c) => c === value?.color) ?? fallback.color;
    const width = INK_WIDTHS.find((w) => w === value?.width) ?? fallback.width;
    return { color, width };
  } catch {
    return fallback;
  }
}

/**
 * One knowledge page, large: its title, collection and tags, a formatting
 * toolbar and the page itself, where text boxes sit wherever they were put.
 * Full screen (F) hides everything else.
 */
export function PageView({ entry }: PageViewProps) {
  const data = useKnowledgeData();
  const actions = useKnowledgeActions();
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const uploadImage = useUploadImage();
  const save = useCallback(
    (content: PageContent, leaving: boolean) => {
      actions.update(entry.id, { content }, { keepalive: leaving });
    },
    [actions, entry.id],
  );
  const page = usePageContent(entry.content, save);
  const { change } = page;
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [tool, setToolState] = useState<PageTool>("type");
  const [pen, setPenState] = useState(storedPen);
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  /** The drawing the last stroke went into: the next one nearby joins it. */
  const inkJoin = useRef<string | null>(null);
  /** The drawings an erase gesture changed, as they were before it. */
  const erased = useRef(new Map<string, DrawingSnapshot>());
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNew = entry.title === UNTITLED && entry.content.boxes.length === 0;

  const addBoxAt = useCallback(
    (x: number, y: number, doc?: PageDoc) => {
      const id = newId();
      change((content) => addBox(content, newBox(id, x, y, doc)));
      setFocusId(id);
    },
    [change],
  );

  /** The visible top left of the page, nudged down past boxes already there. */
  const spotInView = () => {
    const scroller = scrollRef.current;
    const x = (scroller?.scrollLeft ?? 0) + INSET;
    let y = (scroller?.scrollTop ?? 0) + INSET;
    while (page.content.boxes.some((b) => Math.abs(b.x - x) < INSET && Math.abs(b.y - y) < INSET)) {
      y += INSET * 2;
    }
    return { x, y };
  };

  const imageBox = async (files: readonly File[], x: number, y: number) => {
    const sources: string[] = [];
    for (const file of files) {
      const src = await uploadImage(file);
      if (src !== null) sources.push(src);
    }
    if (sources.length === 0) return;
    addBoxAt(x, y, {
      type: "doc",
      content: [
        ...sources.map((src) => ({ type: "image", attrs: { src } })),
        { type: "paragraph" },
      ],
    });
  };

  const usable = activeEditor !== null && !activeEditor.isDestroyed ? activeEditor : null;

  const onAddImages = (files: File[]) => {
    if (usable === null) {
      const { x, y } = spotInView();
      void imageBox(files, x, y);
      return;
    }
    void (async () => {
      for (const file of files) {
        const src = await uploadImage(file);
        if (src !== null && !usable.isDestroyed) usable.chain().focus().setImage({ src }).run();
      }
    })();
  };

  const onAddTable = () => {
    if (usable !== null) {
      usable.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    }
    const { x, y } = spotInView();
    addBoxAt(x, y, tableDoc());
  };

  const onRemove = useCallback(
    (id: string) => {
      const index = page.content.boxes.findIndex((b) => b.id === id);
      const box = page.content.boxes[index];
      if (box === undefined) return;
      change((content) => removeBox(content, id));
      if (isEmptyDoc(box.doc)) return;
      pushUndo({
        label: "Deleted a box",
        undo: () => {
          change((content) => restoreBox(content, box, index));
        },
      });
    },
    [page.content, change, pushUndo],
  );

  const setTool = (next: PageTool) => {
    inkJoin.current = null;
    setSelectedDrawing(null);
    if (next !== "type") {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && rootRef.current?.contains(focused)) focused.blur();
    }
    setToolState(next);
  };
  const setPen = (next: Pen) => {
    setPenState(next);
    writeStorage(PEN_KEY, JSON.stringify(next));
  };

  const onRemoveDrawing = useCallback(
    (id: string) => {
      const drawings = page.content.drawings ?? [];
      const index = drawings.findIndex((d) => d.id === id);
      const drawing = drawings[index];
      if (drawing === undefined) return;
      setSelectedDrawing(null);
      change((content) => removeDrawing(content, id));
      pushUndo({
        label: "Deleted a drawing",
        undo: () => {
          change((content) => putBackDrawings(content, [{ drawing, index }]));
        },
      });
    },
    [page.content, change, pushUndo],
  );

  const ink: PageInk = {
    tool,
    pen,
    selectedId: selectedDrawing,
    onSelect: setSelectedDrawing,
    onStroke: (points) => {
      let drawingId = "";
      let count = 0;
      change((content) => {
        const added = addStroke(content, points, pen, inkJoin.current, newId());
        drawingId = added.drawingId;
        count = added.content.drawings?.find((d) => d.id === drawingId)?.strokes.length ?? 0;
        return added.content;
      });
      inkJoin.current = drawingId;
      pushUndo({
        label: "Drew a stroke",
        silent: true,
        undo: () => {
          change((content) => removeLastStroke(content, drawingId, count));
        },
      });
    },
    onErase: (x, y) => {
      change((content) => {
        const result = eraseAt(content, x, y, ERASER_REACH);
        for (const snapshot of result.before) {
          if (!erased.current.has(snapshot.drawing.id)) {
            erased.current.set(snapshot.drawing.id, snapshot);
          }
        }
        return result.content;
      });
    },
    onEraseEnd: () => {
      const before = [...erased.current.values()];
      erased.current = new Map();
      if (before.length === 0) return;
      inkJoin.current = null;
      pushUndo({
        label: "Erased ink",
        silent: true,
        undo: () => {
          change((content) => putBackDrawings(content, before));
        },
      });
    },
    onMove: (id, x, y) => {
      change((content) => moveDrawing(content, id, x, y));
    },
    onRestack: (id, to) => {
      change((content) => restackDrawing(content, id, to));
    },
    onRemove: onRemoveDrawing,
  };

  const onActive = useCallback((editor: Editor, active: boolean) => {
    setActiveEditor((current) => (active ? editor : current === editor ? null : current));
  }, []);

  // Full screen: the page covers the app, and the browser goes full screen too where it can.
  const toggleFull = () => {
    if (full) {
      setFull(false);
      if (document.fullscreenElement !== null)
        void document.exitFullscreen().catch(() => undefined);
      return;
    }
    setFull(true);
    try {
      void rootRef.current?.requestFullscreen().catch(() => undefined);
    } catch {
      // No Fullscreen API (some WebViews): covering the app is enough.
    }
  };
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement === null) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);
  useShortcut({
    id: "knowledge.fullscreen",
    keys: "F",
    description: "Full screen page (again to leave)",
    group: "Knowledge",
    run: toggleFull,
  });
  useShortcut({
    id: "knowledge.pen",
    keys: "P",
    description: "Pen on the page (again to put it down)",
    group: "Knowledge",
    run: () => {
      setTool(tool === "pen" ? "type" : "pen");
    },
  });
  useShortcut(
    tool !== "type"
      ? {
          id: "knowledge.pen.leave",
          keys: "Escape",
          description: "Stop drawing",
          group: "Knowledge",
          hidden: true,
          run: () => {
            setTool("type");
          },
        }
      : null,
  );
  useShortcut(
    full && tool === "type"
      ? {
          id: "knowledge.fullscreen.leave",
          keys: "Escape",
          description: "Leave full screen",
          group: "Knowledge",
          hidden: true,
          run: toggleFull,
        }
      : null,
  );

  const back = () => {
    page.flush();
    void navigate({
      to:
        entry.collection_id === null
          ? knowledgePaths.all
          : knowledgePaths.collection(entry.collection_id),
    });
  };

  return (
    <div
      ref={rootRef}
      className={cx("flex h-full min-h-0 flex-col bg-bg", full && "fixed inset-0 z-40")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 pb-2">
        {!full && (
          <IconButton
            label={`Back to ${data.collectionName(entry.collection_id)}`}
            icon={ArrowLeft}
            onClick={back}
          />
        )}
        <div className="flex min-w-48 flex-1">
          <InlineTitle
            size="xl"
            label="Page title"
            value={entry.title}
            autoSelect={isNew}
            onCommit={(title) => {
              actions.update(entry.id, { title });
            }}
          />
        </div>
        <EntryProperties entry={entry} data={data} actions={actions} />
        <div className="flex items-center">
          {!full && (
            <IconButton
              label="Details and links"
              icon={PanelRightOpen}
              onClick={() => {
                actions.openDetails(entry);
              }}
            />
          )}
          <IconButton
            label={full ? "Leave full screen" : "Full screen"}
            icon={full ? Minimize2 : Maximize2}
            shortcut="F"
            pressed={full}
            onClick={toggleFull}
          />
          <Menu
            entries={[
              {
                id: "delete",
                label: "Delete page",
                icon: Trash2,
                danger: true,
                onSelect: () => {
                  actions.remove(entry);
                  back();
                },
              },
            ]}
            trigger={<IconButton label="Page actions" icon={MoreHorizontal} />}
          />
        </div>
      </div>
      <div className="border-y border-border bg-surface">
        <PageToolbar
          editor={usable}
          onAddBox={() => {
            const { x, y } = spotInView();
            addBoxAt(x, y);
          }}
          onAddImages={onAddImages}
          onAddTable={onAddTable}
          tool={tool}
          onTool={setTool}
          pen={pen}
          onPen={setPen}
        />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-surface">
        <div className="relative min-h-full w-max min-w-full p-6">
          {page.content.boxes.length === 0 && (page.content.drawings ?? []).length === 0 && (
            <p className="pointer-events-none absolute top-8 left-10 text-base text-text-subtle">
              Click anywhere on the page to start writing.
            </p>
          )}
          <PageCanvas
            content={page.content}
            focusId={focusId}
            onAddBox={addBoxAt}
            onDropImages={(files, x, y) => {
              void imageBox(files, x, y);
            }}
            onDocChange={(id, doc) => {
              change((content) => setBoxDoc(content, id, doc));
            }}
            onMove={(id, x, y) => {
              change((content) => moveBox(content, id, x, y));
            }}
            onResize={(id, bounds) => {
              change((content) => setBoxBounds(content, id, bounds));
            }}
            onRemove={onRemove}
            onLeaveEmpty={(id) => {
              change((content) => removeBox(content, id));
            }}
            onActive={onActive}
            uploadImage={uploadImage}
            ink={ink}
          />
        </div>
      </div>
    </div>
  );
}

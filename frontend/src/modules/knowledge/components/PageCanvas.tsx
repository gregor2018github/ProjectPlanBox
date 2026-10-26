import type { Editor } from "@tiptap/core";
import type { DragEvent, PointerEvent, Ref } from "react";

import { pageExtent, type BoxBounds } from "../pageContent";
import { imageFiles } from "../pageEditor";
import type { PageContent, PageDoc } from "../types";
import { PageBox } from "./PageBox";

/** Props for {@link PageCanvas}. */
export interface PageCanvasProps {
  content: PageContent;
  /** The box to put the cursor into when it appears (one just made), if any. */
  focusId: string | null;
  /** Adds an empty box at a point of the page and focuses it. */
  onAddBox: (x: number, y: number) => void;
  /** Adds a box holding these images at a point of the page. */
  onDropImages: (files: File[], x: number, y: number) => void;
  onDocChange: (id: string, doc: PageDoc) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, bounds: BoxBounds) => void;
  onRemove: (id: string) => void;
  onLeaveEmpty: (id: string) => void;
  onActive: (editor: Editor, active: boolean) => void;
  uploadImage: (file: File) => Promise<string | null>;
  /** The page area itself (to find the visible part when adding a box from the toolbar). */
  areaRef?: Ref<HTMLDivElement>;
}

/** Where a box goes for a pointer at this point: its grip under the pointer. */
const GRIP_OFFSET = { x: 16, y: 12 };

/**
 * The page: an open area where boxes sit wherever they were put, like a sheet
 * of paper. Click (or tap) empty space to start typing there; drop images on
 * it to place them. It grows to the right and down with its boxes.
 */
export function PageCanvas({
  content,
  focusId,
  onAddBox,
  onDropImages,
  onDocChange,
  onMove,
  onResize,
  onRemove,
  onLeaveEmpty,
  onActive,
  uploadImage,
  areaRef,
}: PageCanvasProps) {
  const extent = pageExtent(content);

  const pointOf = (event: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - GRIP_OFFSET.x,
      y: event.clientY - rect.top - GRIP_OFFSET.y,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    // Keep the focus from jumping to the page area; the new box takes it.
    event.preventDefault();
    const { x, y } = pointOf(event);
    onAddBox(x, y);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const files = imageFiles(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    const { x, y } = pointOf(event);
    onDropImages(files, x, y);
  };

  return (
    <div
      ref={areaRef}
      role="region"
      aria-label="Page"
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="relative min-h-full min-w-full cursor-text"
      style={{ width: extent.width, height: extent.height }}
    >
      {content.boxes.map((box) => (
        <PageBox
          key={box.id}
          box={box}
          autoFocus={box.id === focusId}
          onDocChange={onDocChange}
          onMove={onMove}
          onResize={onResize}
          onRemove={onRemove}
          onLeaveEmpty={onLeaveEmpty}
          onActive={onActive}
          uploadImage={uploadImage}
        />
      ))}
    </div>
  );
}

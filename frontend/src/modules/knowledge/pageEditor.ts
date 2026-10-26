/**
 * The rich-text editor of a page box: Tiptap with exactly the nodes and marks
 * the server accepts (`content.py`). Pasted web images are dropped (only
 * uploaded ones are allowed) and links only ever point at http(s) or mailto.
 */
import type { Extensions } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";

/** Where uploaded images are served; image nodes may only point here. */
export const IMAGE_PREFIX = "/api/knowledge/images/";

const SAFE_HREF = /^(?:https?:\/\/|mailto:)\S+$/i;

/** Whether a link target is safe to store and open (http, https or mailto). */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href.trim());
}

/**
 * The link target for a typed address: https:// is added to a bare address
 * ("example.com/a") and mailto: to an e-mail address. Null when it would not
 * be safe (another scheme, spaces, nothing typed).
 */
export function linkTarget(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  let href = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    href = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(trimmed)
      ? `mailto:${trimmed}`
      : `https://${trimmed}`;
  }
  return isSafeHref(href) ? href : null;
}

/** Whether an image source is one of PlanBox's own uploaded images. */
export function isOwnImage(src: string | null): boolean {
  return src !== null && src.startsWith(IMAGE_PREFIX) && !src.includes("?");
}

/**
 * Images that only parse from PlanBox's own sources. They resize from every
 * side and corner; sides stretch one way, Shift keeps the proportions.
 */
const PageImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) => (isOwnImage(element.getAttribute("src")) ? null : false),
      },
    ];
  },
}).configure({
  resize: {
    enabled: true,
    directions: [
      "top",
      "right",
      "bottom",
      "left",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ],
    minWidth: 32,
    minHeight: 32,
    alwaysPreserveAspectRatio: false,
  },
});

/** The extensions of every box's editor. */
export function pageExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      },
    }),
    Placeholder.configure({ placeholder: "Type here…" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    PageImage,
    Highlight,
  ];
}

/** The image files among dropped or pasted files, in order. */
export function imageFiles(files: FileList | null | undefined): File[] {
  return [...(files ?? [])].filter((file) => IMAGE_TYPES.has(file.type));
}

/** The image types the server stores. */
export const IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

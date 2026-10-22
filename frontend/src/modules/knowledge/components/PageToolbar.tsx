import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  SquareCode,
  SquarePlus,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";

import { IconButton } from "../../../ui/IconButton";
import { IMAGE_TYPES } from "../pageEditor";
import { LinkDialog } from "./LinkDialog";

/** Props for {@link PageToolbar}. */
export interface PageToolbarProps {
  /** The editor of the box with the cursor, or null when none has it. */
  editor: Editor | null;
  /** Adds an empty box in view and puts the cursor into it. */
  onAddBox: () => void;
  /** Adds images: into the box with the cursor, else into a new box in view. */
  onAddImages: (files: File[]) => void;
  /** Adds a table: into the box with the cursor, else into a new box in view. */
  onAddTable: () => void;
}

interface Tool {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  active?: boolean;
  run: () => void;
}

/** Keeps the cursor in the box: toolbar buttons never take the focus from the editor. */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault();
};

/**
 * Formatting for the box with the cursor: marks, headings, lists, links,
 * images and tables (with row and column tools while in one), plus a new box.
 */
export function PageToolbar({ editor, onAddBox, onAddImages, onAddTable }: PageToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      highlight: e?.isActive("highlight") ?? false,
      code: e?.isActive("code") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      paragraph: e?.isActive("paragraph") ?? false,
      bullets: e?.isActive("bulletList") ?? false,
      numbers: e?.isActive("orderedList") ?? false,
      tasks: e?.isActive("taskList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      codeBlock: e?.isActive("codeBlock") ?? false,
      link: e?.isActive("link") ?? false,
      href: (e?.getAttributes("link").href as string | undefined) ?? "",
      table: e?.isActive("table") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  const chain = () => editor?.chain().focus();
  const groups: Tool[][] = [
    [
      {
        label: "Bold",
        icon: Bold,
        shortcut: "Ctrl+B",
        active: state?.bold,
        run: () => chain()?.toggleBold().run(),
      },
      {
        label: "Italic",
        icon: Italic,
        shortcut: "Ctrl+I",
        active: state?.italic,
        run: () => chain()?.toggleItalic().run(),
      },
      {
        label: "Underline",
        icon: Underline,
        shortcut: "Ctrl+U",
        active: state?.underline,
        run: () => chain()?.toggleUnderline().run(),
      },
      {
        label: "Strikethrough",
        icon: Strikethrough,
        active: state?.strike,
        run: () => chain()?.toggleStrike().run(),
      },
      {
        label: "Highlight",
        icon: Highlighter,
        active: state?.highlight,
        run: () => chain()?.toggleHighlight().run(),
      },
      {
        label: "Inline code",
        icon: Code,
        active: state?.code,
        run: () => chain()?.toggleCode().run(),
      },
    ],
    [
      {
        label: "Text",
        icon: Pilcrow,
        active: state?.paragraph,
        run: () => chain()?.setParagraph().run(),
      },
      {
        label: "Heading 1",
        icon: Heading1,
        active: state?.h1,
        run: () => chain()?.toggleHeading({ level: 1 }).run(),
      },
      {
        label: "Heading 2",
        icon: Heading2,
        active: state?.h2,
        run: () => chain()?.toggleHeading({ level: 2 }).run(),
      },
      {
        label: "Heading 3",
        icon: Heading3,
        active: state?.h3,
        run: () => chain()?.toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        label: "Bulleted list",
        icon: List,
        active: state?.bullets,
        run: () => chain()?.toggleBulletList().run(),
      },
      {
        label: "Numbered list",
        icon: ListOrdered,
        active: state?.numbers,
        run: () => chain()?.toggleOrderedList().run(),
      },
      {
        label: "Checklist",
        icon: ListTodo,
        active: state?.tasks,
        run: () => chain()?.toggleTaskList().run(),
      },
      {
        label: "Quote",
        icon: Quote,
        active: state?.quote,
        run: () => chain()?.toggleBlockquote().run(),
      },
      {
        label: "Code block",
        icon: SquareCode,
        active: state?.codeBlock,
        run: () => chain()?.toggleCodeBlock().run(),
      },
    ],
    [
      {
        label: "Link",
        icon: Link2,
        active: state?.link,
        run: () => {
          setLinkOpen(true);
        },
      },
    ],
  ];
  const tableTools: Tool[] = [
    { label: "Add row below", icon: BetweenHorizontalEnd, run: () => chain()?.addRowAfter().run() },
    {
      label: "Add column right",
      icon: BetweenVerticalEnd,
      run: () => chain()?.addColumnAfter().run(),
    },
    { label: "Delete row", icon: Rows3, run: () => chain()?.deleteRow().run() },
    { label: "Delete column", icon: Columns3, run: () => chain()?.deleteColumn().run() },
    { label: "Delete table", icon: Trash2, run: () => chain()?.deleteTable().run() },
  ];

  const button = (tool: Tool, disabled: boolean) => (
    <IconButton
      key={tool.label}
      label={tool.label}
      icon={tool.icon}
      shortcut={tool.shortcut}
      pressed={tool.active ?? false}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={tool.run}
      className="disabled:opacity-40"
    />
  );
  const divider = (key: string) => (
    <span key={key} aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
  );

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex min-h-10 items-center gap-0.5 overflow-x-auto px-2 py-1"
    >
      <IconButton
        label="New text box"
        icon={SquarePlus}
        onMouseDown={keepFocus}
        onClick={onAddBox}
      />
      <IconButton
        label="Add image"
        icon={ImagePlus}
        onMouseDown={keepFocus}
        onClick={() => fileRef.current?.click()}
      />
      <IconButton
        label="Add table"
        icon={Table}
        onMouseDown={keepFocus}
        disabled={state?.table ?? false}
        onClick={onAddTable}
        className="disabled:opacity-40"
      />
      {groups.map((group, index) => [
        divider(`d${String(index)}`),
        ...group.map((tool) => button(tool, editor === null)),
      ])}
      {state?.table === true && [divider("dt"), ...tableTools.map((tool) => button(tool, false))]}
      {divider("du")}
      {button(
        { label: "Undo typing", icon: Undo2, shortcut: "Ctrl+Z", run: () => chain()?.undo().run() },
        !(state?.canUndo ?? false),
      )}
      {button(
        {
          label: "Redo typing",
          icon: Redo2,
          shortcut: "Ctrl+Shift+Z",
          run: () => chain()?.redo().run(),
        },
        !(state?.canRedo ?? false),
      )}
      <input
        ref={fileRef}
        type="file"
        accept={[...IMAGE_TYPES].join(",")}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) onAddImages(files);
        }}
      />
      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        initial={state?.href ?? ""}
        onSubmit={(href) => {
          chain()?.extendMarkRange("link").setLink({ href }).run();
        }}
        onRemove={() => {
          chain()?.extendMarkRange("link").unsetLink().run();
        }}
      />
    </div>
  );
}

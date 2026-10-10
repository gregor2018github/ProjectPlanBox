import {
  ArrowLeftToLine,
  ArrowRightToLine,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Check,
  FolderInput,
  PanelRightOpen,
  RotateCcw,
  SkipForward,
  Sun,
  Trash2,
} from "lucide-react";

import type { MenuEntry } from "../../ui/menuTypes";
import { PRIORITY_LABELS, type Priority, type Todo } from "./types";
import type { TodoActions } from "./useTodoActions";

/** The actions offered for a todo (row ⋯ button, right-click, long-press). */
export function todoMenuEntries(todo: Todo, actions: TodoActions): MenuEntry[] {
  const dates = actions.quickDates();
  const done = todo.completed_at !== null;
  const priorities: Priority[] = [3, 2, 1, 0];
  return [
    {
      id: "open",
      label: "Open details",
      icon: PanelRightOpen,
      shortcut: "Enter",
      onSelect: () => {
        actions.open(todo);
      },
    },
    {
      id: "complete",
      label: done ? "Reopen" : "Complete",
      icon: done ? RotateCcw : Check,
      shortcut: "X",
      onSelect: () => {
        actions.toggleComplete(todo);
      },
    },
    ...(todo.rrule === null || done
      ? []
      : [
          {
            id: "skip",
            label: "Skip this one",
            icon: SkipForward,
            shortcut: "S",
            onSelect: () => {
              actions.skip(todo);
            },
          },
        ]),
    { kind: "separator", id: "s1" },
    ...(dates === null
      ? []
      : [
          {
            id: "today",
            label: "Due today",
            icon: Sun,
            shortcut: "T",
            onSelect: () => {
              actions.setDue(todo, dates.today);
            },
          },
          {
            id: "tomorrow",
            label: "Due tomorrow",
            icon: CalendarDays,
            shortcut: "M",
            onSelect: () => {
              actions.setDue(todo, dates.tomorrow);
            },
          },
        ]),
    {
      id: "pick",
      label: "Pick a date…",
      icon: CalendarClock,
      shortcut: "D",
      onSelect: () => {
        actions.open(todo, "due");
      },
    },
    ...(todo.due_date === null
      ? []
      : [
          {
            id: "clear",
            label: "Remove date",
            icon: CalendarX,
            onSelect: () => {
              actions.setDue(todo, null);
            },
          },
        ]),
    { kind: "separator", id: "s2" },
    ...priorities.map((p) => ({
      id: `p${p}`,
      label: p === 0 ? "No priority" : `${PRIORITY_LABELS[p]} priority`,
      shortcut: String(p === 0 ? 0 : 4 - p),
      checked: todo.priority === p,
      onSelect: () => {
        actions.setPriority(todo, p);
      },
    })),
    { kind: "separator", id: "s3" },
    {
      id: "move",
      label: "Move to…",
      icon: FolderInput,
      shortcut: "V",
      onSelect: () => {
        actions.open(todo, "place");
      },
    },
    todo.parent_id === null
      ? {
          id: "indent",
          label: "Make subtask",
          icon: ArrowRightToLine,
          shortcut: "Alt+ArrowRight",
          onSelect: () => {
            actions.indent(todo);
          },
        }
      : {
          id: "outdent",
          label: "Promote to todo",
          icon: ArrowLeftToLine,
          shortcut: "Alt+ArrowLeft",
          onSelect: () => {
            actions.outdent(todo);
          },
        },
    { kind: "separator", id: "s4" },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      shortcut: "Delete",
      danger: true,
      onSelect: () => {
        actions.remove(todo);
      },
    },
  ];
}

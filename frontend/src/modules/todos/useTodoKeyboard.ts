import { useShortcut } from "../../core/shortcuts/useShortcut";
import type { Todo } from "./types";
import { todoUi, useTodoUi } from "./uiStore";
import type { TodoActions } from "./useTodoActions";

const GROUP = "Todos";

/**
 * Keyboard control of a todos view. `visible` is the on-screen order
 * (including expanded subtasks); `reorder` enables Alt+↑/↓ where the order
 * is manual, moving among list siblings unless the view passes its own `shift`.
 */
export function useTodoKeyboard(
  visible: readonly Todo[],
  actions: TodoActions,
  { reorder, shift }: { reorder: boolean; shift?: (todo: Todo, direction: -1 | 1) => void },
): void {
  const move = (t: Todo, direction: -1 | 1) => {
    if (shift) shift(t, direction);
    else actions.shift(t, direction);
  };
  const selectedId = useTodoUi((s) => s.selectedId);
  const selected = visible.find((t) => t.id === selectedId) ?? null;

  const step = (delta: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((t) => t.id === selectedId);
    const next =
      index === -1
        ? delta === 1
          ? visible[0]
          : visible.at(-1)
        : visible[Math.min(Math.max(index + delta, 0), visible.length - 1)];
    if (next) todoUi.select(next.id);
  };
  const withSelected = (fn: (todo: Todo) => void) => () => {
    if (selected) fn(selected);
  };
  const dates = actions.quickDates();

  useShortcut({
    id: "todos.next",
    keys: "ArrowDown",
    description: "Select next",
    group: GROUP,
    run: () => {
      step(1);
    },
  });
  useShortcut({
    id: "todos.prev",
    keys: "ArrowUp",
    description: "Select previous",
    group: GROUP,
    run: () => {
      step(-1);
    },
  });
  useShortcut({
    id: "todos.next.j",
    keys: "J",
    description: "Select next",
    group: GROUP,
    hidden: true,
    run: () => {
      step(1);
    },
  });
  useShortcut({
    id: "todos.prev.k",
    keys: "K",
    description: "Select previous",
    group: GROUP,
    hidden: true,
    run: () => {
      step(-1);
    },
  });
  useShortcut({
    id: "todos.open",
    keys: "Enter",
    description: "Open details",
    group: GROUP,
    skipOnInteractive: true,
    run: withSelected((t) => {
      actions.open(t);
    }),
  });
  useShortcut({
    id: "todos.complete",
    keys: "X",
    description: "Complete / reopen",
    group: GROUP,
    run: withSelected((t) => {
      actions.toggleComplete(t);
    }),
  });
  useShortcut({
    id: "todos.complete.space",
    keys: "Space",
    description: "Complete / reopen",
    group: GROUP,
    hidden: true,
    skipOnInteractive: true,
    run: withSelected((t) => {
      actions.toggleComplete(t);
    }),
  });
  useShortcut(
    reorder
      ? {
          id: "todos.up",
          keys: "Alt+ArrowUp",
          description: "Move up",
          group: GROUP,
          run: withSelected((t) => {
            move(t, -1);
          }),
        }
      : null,
  );
  useShortcut(
    reorder
      ? {
          id: "todos.down",
          keys: "Alt+ArrowDown",
          description: "Move down",
          group: GROUP,
          run: withSelected((t) => {
            move(t, 1);
          }),
        }
      : null,
  );
  useShortcut({
    id: "todos.indent",
    keys: "Alt+ArrowRight",
    description: "Make subtask of the todo above",
    group: GROUP,
    run: withSelected((t) => {
      actions.indent(t);
    }),
  });
  useShortcut({
    id: "todos.outdent",
    keys: "Alt+ArrowLeft",
    description: "Promote subtask",
    group: GROUP,
    run: withSelected((t) => {
      actions.outdent(t);
    }),
  });
  useShortcut({
    id: "todos.expand",
    keys: "ArrowRight",
    description: "Show subtasks",
    group: GROUP,
    run: withSelected((t) => {
      todoUi.toggleExpanded(t.id, true);
    }),
  });
  useShortcut({
    id: "todos.collapse",
    keys: "ArrowLeft",
    description: "Hide subtasks",
    group: GROUP,
    run: withSelected((t) => {
      if (t.parent_id !== null) todoUi.select(t.parent_id);
      todoUi.toggleExpanded(t.parent_id ?? t.id, false);
    }),
  });
  const setPriority = (priority: number) =>
    withSelected((t) => {
      actions.setPriority(t, priority);
    });
  usePriorityShortcut("1", "High priority", setPriority(3));
  usePriorityShortcut("2", "Medium priority", setPriority(2));
  usePriorityShortcut("3", "Low priority", setPriority(1));
  usePriorityShortcut("0", "No priority", setPriority(0));
  useShortcut({
    id: "todos.today",
    keys: "T",
    description: "Due today",
    group: GROUP,
    run: withSelected((t) => {
      if (dates) actions.setDue(t, dates.today);
    }),
  });
  useShortcut({
    id: "todos.tomorrow",
    keys: "M",
    description: "Due tomorrow",
    group: GROUP,
    run: withSelected((t) => {
      if (dates) actions.setDue(t, dates.tomorrow);
    }),
  });
  useShortcut({
    id: "todos.date",
    keys: "D",
    description: "Pick a date",
    group: GROUP,
    run: withSelected((t) => {
      actions.open(t, "due");
    }),
  });
  useShortcut({
    id: "todos.skip",
    keys: "S",
    description: "Skip this repeat (next date, not done)",
    group: GROUP,
    run: withSelected((t) => {
      actions.skip(t);
    }),
  });
  useShortcut({
    id: "todos.move",
    keys: "V",
    description: "Move to list or section",
    group: GROUP,
    run: withSelected((t) => {
      actions.open(t, "place");
    }),
  });
  useShortcut({
    id: "todos.delete",
    keys: "Delete",
    description: "Delete (undo with Ctrl+Z)",
    group: GROUP,
    run: withSelected((t) => {
      actions.remove(t);
    }),
  });
  useShortcut({
    id: "todos.deselect",
    keys: "Escape",
    description: "Clear selection",
    group: GROUP,
    hidden: true,
    run: () => {
      todoUi.select(null);
    },
  });
}

function usePriorityShortcut(key: string, description: string, run: () => void): void {
  useShortcut({ id: `todos.priority.${key}`, keys: key, description, group: GROUP, run });
}

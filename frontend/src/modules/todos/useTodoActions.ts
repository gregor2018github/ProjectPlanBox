/**
 * What the user can do to todos, in their words: each action applies the
 * optimistic mutation and records how to undo it (toast for deletes, Ctrl+Z
 * for everything).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { newTagVars, useCreateTag } from "../../core/tags/tagQueries";
import { addDays, formatRelativeDay, isoWeekday } from "../../core/time";
import { useToday } from "../../core/useToday";
import { useUndo } from "../../core/undo/undoContext";
import { newId } from "../../core/ids";
import { useToast } from "../../ui/useToast";
import { siblingsOf, type CreateTodoVars, type TodoPatch } from "./apply";
import {
  useCreateTodo,
  useDeleteTodo,
  useMoveTodo,
  useRestoreTodo,
  useSetCompleted,
  useSetTodayOrder,
  useSkipTodo,
  useUpdateTodo,
} from "./mutations";
import { todoKeys } from "./queries";
import type { Placement, RepeatFrom, Todo } from "./types";
import { todoUi } from "./uiStore";

/** Input for creating a todo; tags named in `new_tags` are created first. */
export type NewTodoInput = Omit<CreateTodoVars, "id"> & { new_tags?: string[] };

/** The entity reference used in the `?item=` search param. */
export function todoItemRef(id: string): string {
  return `todos.todo:${id}`;
}

/** Returns the todo actions bound to the current caches. */
export function useTodoActions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushUndo = useUndo();
  const today = useToday();
  const createTodo = useCreateTodo();
  const createTag = useCreateTag();
  const updateTodo = useUpdateTodo();
  const setCompleted = useSetCompleted();
  const skipTodo = useSkipTodo();
  const moveTodo = useMoveTodo();
  const setTodayOrder = useSetTodayOrder();
  const deleteTodo = useDeleteTodo();
  const restoreTodo = useRestoreTodo();
  const { show } = useToast();

  return useMemo(() => {
    const cache = () => queryClient.getQueryData<Todo[]>(todoKeys.items) ?? [];
    const find = (id: string) => cache().find((t) => t.id === id);
    const placementOf = (t: Todo): Placement => ({
      list_id: t.list_id,
      section_id: t.section_id,
      parent_id: t.parent_id,
    });

    /** Neighbours of a todo in its current container, to move it back on undo. */
    const neighbours = (t: Todo) => {
      const siblings = siblingsOf(cache(), placementOf(t));
      const i = siblings.findIndex((s) => s.id === t.id);
      return { after_id: siblings[i - 1]?.id ?? null, before_id: siblings[i + 1]?.id ?? null };
    };

    const move = (
      t: Todo,
      target: Placement,
      before_id: string | null,
      after_id: string | null,
    ) => {
      const back = { target: placementOf(t), ...neighbours(t) };
      moveTodo.mutate({ id: t.id, target, before_id, after_id });
      pushUndo({
        label: `Moved “${t.title}”`,
        silent: true,
        undo: () => {
          moveTodo.mutate({ id: t.id, ...back });
        },
      });
    };

    return {
      /** Creates a todo; returns its id immediately (optimistic). */
      create(input: NewTodoInput): string {
        const id = newId();
        const { new_tags = [], ...rest } = input;
        const tagVars = new_tags.map(newTagVars);
        const vars: CreateTodoVars = {
          ...rest,
          id,
          tag_ids: [...(rest.tag_ids ?? []), ...tagVars.map((t) => t.id)],
        };
        if (tagVars.length === 0) {
          createTodo.mutate(vars);
        } else {
          void Promise.all(tagVars.map((t) => createTag.mutateAsync(t))).then(() => {
            createTodo.mutate(vars);
          });
        }
        return id;
      },

      update(id: string, patch: TodoPatch): void {
        updateTodo.mutate({ id, patch });
      },

      toggleComplete(t: Todo): void {
        const completing = t.completed_at === null;
        if (completing) todoUi.linger(t.id);
        setCompleted.mutate(
          { id: t.id, completed: completing },
          {
            onSuccess: (changed) => {
              const next = changed.find((c) => c.id !== t.id && c.parent_id === null);
              if (!completing || next?.due_date == null || today === null) return;
              show({
                title: next.title,
                description: `Repeats. Next one: ${formatRelativeDay(next.due_date, today)}`,
              });
            },
          },
        );
        pushUndo({
          label: completing ? `Completed “${t.title}”` : `Reopened “${t.title}”`,
          silent: true,
          undo: () => {
            setCompleted.mutate({ id: t.id, completed: !completing });
          },
        });
      },

      setDue(t: Todo, due: string | null): void {
        const before = t.due_date;
        updateTodo.mutate({ id: t.id, patch: { due_date: due } });
        pushUndo({
          label: "Changed the date",
          silent: true,
          undo: () => {
            updateTodo.mutate({ id: t.id, patch: { due_date: before } });
          },
        });
      },

      /** Today, tomorrow, next Monday, in a week (null until the timezone is known). */
      quickDates() {
        if (today === null) return null;
        return {
          today,
          tomorrow: addDays(today, 1),
          nextMonday: addDays(today, 8 - isoWeekday(today)),
          nextWeek: addDays(today, 7),
        };
      },

      /**
       * Starts, changes or (with null) stops a todo's repeat, counted from
       * the schedule or from completion.
       */
      setRepeat(t: Todo, rrule: string | null, repeatFrom: RepeatFrom = "due"): void {
        const before: TodoPatch = {
          rrule: t.rrule,
          due_date: t.due_date,
          ...(t.rrule !== null && { repeat_from: t.repeat_from }),
        };
        const modeChanged = rrule !== null && repeatFrom !== t.repeat_from;
        updateTodo.mutate({
          id: t.id,
          patch: modeChanged ? { rrule, repeat_from: repeatFrom } : { rrule },
        });
        pushUndo({
          label: rrule === null ? "Stopped repeating" : "Changed the repeat",
          silent: true,
          undo: () => {
            updateTodo.mutate({ id: t.id, patch: before });
          },
        });
      },

      /** Moves an open repeating todo to its next date without completing it. */
      skip(t: Todo): void {
        if (t.rrule === null || t.completed_at !== null) return;
        const before = t.due_date;
        skipTodo.mutate(
          { id: t.id },
          {
            onSuccess: (skipped) => {
              if (skipped.due_date === null || today === null) return;
              show({
                title: `Skipped “${t.title}”`,
                description: `Next one: ${formatRelativeDay(skipped.due_date, today)}`,
              });
            },
          },
        );
        pushUndo({
          label: `Skipped “${t.title}”`,
          silent: true,
          undo: () => {
            updateTodo.mutate({ id: t.id, patch: { due_date: before } });
          },
        });
      },

      setPriority(t: Todo, priority: number): void {
        updateTodo.mutate({ id: t.id, patch: { priority } });
      },

      remove(t: Todo): void {
        const subtasks = cache().filter((c) => c.parent_id === t.id).length;
        deleteTodo.mutate({ id: t.id });
        if (todoUi.get().selectedId === t.id) todoUi.select(null);
        pushUndo({
          label:
            subtasks > 0
              ? `Deleted “${t.title}” and ${subtasks} subtask${subtasks === 1 ? "" : "s"}`
              : `Deleted “${t.title}”`,
          undo: () => {
            restoreTodo.mutate({ id: t.id });
          },
        });
      },

      move,

      /**
       * Stores a new order for one group in Today; `before` is the order it
       * replaces (what undo goes back to).
       */
      reorderToday(ids: string[], before: readonly string[]): void {
        setTodayOrder.mutate({ ids });
        pushUndo({
          label: "Reordered Today",
          silent: true,
          undo: () => {
            setTodayOrder.mutate({ ids: [...before] });
          },
        });
      },

      /** Places a todo at the end of another container (top level). */
      moveTo(t: Todo, target: Omit<Placement, "parent_id">): void {
        move(t, { ...target, parent_id: null }, null, null);
      },

      /** Swaps a todo with its previous (-1) or next (+1) sibling. */
      shift(t: Todo, direction: -1 | 1): void {
        const siblings = siblingsOf(cache(), placementOf(t));
        const i = siblings.findIndex((s) => s.id === t.id);
        const target = siblings[i + direction];
        if (i === -1 || target === undefined) return;
        if (direction === -1) {
          move(t, placementOf(t), target.id, siblings[i - 2]?.id ?? null);
        } else {
          move(t, placementOf(t), siblings[i + 2]?.id ?? null, target.id);
        }
      },

      /** Makes a top-level todo a subtask of the open sibling above it. */
      indent(t: Todo): boolean {
        if (t.parent_id !== null || cache().some((c) => c.parent_id === t.id)) return false;
        const siblings = siblingsOf(cache(), placementOf(t));
        const i = siblings.findIndex((s) => s.id === t.id);
        const parent = siblings
          .slice(0, Math.max(i, 0))
          .reverse()
          .find((s) => s.completed_at === null);
        if (parent === undefined) return false;
        move(t, { list_id: t.list_id, section_id: t.section_id, parent_id: parent.id }, null, null);
        todoUi.toggleExpanded(parent.id, true);
        return true;
      },

      /** Promotes a subtask to a todo right after its parent. */
      outdent(t: Todo): boolean {
        const parent = t.parent_id === null ? undefined : find(t.parent_id);
        if (parent === undefined) return false;
        const after = neighbours(parent);
        move(t, placementOf(parent), after.before_id, parent.id);
        return true;
      },

      /** Opens the todo in the detail panel (optionally with a picker open). */
      open(t: Todo, picker: "due" | "place" | null = null): void {
        todoUi.select(t.id);
        todoUi.requestPicker(picker);
        void navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, item: todoItemRef(t.id) }),
        });
      },
    };
  }, [
    queryClient,
    navigate,
    pushUndo,
    today,
    createTodo,
    createTag,
    updateTodo,
    setCompleted,
    skipTodo,
    moveTodo,
    setTodayOrder,
    deleteTodo,
    restoreTodo,
    show,
  ]);
}

/** The bound actions object. */
export type TodoActions = ReturnType<typeof useTodoActions>;

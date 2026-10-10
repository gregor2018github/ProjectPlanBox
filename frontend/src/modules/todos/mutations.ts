/**
 * Optimistic mutations (ARCHITECTURE §8). Every mutation of this module runs
 * in one serial scope, applies its change to the cache immediately, rolls
 * back and shows a toast on error, and writes the server's rows back on
 * success. User-facing wording and undo live in `useTodoActions`.
 */
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { useApiClient } from "../../core/api/apiContext";
import { unwrap } from "../../core/api/client";
import { byPosition, placeAmong } from "../../core/ordering";
import { useToast } from "../../ui/useToast";
import {
  applyComplete,
  applyDelete,
  applyMove,
  applyPatch,
  applyReopen,
  applyTodayOrder,
  buildTodo,
  mergeTodos,
  type CreateTodoVars,
  type TodoPatch,
} from "./apply";
import { todoKeys } from "./queries";
import type { Area, Placement, Section, Todo, TodoList } from "./types";

const SCOPE = { id: "todos" };

interface OptimisticConfig<TCache, TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** The cache patched optimistically. */
  cacheKey: QueryKey;
  apply: (current: TCache, vars: TVars) => TCache;
  /** Extra caches touched optimistically (e.g. removing a list's todos). */
  alsoApply?: (vars: TVars, set: <T>(key: QueryKey, fn: (current: T) => T) => void) => void;
  onSuccess?: (data: TData, vars: TVars) => void;
  errorTitle: string;
}

function useOptimisticMutation<TCache, TVars, TData>(
  config: OptimisticConfig<TCache, TVars, TData>,
) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: config.mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.all });
      const snapshot = queryClient.getQueriesData({ queryKey: todoKeys.all });
      queryClient.setQueryData<TCache>(config.cacheKey, (current) =>
        current === undefined ? current : config.apply(current, vars),
      );
      config.alsoApply?.(vars, (key, fn) => {
        queryClient.setQueryData(key, (current: unknown) =>
          current === undefined ? current : fn(current as never),
        );
      });
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      show({ title: config.errorTitle, description: error.message, tone: "error" });
    },
    onSuccess: (data, vars) => {
      config.onSuccess?.(data, vars);
      void queryClient.invalidateQueries({ queryKey: todoKeys.forecasts });
    },
  });
}

const now = () => new Date().toISOString();

/** Writes server rows into the todo cache. */
function useMergeTodos() {
  const queryClient = useQueryClient();
  return (todos: Todo[]) => {
    queryClient.setQueryData<Todo[]>(todoKeys.items, (current = []) => mergeTodos(current, todos));
  };
}

/** Refetches everything of this module (after restores, which bring back unknown rows). */
function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: todoKeys.all });
}

// ---------------------------------------------------------------------- todos

/** Creates a todo or subtask. */
export function useCreateTodo() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], CreateTodoVars, Todo>({
    cacheKey: todoKeys.items,
    mutationFn: (vars) => unwrap(client.POST("/api/todos/items", { body: vars })),
    apply: (todos, vars) => [...todos, buildTodo(todos, vars, now())],
    onSuccess: (todo) => {
      merge([todo]);
    },
    errorTitle: "Could not add the todo",
  });
}

/** Changes title, notes, priority, due date or tags. */
export function useUpdateTodo() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], { id: string; patch: TodoPatch }, Todo>({
    cacheKey: todoKeys.items,
    mutationFn: ({ id, patch }) =>
      unwrap(
        client.PATCH("/api/todos/items/{todo_id}", {
          params: { path: { todo_id: id } },
          body: patch,
        }),
      ),
    apply: (todos, { id, patch }) => applyPatch(todos, id, patch, now()),
    onSuccess: (todo) => {
      merge([todo]);
    },
    errorTitle: "Could not save the change",
  });
}

/**
 * Completes or reopens a todo (with the server's cascade rules). Completing a
 * repeating todo returns its next occurrence too; reopening one deletes that
 * occurrence on the server, so the list is refetched.
 */
export function useSetCompleted() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], { id: string; completed: boolean }, Todo[]>({
    cacheKey: todoKeys.items,
    mutationFn: async ({ id, completed }) => {
      const path = { params: { path: { todo_id: id } } };
      const result = completed
        ? await unwrap(client.POST("/api/todos/items/{todo_id}/complete", path))
        : await unwrap(client.POST("/api/todos/items/{todo_id}/reopen", path));
      return result.todos;
    },
    apply: (todos, { id, completed }) =>
      completed ? applyComplete(todos, id, now()) : applyReopen(todos, id, now()),
    onSuccess: (todos, { completed }) => {
      merge(todos);
      void queryClient.invalidateQueries({ queryKey: todoKeys.logbook });
      if (!completed && todos.some((t) => t.rrule !== null)) {
        void queryClient.invalidateQueries({ queryKey: todoKeys.items });
      }
    },
    errorTitle: "Could not update the todo",
  });
}

/**
 * Moves an open repeating todo to its next date without completing it. Only
 * the server knows that date, so nothing changes until it answers.
 */
export function useSkipTodo() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], { id: string }, Todo>({
    cacheKey: todoKeys.items,
    mutationFn: ({ id }) =>
      unwrap(client.POST("/api/todos/items/{todo_id}/skip", { params: { path: { todo_id: id } } })),
    apply: (todos) => [...todos],
    onSuccess: (todo) => {
      merge([todo]);
    },
    errorTitle: "Could not skip it",
  });
}

/** Variables for moving a todo. */
export interface MoveTodoVars {
  id: string;
  target: Placement;
  before_id: string | null;
  after_id: string | null;
}

/** Reorders, re-homes, indents or outdents a todo. */
export function useMoveTodo() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], MoveTodoVars, Todo[]>({
    cacheKey: todoKeys.items,
    mutationFn: async ({ id, target, before_id, after_id }) =>
      (
        await unwrap(
          client.POST("/api/todos/items/{todo_id}/move", {
            params: { path: { todo_id: id } },
            body: { ...target, before_id, after_id },
          }),
        )
      ).todos,
    apply: (todos, v) => applyMove(todos, v.id, v.target, v.before_id, v.after_id, now()),
    onSuccess: (todos) => {
      merge(todos);
    },
    errorTitle: "Could not move the todo",
  });
}

/** Stores the manual order of one group in Today (the ids top to bottom). */
export function useSetTodayOrder() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], { ids: string[] }, Todo[]>({
    cacheKey: todoKeys.items,
    mutationFn: async ({ ids }) =>
      (await unwrap(client.POST("/api/todos/today-order", { body: { ids } }))).todos,
    apply: (todos, { ids }) => applyTodayOrder(todos, ids, now()),
    onSuccess: (todos) => {
      merge(todos);
    },
    errorTitle: "Could not reorder Today",
  });
}

/** Deletes a todo with its subtasks. */
export function useDeleteTodo() {
  const client = useApiClient();
  return useOptimisticMutation<Todo[], { id: string }, unknown>({
    cacheKey: todoKeys.items,
    mutationFn: ({ id }) =>
      unwrap(client.DELETE("/api/todos/items/{todo_id}", { params: { path: { todo_id: id } } })),
    apply: (todos, { id }) => applyDelete(todos, id),
    errorTitle: "Could not delete the todo",
  });
}

/** Restores a deleted todo (and its subtasks). */
export function useRestoreTodo() {
  const client = useApiClient();
  const merge = useMergeTodos();
  return useOptimisticMutation<Todo[], { id: string }, Todo[]>({
    cacheKey: todoKeys.items,
    mutationFn: async ({ id }) =>
      (
        await unwrap(
          client.POST("/api/todos/items/{todo_id}/restore", { params: { path: { todo_id: id } } }),
        )
      ).todos,
    apply: (todos) => todos,
    onSuccess: (todos) => {
      merge(todos);
    },
    errorTitle: "Could not restore the todo",
  });
}

// ----------------------------------------------------------------- containers

const stamp = () => {
  const at = now();
  return { created_at: at, updated_at: at };
};

/** Creates an area at the end. */
export function useCreateArea() {
  const client = useApiClient();
  return useOptimisticMutation<Area[], { id: string; name: string }, Area>({
    cacheKey: todoKeys.areas,
    mutationFn: (vars) => unwrap(client.POST("/api/todos/areas", { body: vars })),
    apply: (areas, vars) => [
      ...areas,
      { ...vars, position: placeAmong([...areas].sort(byPosition), null, null), ...stamp() },
    ],
    errorTitle: "Could not add the area",
  });
}

/** Creates a list at the end of its area. */
export function useCreateList() {
  const client = useApiClient();
  return useOptimisticMutation<
    TodoList[],
    { id: string; name: string; area_id: string | null },
    TodoList
  >({
    cacheKey: todoKeys.lists,
    mutationFn: (vars) => unwrap(client.POST("/api/todos/lists", { body: vars })),
    apply: (lists, vars) => [
      ...lists,
      {
        ...vars,
        position: placeAmong(
          lists.filter((l) => l.area_id === vars.area_id).sort(byPosition),
          null,
          null,
        ),
        ...stamp(),
      },
    ],
    errorTitle: "Could not add the list",
  });
}

/** Creates a section at the end of a list. */
export function useCreateSection() {
  const client = useApiClient();
  return useOptimisticMutation<Section[], { id: string; name: string; list_id: string }, Section>({
    cacheKey: todoKeys.sections,
    mutationFn: (vars) => unwrap(client.POST("/api/todos/sections", { body: vars })),
    apply: (sections, vars) => [
      ...sections,
      {
        ...vars,
        position: placeAmong(
          sections.filter((s) => s.list_id === vars.list_id).sort(byPosition),
          null,
          null,
        ),
        ...stamp(),
      },
    ],
    errorTitle: "Could not add the section",
  });
}

/** Which container a rename/move/delete targets. */
export type ContainerKind = "area" | "list" | "section";

/** Renames an area, list or section. */
export function useRenameContainer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: async ({ kind, id, name }: { kind: ContainerKind; id: string; name: string }) => {
      const body = { name };
      if (kind === "area") {
        return unwrap(
          client.PATCH("/api/todos/areas/{area_id}", { params: { path: { area_id: id } }, body }),
        );
      }
      if (kind === "list") {
        return unwrap(
          client.PATCH("/api/todos/lists/{list_id}", { params: { path: { list_id: id } }, body }),
        );
      }
      return unwrap(
        client.PATCH("/api/todos/sections/{section_id}", {
          params: { path: { section_id: id } },
          body,
        }),
      );
    },
    onMutate: ({ kind, id, name }) => {
      queryClient.setQueryData<{ id: string; name: string }[]>(containerKey(kind), (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, name } : r)),
      );
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      show({ title: "Could not rename", description: error.message, tone: "error" });
    },
  });
}

function containerKey(kind: ContainerKind): QueryKey {
  return kind === "area" ? todoKeys.areas : kind === "list" ? todoKeys.lists : todoKeys.sections;
}

/** Moves a list (between areas) or section (between lists), or reorders an area. */
export interface MoveContainerVars {
  kind: ContainerKind;
  id: string;
  /** The new parent: area id for lists (null = no area), list id for sections; ignored for areas. */
  parent_id: string | null;
  before_id: string | null;
  after_id: string | null;
}

/** Reorders areas, lists and sections with the same optimistic placement as todos. */
export function useMoveContainer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const refreshAll = useRefreshAll();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ kind, id, parent_id, before_id, after_id }: MoveContainerVars) => {
      if (kind === "area") {
        return unwrap(
          client.POST("/api/todos/areas/{area_id}/move", {
            params: { path: { area_id: id } },
            body: { before_id, after_id },
          }),
        );
      }
      if (kind === "list") {
        return unwrap(
          client.POST("/api/todos/lists/{list_id}/move", {
            params: { path: { list_id: id } },
            body: { area_id: parent_id, before_id, after_id },
          }),
        );
      }
      return unwrap(
        client.POST("/api/todos/sections/{section_id}/move", {
          params: { path: { section_id: id } },
          body: { list_id: parent_id ?? "", before_id, after_id },
        }),
      );
    },
    onMutate: (vars) => {
      const parentField =
        vars.kind === "list" ? "area_id" : vars.kind === "section" ? "list_id" : null;
      queryClient.setQueryData<(Area | TodoList | Section)[]>(containerKey(vars.kind), (rows) => {
        if (!rows) return rows;
        const siblings = rows
          .filter(
            (r) =>
              r.id !== vars.id &&
              (parentField === null ||
                (r as unknown as Record<string, unknown>)[parentField] === vars.parent_id),
          )
          .sort(byPosition);
        const position = placeAmong(siblings, vars.before_id, vars.after_id);
        return rows.map((r) =>
          r.id === vars.id
            ? { ...r, position, ...(parentField !== null && { [parentField]: vars.parent_id }) }
            : r,
        );
      });
    },
    onError: (error) => {
      void refreshAll();
      show({ title: "Could not move", description: error.message, tone: "error" });
    },
    onSuccess: (_data, vars) => {
      // A section changing list takes its todos along on the server.
      if (vars.kind === "section") void refreshAll();
    },
  });
}

/** Deletes an area, list or section with everything inside. */
export function useDeleteContainer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const refreshAll = useRefreshAll();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ kind, id }: { kind: ContainerKind; id: string }) => {
      if (kind === "area") {
        return unwrap(
          client.DELETE("/api/todos/areas/{area_id}", { params: { path: { area_id: id } } }),
        );
      }
      if (kind === "list") {
        return unwrap(
          client.DELETE("/api/todos/lists/{list_id}", { params: { path: { list_id: id } } }),
        );
      }
      return unwrap(
        client.DELETE("/api/todos/sections/{section_id}", { params: { path: { section_id: id } } }),
      );
    },
    onMutate: async ({ kind, id }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.all });
      const lists = queryClient.getQueryData<TodoList[]>(todoKeys.lists) ?? [];
      const listIds = new Set(
        kind === "area"
          ? lists.filter((l) => l.area_id === id).map((l) => l.id)
          : kind === "list"
            ? [id]
            : [],
      );
      if (kind === "area") {
        queryClient.setQueryData<Area[]>(todoKeys.areas, (rows) =>
          rows?.filter((a) => a.id !== id),
        );
      }
      queryClient.setQueryData<TodoList[]>(todoKeys.lists, (rows) =>
        rows?.filter((l) => !listIds.has(l.id)),
      );
      queryClient.setQueryData<Section[]>(todoKeys.sections, (rows) =>
        rows?.filter((s) => !listIds.has(s.list_id) && !(kind === "section" && s.id === id)),
      );
      queryClient.setQueryData<Todo[]>(todoKeys.items, (rows) =>
        rows?.filter(
          (t) =>
            !(t.list_id !== null && listIds.has(t.list_id)) &&
            !(kind === "section" && t.section_id === id),
        ),
      );
    },
    onError: (error) => {
      void refreshAll();
      show({ title: "Could not delete", description: error.message, tone: "error" });
    },
  });
}

/** Restores a deleted area, list or section (then refetches everything). */
export function useRestoreContainer() {
  const client = useApiClient();
  const refreshAll = useRefreshAll();
  const { show } = useToast();
  return useMutation({
    scope: SCOPE,
    mutationFn: ({ kind, id }: { kind: ContainerKind; id: string }) => {
      if (kind === "area") {
        return unwrap(
          client.POST("/api/todos/areas/{area_id}/restore", { params: { path: { area_id: id } } }),
        );
      }
      if (kind === "list") {
        return unwrap(
          client.POST("/api/todos/lists/{list_id}/restore", { params: { path: { list_id: id } } }),
        );
      }
      return unwrap(
        client.POST("/api/todos/sections/{section_id}/restore", {
          params: { path: { section_id: id } },
        }),
      );
    },
    onSettled: () => refreshAll(),
    onError: (error) => {
      show({ title: "Could not restore", description: error.message, tone: "error" });
    },
  });
}

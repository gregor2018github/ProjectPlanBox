import { useMemo } from "react";

import { useTags, type Tag } from "../../core/tags/tagQueries";
import type { IsoDate } from "../../core/time";
import { useToday } from "../../core/useToday";
import type { ParseContext } from "./quickAddParser";
import { useAreas, useLists, useSections, useTodos } from "./queries";
import type { Area, Section, Todo, TodoList } from "./types";

/** Name lookups rows need (list, section, tag and parent titles). */
export interface TodoLookup {
  listName: (id: string | null) => string;
  sectionName: (id: string | null) => string | null;
  tagName: (id: string) => string;
  todoTitle: (id: string | null) => string | null;
}

/** Everything a todos view reads, from the shared caches. */
export interface TodoData {
  todos: Todo[];
  areas: Area[];
  lists: TodoList[];
  sections: Section[];
  tags: Tag[];
  today: IsoDate | null;
  /** True until the todos have loaded the first time. */
  loading: boolean;
  lookup: TodoLookup;
  parseContext: ParseContext | null;
}

const EMPTY: never[] = [];

/** Subscribes to all todo caches and derives lookups. */
export function useTodoData(): TodoData {
  const todos = useTodos();
  const areas = useAreas();
  const lists = useLists();
  const sections = useSections();
  const tags = useTags();
  const today = useToday();

  return useMemo(() => {
    const listById = new Map((lists.data ?? EMPTY).map((l: TodoList) => [l.id, l]));
    const sectionById = new Map((sections.data ?? EMPTY).map((s: Section) => [s.id, s]));
    const tagById = new Map((tags.data ?? EMPTY).map((t: Tag) => [t.id, t]));
    const todoById = new Map((todos.data ?? EMPTY).map((t: Todo) => [t.id, t]));
    const data: TodoData = {
      todos: todos.data ?? EMPTY,
      areas: areas.data ?? EMPTY,
      lists: lists.data ?? EMPTY,
      sections: sections.data ?? EMPTY,
      tags: tags.data ?? EMPTY,
      today,
      loading: todos.isPending,
      lookup: {
        listName: (id) => (id === null ? "Inbox" : (listById.get(id)?.name ?? "…")),
        sectionName: (id) => (id === null ? null : (sectionById.get(id)?.name ?? null)),
        tagName: (id) => tagById.get(id)?.name ?? "…",
        todoTitle: (id) => (id === null ? null : (todoById.get(id)?.title ?? null)),
      },
      parseContext:
        today === null
          ? null
          : {
              today,
              lists: lists.data ?? EMPTY,
              sections: sections.data ?? EMPTY,
              tags: tags.data ?? EMPTY,
            },
    };
    return data;
  }, [todos.data, todos.isPending, areas.data, lists.data, sections.data, tags.data, today]);
}

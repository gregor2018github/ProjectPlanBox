/**
 * An in-memory stand-in for the todos API, good enough for UI tests. It keeps
 * the server's essential behaviour (client ids, positions, completion and
 * delete cascades) but none of its validation. Playwright covers the real one.
 * Repeating todos come back the next day whatever their rule says (the real
 * server expands the rule).
 */
import type { FetchFn } from "../core/api/client";
import type { Meta } from "../core/api/types";
import type { Tag } from "../core/tags/tagQueries";
import { keyBetween } from "../core/ordering";
import { addDays } from "../core/time";
import type { Area, Section, Todo, TodoList } from "../modules/todos/types";

/** The fake server's state, inspectable by tests. */
export interface FakeState {
  todos: (Todo & { deleted_at?: string | null; recurs_from_id?: string })[];
  lists: TodoList[];
  sections: Section[];
  areas: Area[];
  tags: Tag[];
  requests: { method: string; path: string; body: unknown }[];
  /** Paths (method + " " + path prefix) that answer 500, to test rollbacks. */
  failing: Set<string>;
  now: string;
}

const META: Meta = {
  version: "0.1.0",
  mode: "test",
  timezone: "Europe/Amsterdam",
  week_starts_on: 1,
  can_shutdown: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

function problem(status: number, detail: string): Response {
  return json({ type: "about:blank", title: "Error", status, detail, code: "test" }, status);
}

/** Creates a fake API; pass the result's `fetch` to `renderApp`. */
export function createFakeTodoApi(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    todos: [],
    lists: [],
    sections: [],
    areas: [],
    tags: [],
    requests: [],
    failing: new Set(),
    now: "2026-10-08T12:00:00.000Z",
    ...seed,
  };

  const live = () => state.todos.filter((t) => !t.deleted_at);
  const strip = ({ deleted_at, recurs_from_id, ...todo }: FakeState["todos"][number]): Todo => todo;
  const endOf = (rows: { position: string }[]) =>
    keyBetween(
      rows
        .map((r) => r.position)
        .sort()
        .at(-1) ?? null,
      null,
    );

  const fetch: FetchFn = async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const text = method === "GET" ? "" : await request.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    state.requests.push({ method, path, body });
    for (const failing of state.failing) {
      if (`${method} ${path}`.startsWith(failing)) return problem(500, "Simulated failure");
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const segments = path.split("/").filter(Boolean); // ["api", "todos", "items", id, action]

    if (path === "/api/health")
      return json({ status: "ok", version: "0.1.0", schema_versions: {} });
    if (path === "/api/meta") return json(META);
    if (path === "/api/tags" && method === "GET") return json(state.tags);
    if (path === "/api/tags" && method === "POST") {
      const tag = {
        id: String(b.id),
        name: String(b.name),
        created_at: state.now,
        updated_at: state.now,
      };
      state.tags.push(tag);
      return json(tag, 201);
    }
    if (path === "/api/todos/areas") return json(state.areas);
    if (path === "/api/todos/lists" && method === "GET") return json(state.lists);
    if (path === "/api/todos/lists" && method === "POST") {
      const list: TodoList = {
        id: String(b.id),
        name: String(b.name),
        area_id: (b.area_id as string | null | undefined) ?? null,
        position: endOf(state.lists),
        created_at: state.now,
        updated_at: state.now,
      };
      state.lists.push(list);
      return json(list, 201);
    }
    if (path === "/api/todos/sections") return json(state.sections);
    if (path === "/api/todos/items" && method === "GET") {
      const since = url.searchParams.get("completed_since") ?? "";
      return json(
        live()
          .filter((t) => t.completed_at === null || t.completed_at >= since)
          .map(strip),
      );
    }
    if (path === "/api/todos/items/completed") {
      return json({
        todos: live()
          .filter((t) => t.completed_at !== null)
          .map(strip),
        next_cursor: null,
      });
    }
    if (path === "/api/todos/items" && method === "POST") {
      const placement = {
        list_id: (b.list_id as string | null | undefined) ?? null,
        section_id: (b.section_id as string | null | undefined) ?? null,
        parent_id: (b.parent_id as string | null | undefined) ?? null,
      };
      const siblings = live().filter(
        (t) =>
          t.list_id === placement.list_id &&
          t.section_id === placement.section_id &&
          t.parent_id === placement.parent_id,
      );
      const todo: Todo = {
        id: String(b.id),
        ...placement,
        title: String(b.title).replace(/\s+/g, " ").trim(),
        notes: (b.notes as string | undefined) ?? "",
        priority: (b.priority as number | undefined) ?? 0,
        due_date: (b.due_date as string | null | undefined) ?? null,
        position: endOf(siblings),
        completed_at: null,
        created_at: state.now,
        updated_at: state.now,
        tag_ids: (b.tag_ids as string[] | undefined) ?? [],
        rrule: null,
        recurrence_anchor: null,
        today_position: null,
      };
      state.todos.push(todo);
      return json(todo, 201);
    }

    if (path === "/api/todos/today-order" && method === "POST") {
      const ids = (b.ids as string[] | undefined) ?? [];
      let key: string | null = null;
      const changed: Todo[] = [];
      for (const todoId of ids) {
        key = keyBetween(key, null);
        const row = state.todos.find((t) => t.id === todoId && !t.deleted_at);
        if (!row) return problem(404, "No todo with this id.");
        if (row.today_position !== key) {
          Object.assign(row, { today_position: key, updated_at: state.now });
          changed.push(strip(row));
        }
      }
      return json({ todos: changed });
    }

    const id = segments[3];
    const action = segments[4];
    const target = state.todos.find((t) => t.id === id);
    if (segments[2] === "items" && target) {
      if (method === "GET" && action === undefined) {
        return target.deleted_at ? problem(404, "No todo with this id.") : json(strip(target));
      }
      if (method === "PATCH") {
        const redated = "due_date" in b && b.due_date !== target.due_date;
        Object.assign(target, b, { updated_at: state.now });
        if (redated) target.today_position = null;
        return json(strip(target));
      }
      if (method === "DELETE") {
        const tree = state.todos.filter(
          (t) => (t.id === id || t.parent_id === id) && !t.deleted_at,
        );
        for (const t of tree) t.deleted_at = state.now;
        return json({ deleted_at: state.now, areas: 0, lists: 0, sections: 0, todos: tree.length });
      }
      if (action === "restore") {
        const stamp = target.deleted_at;
        const tree = state.todos.filter(
          (t) => (t.id === id || t.parent_id === id) && t.deleted_at === stamp,
        );
        for (const t of tree) t.deleted_at = null;
        return json({ todos: tree.map(strip) });
      }
      if (action === "complete" || action === "reopen") {
        const value = action === "complete" ? state.now : null;
        const tree = state.todos.filter(
          (t) => (t.id === id || t.parent_id === id) && !t.deleted_at,
        );
        for (const t of tree) t.completed_at = value;
        const changed = [...tree];
        if (action === "complete" && target.rrule !== null && target.due_date !== null) {
          const next = {
            ...target,
            id: `${target.id.slice(0, -4)}next`,
            due_date: addDays(target.due_date, 1),
            completed_at: null,
            today_position: null,
            recurs_from_id: target.id,
          };
          state.todos.push(next);
          changed.push(next);
        }
        if (action === "reopen") {
          for (const t of live()) if (t.recurs_from_id === id) t.deleted_at = state.now;
        }
        return json({ todos: changed.map(strip) });
      }
      if (action === "move") {
        Object.assign(target, {
          list_id: b.list_id ?? null,
          section_id: b.section_id ?? null,
          parent_id: b.parent_id ?? null,
          updated_at: state.now,
        });
        return json({ todos: [strip(target)] });
      }
    }
    return problem(404, `fake API has no route ${method} ${path}`);
  };

  return { state, fetch };
}

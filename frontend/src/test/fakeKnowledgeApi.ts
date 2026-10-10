/**
 * An in-memory stand-in for the knowledge and links APIs, good enough for UI
 * tests. It keeps client ids, the most-recent-first order and the delete
 * cascade, but none of the validation; pytest covers the real server.
 * Requests it does not know go to `fallback` (e.g. the fake todos API).
 */
import type { FetchFn } from "../core/api/client";
import { keyBetween } from "../core/ordering";
import type { Link } from "../core/links/linkQueries";
import type { Collection, Entry } from "../modules/knowledge/types";

/** The fake server's state, inspectable by tests. */
export interface FakeKnowledgeState {
  entries: (Entry & { deleted_at?: string | null })[];
  collections: (Collection & { deleted_at?: string | null })[];
  links: (Link & { deleted?: boolean })[];
  requests: { method: string; path: string; body: unknown }[];
  /** Paths (method + " " + path prefix) that answer 500, to test rollbacks. */
  failing: Set<string>;
  now: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

function problem(status: number, detail: string): Response {
  return json({ type: "about:blank", title: "Error", status, detail, code: "test" }, status);
}

/**
 * Creates a fake knowledge API in front of `fallback`. `titleOf` names
 * entities of other modules for link summaries.
 */
export function createFakeKnowledgeApi(
  seed: Partial<FakeKnowledgeState> = {},
  fallback?: FetchFn,
  titleOf: (ref: string) => string | undefined = () => undefined,
) {
  const state: FakeKnowledgeState = {
    entries: [],
    collections: [],
    links: [],
    requests: [],
    failing: new Set(),
    now: "2026-10-08T12:00:00.000Z",
    ...seed,
  };

  const strip = <T extends { deleted_at?: string | null }>({ deleted_at, ...row }: T) => row;
  const liveEntries = () => state.entries.filter((e) => !e.deleted_at).map(strip);
  const title = (ref: string) => {
    const entry = state.entries.find((e) => `knowledge.entry:${e.id}` === ref);
    return entry?.title ?? titleOf(ref) ?? "?";
  };
  const summarize = (link: Link): Link => ({
    ...link,
    source: { ...link.source, title: title(link.source.ref) },
    target: { ...link.target, title: title(link.target.ref) },
  });

  const fetch: FetchFn = async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (!path.startsWith("/api/knowledge") && !path.startsWith("/api/links")) {
      return fallback ? fallback(request) : problem(404, path);
    }
    const text = method === "GET" ? "" : await request.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    state.requests.push({ method, path, body });
    for (const failing of state.failing) {
      if (`${method} ${path}`.startsWith(failing)) return problem(500, "Simulated failure");
    }
    const b = (body ?? {}) as Record<string, unknown>;
    // ["api", "knowledge", area, id, action] or ["api", "links", id, action]
    const segments = path.split("/").filter(Boolean);
    const isLinks = segments[1] === "links";
    const area = isLinks ? "links" : segments[2];
    const id = isLinks ? segments[2] : segments[3];
    const action = isLinks ? segments[3] : segments[4];

    if (path === "/api/links" && method === "GET") {
      const ref = url.searchParams.get("entity");
      return json(
        state.links
          .filter((l) => !l.deleted && (l.source.ref === ref || l.target.ref === ref))
          .map(({ deleted, ...l }) => summarize(l)),
      );
    }
    if (path === "/api/links" && method === "POST") {
      const link: Link = {
        id: String(b.id),
        source: { ref: String(b.source), title: "", deleted: false },
        target: { ref: String(b.target), title: "", deleted: false },
        created_at: state.now,
      };
      state.links.push(link);
      return json(summarize(link), 201);
    }
    if (area === "links") {
      const link = state.links.find((l) => l.id === id);
      if (!link) return problem(404, "no link");
      link.deleted = method === "DELETE";
      return method === "DELETE"
        ? json({ id: link.id, deleted_at: state.now })
        : json(summarize(link));
    }

    if (path === "/api/knowledge/entries" && method === "GET") return json(liveEntries());
    if (path === "/api/knowledge/collections" && method === "GET") {
      return json(state.collections.filter((c) => !c.deleted_at).map(strip));
    }
    if (path === "/api/knowledge/entries" && method === "POST") {
      const entry: Entry = {
        id: String(b.id),
        collection_id: (b.collection_id as string | null | undefined) ?? null,
        kind: b.kind as Entry["kind"],
        title: String(b.title).trim(),
        body: (b.body as string | undefined) ?? "",
        url: (b.url as string | undefined) ?? null,
        language: (b.language as string | null | undefined) ?? null,
        created_at: state.now,
        updated_at: state.now,
        tag_ids: (b.tag_ids as string[] | undefined) ?? [],
      };
      state.entries.unshift(entry);
      return json(entry, 201);
    }
    if (path === "/api/knowledge/collections" && method === "POST") {
      const last =
        state.collections
          .map((c) => c.position)
          .sort()
          .at(-1) ?? null;
      const collection: Collection = {
        id: String(b.id),
        name: String(b.name),
        position: keyBetween(last, null),
        created_at: state.now,
        updated_at: state.now,
      };
      state.collections.push(collection);
      return json(collection, 201);
    }

    if (area === "entries") {
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return problem(404, "no entry");
      if (method === "PATCH") {
        Object.assign(entry, b, { updated_at: state.now });
        return json(strip(entry));
      }
      if (method === "DELETE") {
        entry.deleted_at = state.now;
        return json({ deleted_at: state.now, collections: 0, entries: 1 });
      }
      if (action === "restore") {
        entry.deleted_at = null;
        return json(strip(entry));
      }
    }
    if (area === "collections") {
      const collection = state.collections.find((c) => c.id === id);
      if (!collection) return problem(404, "no collection");
      if (method === "PATCH") {
        Object.assign(collection, b);
        return json(strip(collection));
      }
      if (method === "DELETE") {
        const inside = state.entries.filter((e) => e.collection_id === id && !e.deleted_at);
        for (const e of inside) e.deleted_at = state.now;
        collection.deleted_at = state.now;
        return json({ deleted_at: state.now, collections: 1, entries: inside.length });
      }
      if (action === "restore") {
        const stamp = collection.deleted_at;
        const inside = state.entries.filter(
          (e) => e.collection_id === id && e.deleted_at === stamp,
        );
        for (const e of inside) e.deleted_at = null;
        collection.deleted_at = null;
        return json({ deleted_at: stamp, collections: 1, entries: inside.length });
      }
    }
    return problem(404, `fake API has no route ${method} ${path}`);
  };

  return { state, fetch };
}

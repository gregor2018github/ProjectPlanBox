import { describe, expect, it } from "vitest";

import { ROUTES } from "../core/device/openapi";
import { openTestDevice } from "./deviceTesting";

const TODO = "01990000-0000-7000-8000-000000000001";

interface Todo {
  id: string;
  completed_at: string | null;
}

describe("device backend", () => {
  it("serves every API operation", async () => {
    const device = await openTestDevice();
    const handlers = (device.server as unknown as { handlers: Record<string, unknown> }).handlers;
    const missing = ROUTES.map((r) => r.operationId).filter((id) => !(id in handlers));
    expect(missing).toEqual([]);
  });

  it("starts with an empty, migrated database", async () => {
    const device = await openTestDevice();
    const health = await device.call<{ schema_versions: Record<string, number> }>(
      "GET",
      "/api/health",
    );
    expect(health.status).toBe(200);
    expect(health.body.schema_versions).toMatchObject({
      core: 5,
      todos: 7,
      knowledge: 1,
      calendar: 2,
      habits: 2,
    });
    expect((await device.call("GET", "/api/todos/lists")).body).toEqual([]);
    const meta = await device.call("GET", "/api/meta");
    expect(meta.body).toMatchObject({ timezone: "Europe/Amsterdam", can_shutdown: false });
  });

  it("creates, completes and searches todos", async () => {
    const device = await openTestDevice();
    const created = await device.call("POST", "/api/todos/items", {
      id: TODO,
      title: "  Buy   milk ",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: TODO, title: "Buy milk", list_id: null });
    const again = await device.call("POST", "/api/todos/items", { id: TODO, title: "Buy milk" });
    expect(again.status).toBe(200);

    const done = await device.call<{ todos: Todo[] }>("POST", `/api/todos/items/${TODO}/complete`);
    expect(done.body.todos[0]?.completed_at).toBe("2026-10-08T12:00:00.000Z");

    const hits = await device.call("GET", "/api/search?q=mil");
    expect(hits.body).toEqual([
      {
        ref: `todos.todo:${TODO}`,
        title: "Buy milk",
        snippet: "",
        hint: "Done · Inbox",
      },
    ]);
  });

  it("reports validation problems like FastAPI", async () => {
    const device = await openTestDevice();
    const missing = await device.call<{ code: string; errors: { loc: unknown[] }[] }>(
      "POST",
      "/api/todos/items",
      { notes: "x" },
    );
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe("invalid_request");
    expect(missing.body.errors[0]?.loc).toEqual(["body", "title"]);
    const rule = await device.call("POST", "/api/todos/items", { title: "x", priority: 9 });
    expect(rule.status).toBe(422);
    const notFound = await device.call("GET", `/api/todos/items/${TODO}`);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toMatchObject({ code: "not_found" });
    expect((await device.call("GET", "/api/nope")).status).toBe(404);
  });

  it("repeats todos on completion", async () => {
    const device = await openTestDevice();
    await device.call("POST", "/api/todos/items", {
      id: TODO,
      title: "Water plants",
      due_date: "2026-10-08",
      rrule: "FREQ=WEEKLY",
    });
    const done = await device.call<{ todos: Todo[] }>("POST", `/api/todos/items/${TODO}/complete`);
    const next = done.body.todos.find((t) => t.id !== TODO);
    expect(next).toMatchObject({
      due_date: "2026-10-15",
      rrule: "FREQ=WEEKLY",
      recurrence_anchor: "2026-10-08",
    });
  });

  it("exports and merges its data back", async () => {
    const phone = await openTestDevice();
    await phone.call("POST", "/api/todos/items", { id: TODO, title: "From the phone" });
    const exported = (await phone.call("GET", "/api/data/export")).body;
    const other = await openTestDevice();
    const merged = await other.call<{ backup: string }>("POST", "/api/data/import", exported);
    expect(merged.status).toBe(200);
    expect(merged.body.backup).toMatch(/pre-import\.db$/);
    const todo = await other.call<{ title: string }>("GET", `/api/todos/items/${TODO}`);
    expect(todo.body.title).toBe("From the phone");
  });
});

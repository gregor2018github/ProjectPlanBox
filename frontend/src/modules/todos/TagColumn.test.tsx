import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { renderApp, useDesktopViewport } from "../../test/renderApp";
import { todosModule } from ".";
import { makeTodo } from "./testData";

beforeEach(() => {
  useDesktopViewport();
});

const tag = { id: "T1", name: "home", created_at: "", updated_at: "" };

const tagColumnOf = async (title: string) => {
  const box = await screen.findByRole("checkbox", { name: `Complete “${title}”` });
  return box.closest("[data-todo-id]")?.querySelector("[data-column='tags']") ?? null;
};

describe("tag column", () => {
  it("gives every row of a list with tags the same tag column", async () => {
    const todos = [
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ab01", title: "Fix tap", tag_ids: ["T1"] }),
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ab02", title: "Call Ann" }),
    ];
    renderApp({
      path: "/todos/inbox",
      fetch: createFakeTodoApi({ todos, tags: [tag] }).fetch,
      modules: [todosModule],
    });

    expect((await tagColumnOf("Fix tap"))?.textContent).toBe("@home");
    // The untagged row keeps an empty column, so the next column stays aligned.
    expect((await tagColumnOf("Call Ann"))?.textContent).toBe("");
  });

  it("leaves the column out of a list without tags", async () => {
    const todos = [makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ab03", title: "Call Ann" })];
    renderApp({
      path: "/todos/inbox",
      fetch: createFakeTodoApi({ todos, tags: [tag] }).fetch,
      modules: [todosModule],
    });

    expect(await tagColumnOf("Call Ann")).toBeNull();
  });
});

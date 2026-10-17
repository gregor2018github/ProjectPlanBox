import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { renderApp, useDesktopViewport } from "../../test/renderApp";
import { todosModule } from ".";
import { makeTodo } from "./testData";

beforeEach(() => {
  useDesktopViewport();
});

const rowOf = async (title: string) => {
  const box = await screen.findByRole("checkbox", { name: `Complete “${title}”` });
  return box.closest("[data-todo-id]");
};

describe("striped rows", () => {
  it("shades every other row of a list", async () => {
    const todos = [
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ac01", title: "First", position: "a1" }),
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ac02", title: "Second", position: "a2" }),
      makeTodo({ id: "01a11c71-6563-773d-8602-c5617ab6ac03", title: "Third", position: "a3" }),
    ];
    renderApp({
      path: "/todos/inbox",
      fetch: createFakeTodoApi({ todos }).fetch,
      modules: [todosModule],
    });

    expect(await rowOf("First")).not.toHaveClass("bg-stripe");
    expect(await rowOf("Second")).toHaveClass("bg-stripe");
    expect(await rowOf("Third")).not.toHaveClass("bg-stripe");
  });
});

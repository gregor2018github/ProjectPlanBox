import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { renderApp, useDesktopViewport } from "../../test/renderApp";
import { todosModule } from ".";

beforeEach(() => {
  useDesktopViewport();
});

function withArea() {
  const api = createFakeTodoApi();
  api.state.areas.push({
    id: "A",
    name: "Work",
    hue: 264,
    position: "a0",
    created_at: "",
    updated_at: "",
  });
  return api;
}

const posted = (api: ReturnType<typeof createFakeTodoApi>, path: string) =>
  api.state.requests.find((r) => r.method === "POST" && r.path === path)?.body;

describe("create buttons", () => {
  it("adds a todo from the sidebar's Todos heading", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi();
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await user.click(await screen.findByRole("button", { name: "New todo" }));
    await user.keyboard("Buy milk{Enter}");

    await waitFor(() => {
      expect(posted(api, "/api/todos/items")).toMatchObject({ title: "Buy milk", list_id: null });
    });
  });

  it("adds a list inside an area from the area's sidebar row", async () => {
    const user = userEvent.setup();
    const api = withArea();
    renderApp({ path: "/todos/inbox", fetch: api.fetch, modules: [todosModule] });

    await user.click(await screen.findByRole("button", { name: "New list in Work" }));
    expect(screen.getByRole("dialog", { name: "New list in Work" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Reports{Enter}");

    await waitFor(() => {
      expect(posted(api, "/api/todos/lists")).toMatchObject({ name: "Reports", area_id: "A" });
    });
  });

  it("leads an empty area's page with a New list button", async () => {
    const user = userEvent.setup();
    const api = withArea();
    renderApp({ path: "/todos/areas/A", fetch: api.fetch, modules: [todosModule] });

    const empty = (await screen.findByText("No lists in this area yet.")).parentElement;
    await user.click(within(empty as HTMLElement).getByRole("button", { name: "New list" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Reports{Enter}");

    await waitFor(() => {
      expect(posted(api, "/api/todos/lists")).toMatchObject({ name: "Reports", area_id: "A" });
    });
  });

  it("adds a todo to a list from the area's page", async () => {
    const user = userEvent.setup();
    const api = withArea();
    api.state.lists.push({
      id: "L",
      name: "Reports",
      area_id: "A",
      position: "a0",
      created_at: "",
      updated_at: "",
    });
    renderApp({ path: "/todos/areas/A", fetch: api.fetch, modules: [todosModule] });

    await user.click(await screen.findByRole("button", { name: "Add todo" }));
    await user.keyboard("Draft Q3{Enter}");

    await waitFor(() => {
      expect(posted(api, "/api/todos/items")).toMatchObject({ title: "Draft Q3", list_id: "L" });
    });
  });
});

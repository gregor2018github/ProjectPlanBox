import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeTodoApi } from "../../test/fakeTodoApi";
import { renderApp, useDesktopViewport } from "../../test/renderApp";
import { todosModule } from ".";

beforeEach(() => {
  useDesktopViewport();
});

function open(path: string, api = createFakeTodoApi()) {
  renderApp({ path, fetch: api.fetch, modules: [todosModule] });
  return api;
}

const tintOf = (element: HTMLElement) =>
  element.closest("[data-tint]")?.getAttribute("style") ?? null;

describe("area colours", () => {
  it("gives a new area the first free default hue", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi();
    api.state.areas.push({
      id: "A",
      name: "Work",
      hue: 264,
      position: "a0",
      created_at: "",
      updated_at: "",
    });
    open("/todos/inbox", api);

    await user.click(await screen.findByRole("button", { name: "New list or area" }));
    await user.click(await screen.findByRole("menuitem", { name: "New area" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Garden{Enter}");

    await waitFor(() => {
      const post = api.state.requests.find(
        (r) => r.method === "POST" && r.path === "/api/todos/areas",
      );
      expect(post?.body).toMatchObject({ name: "Garden", hue: 155 });
    });
    expect(tintOf(await screen.findByRole("link", { name: "Garden" }))).toContain(
      "--tint-hue: 155",
    );
  });

  it("changes an area's colour with the wheel and tints its page", async () => {
    const user = userEvent.setup();
    const api = createFakeTodoApi();
    api.state.areas.push({
      id: "A",
      name: "Work",
      hue: 264,
      position: "a0",
      created_at: "",
      updated_at: "",
    });
    open("/todos/areas/A", api);

    const heading = await screen.findByRole("heading", { name: "Work" });
    expect(tintOf(heading)).toContain("--tint-hue: 264");

    await user.click(screen.getByRole("button", { name: "Area actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Area settings…" }));
    const dialog = await screen.findByRole("dialog", { name: "Area settings" });
    const wheel = within(dialog).getByRole("slider", { name: "Area colour" });
    wheel.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{PageUp}");
    expect(wheel).toHaveAttribute("aria-valuenow", "304");
    await user.click(within(dialog).getByRole("button", { name: "green (155°)" }));
    expect(wheel).toHaveAttribute("aria-valuetext", "155°, green");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(tintOf(screen.getByRole("heading", { name: "Work" }))).toContain("--tint-hue: 155");
    });
    const patch = api.state.requests.find(
      (r) => r.method === "PATCH" && r.path === "/api/todos/areas/A",
    );
    expect(patch?.body).toEqual({ hue: 155 });
  });
});

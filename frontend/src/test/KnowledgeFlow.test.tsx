import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeKnowledgeApi, type FakeKnowledgeState } from "./fakeKnowledgeApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";
import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { knowledgeModule } from "../modules/knowledge";
import { makeCollection, makeEntry, textBox } from "../modules/knowledge/testData";

beforeEach(() => {
  useDesktopViewport();
});

function open(path: string, seed: Partial<FakeKnowledgeState> = {}, todos = createFakeTodoApi()) {
  const titleOf = (ref: string) =>
    todos.state.todos.find((t) => `todos.todo:${t.id}` === ref)?.title;
  const api = createFakeKnowledgeApi(seed, todos.fetch, titleOf);
  renderApp({ path, fetch: api.fetch, modules: [todosModule, knowledgeModule] });
  return api;
}

describe("knowledge", () => {
  it("makes a page with E and opens it large with its title selected", async () => {
    const user = userEvent.setup();
    const api = open("/knowledge");
    await screen.findByText(/No pages here yet/);

    await user.keyboard("e");

    const title = await screen.findByRole("textbox", { name: "Page title" });
    expect(title).toHaveValue("Untitled page");
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    const post = api.state.requests.find(
      (r) => r.method === "POST" && r.path === "/api/knowledge/entries",
    );
    expect(post?.body).toMatchObject({ title: "Untitled page", collection_id: null });
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    expect(screen.getByText("Click anywhere on the page to start writing.")).toBeInTheDocument();

    await user.keyboard("Soup ideas{Enter}");
    await waitFor(() => {
      const patch = api.state.requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ title: "Soup ideas" });
    });
  });

  it("opens a page from the list and shows its boxes", async () => {
    const user = userEvent.setup();
    const soup = makeEntry({
      title: "Tomato soup",
      content: { boxes: [textBox("Simmer for an hour", { x: 120, y: 40 })] },
    });
    open("/knowledge", { entries: [soup] });

    const row = await screen.findByRole("button", { name: /^Page: Tomato soup/ });
    expect(row).toHaveTextContent("Simmer for an hour");
    await user.click(row);

    expect(await screen.findByRole("textbox", { name: "Page title" })).toHaveValue("Tomato soup");
    expect(await screen.findByText("Simmer for an hour")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Move box/ })).toBeInTheDocument();
  });

  it("deletes a box with undo and saves the page each time", async () => {
    const user = userEvent.setup();
    const page = makeEntry({ title: "Plan", content: { boxes: [textBox("Keep me")] } });
    const api = open(`/knowledge/pages/${page.id}`, { entries: [page] });
    const patches = () => api.state.requests.filter((r) => r.method === "PATCH");

    await screen.findByText("Keep me");
    await user.click(screen.getByRole("button", { name: "Delete box" }));
    await waitFor(() => {
      expect(screen.queryByText("Keep me")).not.toBeInTheDocument();
    });
    await waitFor(
      () => {
        expect(patches().at(-1)?.body).toEqual({ content: { boxes: [] } });
      },
      { timeout: 2000 },
    );

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Keep me")).toBeInTheDocument();
    await waitFor(
      () => {
        expect(patches().at(-1)?.body).toEqual({ content: page.content });
      },
      { timeout: 2000 },
    );
  });

  it("adds a table box from the toolbar", async () => {
    const user = userEvent.setup();
    const page = makeEntry({ title: "Grid" });
    const api = open(`/knowledge/pages/${page.id}`, { entries: [page] });

    await user.click(await screen.findByRole("button", { name: "Add table" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    await waitFor(
      () => {
        const patch = api.state.requests.find((r) => r.method === "PATCH");
        const content = (patch?.body as { content?: { boxes: { doc: unknown }[] } }).content;
        expect(JSON.stringify(content?.boxes[0]?.doc)).toContain("tableHeader");
      },
      { timeout: 2000 },
    );
  });

  it("filters by words across titles, text and tags", async () => {
    const user = userEvent.setup();
    open("/knowledge", {
      entries: [
        makeEntry({ title: "Tomato soup", content: { boxes: [textBox("dinner")] } }),
        makeEntry({ title: "Loop", content: { boxes: [textBox("for x in y")] } }),
      ],
    });
    await screen.findByRole("button", { name: /^Page: Tomato soup/ });

    await user.type(screen.getByRole("searchbox", { name: "Filter pages" }), "dinner");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Page: Loop/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^Page: Tomato soup/ })).toBeInTheDocument();
  });

  it("deletes with undo, and rolls back what the server refuses", async () => {
    const user = userEvent.setup();
    const api = open("/knowledge", { entries: [makeEntry({ title: "Keep me" })] });

    await user.click(await screen.findByRole("button", { name: "Actions for “Keep me”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Page: Keep me/ })).not.toBeInTheDocument();
    });
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: /^Page: Keep me/ })).toBeInTheDocument();

    api.state.failing.add("POST /api/knowledge/entries");
    await user.click(screen.getByRole("button", { name: "New page" }));
    // The toast and its screen-reader announcement.
    expect(await screen.findAllByText("Could not add the entry")).not.toHaveLength(0);
    expect(await screen.findByText("This page does not exist (anymore).")).toBeInTheDocument();
  });

  it("puts new pages into the collection on screen", async () => {
    const user = userEvent.setup();
    const recipes = makeCollection({ name: "Recipes" });
    const api = open(`/knowledge/collections/${recipes.id}`, { collections: [recipes] });

    await screen.findByRole("heading", { name: "Recipes" });
    await user.keyboard("e");

    expect(await screen.findByRole("textbox", { name: "Page title" })).toBeInTheDocument();
    const post = api.state.requests.find((r) => r.method === "POST");
    expect(post?.body).toMatchObject({ collection_id: recipes.id });
    expect(screen.getByRole("button", { name: "Collection: Recipes" })).toBeInTheDocument();
  });

  it("links a todo to a page and shows the link from both sides", async () => {
    const user = userEvent.setup();
    const report = makeTodo({ title: "Write report" });
    const outline = makeEntry({ title: "Report outline" });
    const api = open(
      `/todos/inbox?item=todos.todo:${report.id}`,
      { entries: [outline] },
      createFakeTodoApi({ todos: [report] }),
    );

    const details = await screen.findByRole("complementary", { name: "Details" });
    await user.click(await within(details).findByRole("button", { name: "Link…" }));
    await user.type(await screen.findByRole("combobox", { name: "Link to" }), "outline{Enter}");

    const linked = await within(details).findByRole("button", { name: /^Report outline/ });
    expect(api.state.links[0]).toMatchObject({
      source: { ref: `todos.todo:${report.id}` },
      target: { ref: `knowledge.entry:${outline.id}` },
    });

    await user.click(linked);
    expect(await within(details).findByRole("textbox", { name: "Title" })).toHaveValue(
      "Report outline",
    );
    expect(
      await within(details).findByRole("button", { name: /^Write report/ }),
    ).toBeInTheDocument();
  });
});

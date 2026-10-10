import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeKnowledgeApi, type FakeKnowledgeState } from "./fakeKnowledgeApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";
import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { knowledgeModule } from "../modules/knowledge";
import { makeCollection, makeEntry } from "../modules/knowledge/testData";

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
  it("adds a note with E, shows it at once and opens it", async () => {
    const user = userEvent.setup();
    const api = open("/knowledge");
    await screen.findByText(/No notes, links or snippets here yet/);

    await user.keyboard("e");
    const dialog = await screen.findByRole("dialog", { name: "New note" });
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Soup ideas");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Text" }),
      "Tomato{Control>}{Enter}{/Control}",
    );

    expect(await screen.findByRole("button", { name: /^Note: Soup ideas/ })).toBeInTheDocument();
    const post = api.state.requests.find(
      (r) => r.method === "POST" && r.path === "/api/knowledge/entries",
    );
    expect(post?.body).toMatchObject({
      kind: "note",
      title: "Soup ideas",
      body: "Tomato",
      collection_id: null,
    });
    const details = await screen.findByRole("complementary", { name: "Details" });
    expect(within(details).getByRole("textbox", { name: "Title" })).toHaveValue("Soup ideas");
  });

  it("names a link after its site and adds https://", async () => {
    const user = userEvent.setup();
    const api = open("/knowledge");

    await user.click(await screen.findByRole("button", { name: "New entry" }));
    const dialog = await screen.findByRole("dialog", { name: "New note" });
    await user.click(within(dialog).getByRole("button", { name: "Link" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Web address" }),
      "www.example.com/docs",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add link" }));

    await waitFor(() => {
      const post = api.state.requests.find((r) => r.method === "POST");
      expect(post?.body).toMatchObject({
        kind: "link",
        title: "example.com",
        url: "https://www.example.com/docs",
      });
    });
  });

  it("filters by kind and by words", async () => {
    const user = userEvent.setup();
    open("/knowledge", {
      entries: [
        makeEntry({ title: "Tomato soup", body: "dinner" }),
        makeEntry({ kind: "snippet", title: "Loop", body: "for x in y", language: "python" }),
      ],
    });
    await screen.findByRole("button", { name: /^Note: Tomato soup/ });

    await user.click(screen.getByRole("button", { name: "Snippets" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Note: Tomato soup/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^Snippet: Loop/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All kinds" }));
    await user.type(screen.getByRole("searchbox", { name: "Filter entries" }), "dinner");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Snippet: Loop/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^Note: Tomato soup/ })).toBeInTheDocument();
  });

  it("deletes with undo, and rolls back what the server refuses", async () => {
    const user = userEvent.setup();
    const api = open("/knowledge", { entries: [makeEntry({ title: "Keep me" })] });

    await user.click(await screen.findByRole("button", { name: "Actions for “Keep me”" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Note: Keep me/ })).not.toBeInTheDocument();
    });
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: /^Note: Keep me/ })).toBeInTheDocument();

    api.state.failing.add("POST /api/knowledge/entries");
    await user.keyboard("e");
    const dialog = await screen.findByRole("dialog", { name: "New note" });
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Doomed{Enter}");
    expect(await screen.findByText("Could not add the entry")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Note: Doomed/ })).not.toBeInTheDocument();
    });
  });

  it("puts new entries into the collection on screen", async () => {
    const user = userEvent.setup();
    const recipes = makeCollection({ name: "Recipes" });
    const api = open(`/knowledge/collections/${recipes.id}`, { collections: [recipes] });

    await screen.findByRole("heading", { name: "Recipes" });
    await user.keyboard("e");
    const dialog = await screen.findByRole("dialog", { name: "New note" });
    expect(within(dialog).getByText("Goes to Recipes.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Pancakes{Enter}");

    await waitFor(() => {
      const post = api.state.requests.find((r) => r.method === "POST");
      expect(post?.body).toMatchObject({ collection_id: recipes.id });
    });
  });

  it("links a todo to a note and shows the link from both sides", async () => {
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

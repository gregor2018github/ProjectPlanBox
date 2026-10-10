import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { FetchFn } from "../core/api/client";
import { MATCH_END, MATCH_START } from "../core/search/marks";
import type { SearchHit } from "../core/search/searchQueries";
import { knowledgeModule } from "../modules/knowledge";
import { makeEntry } from "../modules/knowledge/testData";
import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { createFakeKnowledgeApi } from "./fakeKnowledgeApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";

beforeEach(() => {
  useDesktopViewport();
});

/** Answers GET /api/search from `hitsFor`; everything else goes to `fallback`. */
function withSearch(fallback: FetchFn, hitsFor: (q: string) => SearchHit[]): FetchFn {
  return (request) => {
    const url = new URL(request.url);
    if (url.pathname !== "/api/search") return fallback(request);
    const body = JSON.stringify(hitsFor(url.searchParams.get("q") ?? ""));
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

describe("search", () => {
  it("lists server hits in the palette and opens one in the detail panel", async () => {
    const user = userEvent.setup();
    const soup = makeEntry({ title: "Soup ideas", body: "Tomato and basil" });
    const todos = createFakeTodoApi();
    const knowledge = createFakeKnowledgeApi({ entries: [soup] }, todos.fetch);
    const fetch = withSearch(knowledge.fetch, (q) =>
      q === "basil"
        ? [
            {
              ref: `knowledge.entry:${soup.id}`,
              title: "Soup ideas",
              snippet: `Tomato and ${MATCH_START}basil${MATCH_END}`,
              hint: "Note · Unsorted",
            },
          ]
        : [],
    );
    renderApp({ path: "/todos/inbox", fetch, modules: [todosModule, knowledgeModule] });

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByRole("combobox", { name: "Search commands" }), "basil");

    const listbox = screen.getByRole("listbox", { name: "Commands" });
    const hit = await within(listbox).findByRole("option", { name: /Soup ideas/ });
    expect(within(listbox).getByText("Search results")).toBeInTheDocument();
    expect(within(hit).getByText("Note · Unsorted")).toBeInTheDocument();
    expect(within(hit).getByText("basil").tagName).toBe("MARK");

    await user.keyboard("{Enter}");
    const details = await screen.findByRole("complementary", { name: "Details" });
    expect(await within(details).findByRole("textbox", { name: "Title" })).toHaveValue(
      "Soup ideas",
    );
  });

  it("offers server hits in the link picker for items outside the cache", async () => {
    const user = userEvent.setup();
    const old = makeTodo({ title: "File taxes", completed_at: "2026-03-01T10:00:00.000Z" });
    const receipts = makeEntry({ title: "Receipts" });
    const todos = createFakeTodoApi({ todos: [old] });
    const knowledge = createFakeKnowledgeApi({ entries: [receipts] }, todos.fetch, (ref) =>
      ref === `todos.todo:${old.id}` ? old.title : undefined,
    );
    const fetch = withSearch(knowledge.fetch, (q) =>
      q === "tax"
        ? [{ ref: `todos.todo:${old.id}`, title: "File taxes", snippet: "", hint: "Done · Inbox" }]
        : [],
    );
    renderApp({
      path: `/knowledge?item=knowledge.entry:${receipts.id}`,
      fetch,
      modules: [todosModule, knowledgeModule],
    });

    const details = await screen.findByRole("complementary", { name: "Details" });
    await user.click(await within(details).findByRole("button", { name: "Link…" }));
    await user.type(await screen.findByRole("combobox", { name: "Link to" }), "tax");
    await user.click(await screen.findByRole("option", { name: /File taxes/ }));

    expect(await within(details).findByRole("button", { name: /^File taxes/ })).toBeVisible();
    expect(knowledge.state.links[0]?.target.ref).toBe(`todos.todo:${old.id}`);
  });

  it("opens a todo completed before today read-only, and reopens it", async () => {
    const user = userEvent.setup();
    const old = makeTodo({
      title: "File taxes",
      notes: "Receipts in the blue folder",
      completed_at: "2026-03-01T10:00:00.000Z",
    });
    const todos = createFakeTodoApi({ todos: [old] });
    const knowledge = createFakeKnowledgeApi({}, todos.fetch);
    renderApp({
      path: `/todos/inbox?item=todos.todo:${old.id}`,
      fetch: knowledge.fetch,
      modules: [todosModule, knowledgeModule],
    });

    const details = await screen.findByRole("complementary", { name: "Details" });
    expect(await within(details).findByText("File taxes")).toBeInTheDocument();
    expect(within(details).getByText(/Completed 1 Mar 2026 · Inbox/)).toBeInTheDocument();
    expect(within(details).getByText("Receipts in the blue folder")).toBeInTheDocument();

    await user.click(within(details).getByRole("button", { name: "Reopen" }));

    expect(await within(details).findByRole("textbox", { name: "Title" })).toHaveValue(
      "File taxes",
    );
    expect(todos.state.todos[0]?.completed_at).toBeNull();
  });
});

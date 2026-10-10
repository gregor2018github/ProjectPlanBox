import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeCalendarApi } from "./fakeCalendarApi";
import { createFakeTodoApi } from "./fakeTodoApi";
import { renderApp, useDesktopViewport } from "./renderApp";
import { todosModule } from "../modules/todos";
import { makeTodo } from "../modules/todos/testData";
import { calendarModule } from "../modules/calendar";
import { makeEvent } from "../modules/calendar/testData";
import { calendarUi } from "../modules/calendar/uiStore";

beforeEach(() => {
  useDesktopViewport();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  // Thursday 8 October 2026, 12:00 in Amsterdam.
  vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  calendarUi.reset();
});

function open(
  path: string,
  events = [makeEvent({ title: "Standup" })],
  todos = createFakeTodoApi(),
) {
  const api = createFakeCalendarApi(events, todos.fetch);
  renderApp({ path, fetch: api.fetch, modules: [todosModule, calendarModule] });
  return { api, todos };
}

const pane = () => screen.getByRole("complementary", { name: "Calendar" });

describe("calendar", () => {
  it("toggles the pane from the right-hand rail and shows today's agenda", async () => {
    const user = userEvent.setup();
    open("/todos/inbox");

    const railButton = await screen.findByRole("button", { name: "Calendar" });
    expect(railButton).toHaveAttribute("aria-pressed", "false");
    await user.click(railButton);

    expect(railButton).toHaveAttribute("aria-pressed", "true");
    const today = await within(pane()).findByRole("region", { name: "Today, Thu 8 Oct" });
    expect(await within(today).findByText("Standup")).toBeInTheDocument();
    expect(within(today).getByText("09:00–10:00")).toBeInTheDocument();

    await user.click(within(pane()).getByRole("button", { name: "Close calendar" }));
    expect(railButton).toHaveAttribute("aria-pressed", "false");
  });

  it("closes the pane when opening the full calendar from it", async () => {
    const user = userEvent.setup();
    open("/todos/inbox");

    const railButton = await screen.findByRole("button", { name: "Calendar" });
    await user.click(railButton);
    await user.click(within(pane()).getByRole("button", { name: "Open full calendar" }));

    expect(railButton).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Calendar" })).not.toBeInTheDocument();
    });
  });

  it("creates an event from the dialog, optimistically", async () => {
    const user = userEvent.setup();
    const { api } = open("/todos/inbox", []);
    await user.click(await screen.findByRole("button", { name: "Calendar" }));

    await user.click(within(pane()).getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Dentist");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(pane()).findByText("Dentist")).toBeInTheDocument();
    const post = api.state.requests.find((r) => r.method === "POST");
    // The next full hour after 12:00 local is 13:00 = 11:00Z.
    expect(post?.body).toMatchObject({
      title: "Dentist",
      all_day: false,
      start_at: "2026-10-08T11:00:00.000Z",
      end_at: "2026-10-08T12:00:00.000Z",
      rrule: null,
    });
  });

  it("asks which events to delete for a series and deletes only this one", async () => {
    const user = userEvent.setup();
    const series = makeEvent({
      title: "Gym",
      start_at: "2026-10-01T16:00:00.000Z",
      end_at: "2026-10-01T17:00:00.000Z",
      rrule: "FREQ=WEEKLY",
    });
    const { api } = open("/todos/inbox", [series]);
    await user.click(await screen.findByRole("button", { name: "Calendar" }));

    const today = await within(pane()).findByRole("region", { name: "Today, Thu 8 Oct" });
    await user.click(await within(today).findByRole("button", { name: "Actions for “Gym”" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const question = await screen.findByRole("dialog", { name: "Delete recurring event" });
    await user.click(within(question).getByRole("button", { name: "This event" }));

    await waitFor(() => {
      expect(within(today).queryByText("Gym")).not.toBeInTheDocument();
    });
    const deletion = api.state.requests.find((r) => r.method === "DELETE");
    expect(deletion?.query).toBe("?scope=this&occurrence_date=2026-10-08");
  });

  it("shows dated todos and completes them through the todos module", async () => {
    const user = userEvent.setup();
    const todos = createFakeTodoApi({
      todos: [makeTodo({ id: "t-rent", title: "Pay rent", due_date: "2026-10-08", priority: 3 })],
    });
    open("/todos/inbox", [], todos);
    await user.click(await screen.findByRole("button", { name: "Calendar" }));

    const today = await within(pane()).findByRole("region", { name: "Today, Thu 8 Oct" });
    await user.click(await within(today).findByRole("checkbox", { name: "Complete “Pay rent”" }));

    await waitFor(() => {
      expect(todos.state.requests.some((r) => r.path === "/api/todos/items/t-rent/complete")).toBe(
        true,
      );
    });
  });

  it("shows the week on the calendar page and switches views by keyboard", async () => {
    const user = userEvent.setup();
    open("/calendar?view=week&date=2026-10-08");

    expect(await screen.findByRole("heading", { name: "5–11 October 2026" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Standup, Thursday, 8 October, 09:00–10:00" }),
    ).toBeInTheDocument();

    await user.keyboard("m");
    expect(await screen.findByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    await user.keyboard("j");
    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });
});

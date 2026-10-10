import { expect, test, type Locator, type Page } from "@playwright/test";

/** A suffix that keeps each test's todos apart (they share one server). */
const tag = () => Math.random().toString(36).slice(2, 7);

/** Titles of the todos in a named list, in on-screen order. */
async function titles(list: Locator): Promise<string[]> {
  const labels = await list
    .getByRole("checkbox")
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label") ?? ""));
  return labels.map((label) => label.replace(/^(Complete|Reopen) “|”$/g, ""));
}

async function addInline(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Add todo" }).first().click();
  const input = page.getByRole("textbox", { name: "New todo" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
}

test("quick-add parses the text and lands in Today, persisted", async ({ page }) => {
  const title = `Pay rent ${tag()}`;
  await page.goto("/");
  await expect(page).toHaveURL(/\/todos\/today$/);

  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "New todo" }).fill(`${title} today !1`);
  await page.keyboard.press("Enter");

  const today = page.getByRole("list", { name: "Due today" });
  await expect(today).toContainText(title);
  await page.reload();
  await expect(page.getByRole("list", { name: "Due today" })).toContainText(title);
});

test("complete, then undo with Ctrl+Z", async ({ page }) => {
  const title = `Water plants ${tag()}`;
  await page.goto("/todos/inbox");
  await addInline(page, title);

  await page.getByRole("checkbox", { name: `Complete “${title}”` }).click();
  await expect(page.getByRole("list", { name: "Completed today" })).toContainText(title);

  await page.keyboard.press("Control+z");
  await expect(page.getByRole("list", { name: "Inbox" })).toContainText(title);
});

test("drag and drop reorders, and the order survives a reload", async ({ page }) => {
  const id = tag();
  const [a, b, c] = [`A ${id}`, `B ${id}`, `C ${id}`];
  await page.goto("/todos/inbox");
  for (const title of [a, b, c]) await addInline(page, title);
  const inbox = page.getByRole("list", { name: "Inbox" });
  const ours = async () => (await titles(inbox)).filter((t) => t.endsWith(id));
  await expect.poll(ours).toEqual([a, b, c]);

  const source = inbox.getByText(c, { exact: true });
  const target = inbox.getByText(a, { exact: true });
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("rows not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 15 });
  await page.mouse.up();

  await expect.poll(ours).toEqual([c, a, b]);
  await page.reload();
  await expect.poll(ours).toEqual([c, a, b]);
  // Rows stay plain list items (no role="button" wrapping the row's own buttons).
  await expect(inbox.getByRole("button", { name: new RegExp(`Complete “${a}”`) })).toHaveCount(0);
});

test("indent makes a subtask; completing the parent completes both", async ({ page, request }) => {
  const id = tag();
  const [parent, child] = [`Parent ${id}`, `Child ${id}`];
  await page.goto("/todos/inbox");
  await addInline(page, parent);
  await addInline(page, child);

  await page.getByText(child, { exact: true }).click();
  await page.keyboard.press("Alt+ArrowRight");
  // Indenting expands the new parent so the subtask stays in view.
  await expect(page.getByRole("button", { name: "Hide 1 subtasks" })).toBeVisible();

  await page.getByRole("checkbox", { name: `Complete “${parent}”` }).click();
  await expect
    .poll(async () => {
      const response = await request.get("/api/todos/items?completed_since=2000-01-01T00:00:00Z");
      const todos = (await response.json()) as { title: string; completed_at: string | null }[];
      return todos.filter((t) => t.title.endsWith(id)).map((t) => t.completed_at !== null);
    })
    .toEqual([true, true]);
});

test("edits title and notes in the detail panel", async ({ page }) => {
  const id = tag();
  const title = `Draft ${id}`;
  await page.goto("/todos/inbox");
  await addInline(page, title);

  await page.getByText(title, { exact: true }).dblclick();
  const titleField = page.getByRole("textbox", { name: "Title" });
  await titleField.fill(`Final ${id}`);
  await titleField.press("Enter");
  await page.getByRole("textbox", { name: "Notes" }).fill("Remember the attachment");
  await page.getByRole("textbox", { name: "Title" }).click(); // blur saves the notes

  await expect(page.getByRole("list", { name: "Inbox" })).toContainText(`Final ${id}`);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Remember the attachment");
});

test("a note links to a todo, and the link shows from both sides after a reload", async ({
  page,
}) => {
  const id = tag();
  const todo = `Write report ${id}`;
  const note = `Report outline ${id}`;
  await page.goto("/todos/inbox");
  await addInline(page, todo);

  await page.goto("/knowledge");
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog", { name: "New note" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(note);
  await dialog.getByRole("textbox", { name: "Text" }).fill("1. Numbers, 2. Story");
  await dialog.getByRole("button", { name: "Add note" }).click();

  const details = page.getByRole("complementary", { name: "Details" });
  await expect(details.getByRole("textbox", { name: "Title" })).toHaveValue(note);
  await details.getByRole("button", { name: "Link…" }).click();
  await page.getByRole("combobox", { name: "Link to" }).fill(todo);
  await page.keyboard.press("Enter");
  await expect(details.getByRole("button", { name: new RegExp(`^${todo}`) })).toBeVisible();

  await page.reload();
  await page
    .getByRole("complementary", { name: "Details" })
    .getByRole("button", { name: new RegExp(`^${todo}`) })
    .click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(todo);
  await expect(
    page
      .getByRole("complementary", { name: "Details" })
      .getByRole("button", { name: new RegExp(`^${note}`) }),
  ).toBeVisible();
});

test("the theme choice persists", async ({ page }) => {
  await page.goto("/todos/inbox");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Match system" }).click();
});

test("works on a 375 px phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/todos/inbox");

  await page.getByRole("button", { name: "Open navigation" }).click();
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await sheet.getByRole("link", { name: /Upcoming/ }).click();

  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(sheet).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

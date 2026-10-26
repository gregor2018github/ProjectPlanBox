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
  await page.goto("/todos/today");

  await page.keyboard.press("q");
  await page.getByRole("textbox", { name: "New todo" }).fill(`${title} today !1`);
  await page.keyboard.press("Enter");

  const today = page.getByRole("list", { name: "Due today" });
  await expect(today).toContainText(title);
  await page.reload();
  await expect(page.getByRole("list", { name: "Due today" })).toContainText(title);
});

test("Home gives an overview and leads to Today", async ({ page }) => {
  await page.goto("/");
  const todos = page.getByRole("region", { name: "Todos" });
  await expect(todos).toBeVisible();
  await expect(page.getByRole("region", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Habits" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Knowledge" })).toBeVisible();

  await todos.getByRole("link", { name: "Todos" }).click();
  await expect(page).toHaveURL(/\/todos\/today$/);
});

test("complete, then undo with Ctrl+Z", async ({ page }) => {
  const title = `Water plants ${tag()}`;
  await page.goto("/todos/inbox");
  await addInline(page, title);

  await page.getByRole("checkbox", { name: `Complete “${title}”` }).click();
  await page.getByRole("button", { name: /^Completed today/ }).click();
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
  // The new order shows at once (optimistic); reload only once the server has it.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/move") && r.request().method() === "POST",
  );
  await page.mouse.up();

  await expect.poll(ours).toEqual([c, a, b]);
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect.poll(ours).toEqual([c, a, b]);
  // Rows stay plain list items (no role="button" wrapping the row's own buttons).
  await expect(inbox.getByRole("button", { name: new RegExp(`Complete “${a}”`) })).toHaveCount(0);
});

test("Today reorders by drag and drop, and the order survives a reload", async ({ page }) => {
  const id = tag();
  const [a, b, c] = [`Alpha ${id}`, `Bravo ${id}`, `Charlie ${id}`];
  await page.goto("/todos/today");
  for (const title of [a, b, c]) await addInline(page, title);
  const today = page.getByRole("list", { name: "Due today" });
  const ours = async () => (await titles(today)).filter((t) => t.endsWith(id));
  await expect.poll(ours).toEqual([a, b, c]);

  const from = await today.getByText(c, { exact: true }).boundingBox();
  const to = await today.getByText(a, { exact: true }).boundingBox();
  if (!from || !to) throw new Error("rows not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 15 });
  // The new order shows at once (optimistic); reload only once the server has it.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/todos/today-order") && r.request().method() === "POST",
  );
  await page.mouse.up();

  await expect.poll(ours).toEqual([c, a, b]);
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect.poll(ours).toEqual([c, a, b]);
});

test("My order: drag in from Unsorted, reorder, drag back out; the order survives a reload", async ({
  page,
}) => {
  const id = tag();
  const [a, b, c] = [`Alpha ${id}`, `Bravo ${id}`, `Charlie ${id}`];
  await page.goto("/todos/inbox");
  for (const title of [a, b, c]) await addInline(page, title);
  await page.goto("/todos/all");
  await page.getByRole("button", { name: "My order" }).click();
  const unsorted = page.getByRole("list", { name: "Unsorted todos" });
  const ranked = page.getByRole("list", { name: "My order" });
  const ours = async (list: Locator) => (await titles(list)).filter((t) => t.endsWith(id));
  const row = (list: Locator, title: string) => list.locator("li", { hasText: title });

  for (const title of [a, b]) {
    await row(unsorted, title).getByRole("button", { name: "Add to my order" }).click();
  }
  await expect.poll(() => ours(ranked)).toEqual([a, b]);

  // An unsorted todo dropped onto a ranked row goes in right there.
  await row(unsorted, c).scrollIntoViewIfNeeded();
  await dragOnto(page, row(unsorted, c), ranked.getByText(a, { exact: true }));
  await expect.poll(() => ours(ranked)).toEqual([c, a, b]);
  await expect(page.getByText("Drop here to put it last")).toHaveCount(0);
  // Let the drop animation finish before the next drag (a hand is never this quick).
  await page.waitForTimeout(300);

  // Ranked rows sort among themselves.
  const from = await ranked.getByText(b, { exact: true }).boundingBox();
  const to = await ranked.getByText(a, { exact: true }).boundingBox();
  if (!from || !to) throw new Error("rows not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => ours(ranked)).toEqual([c, b, a]);
  await page.waitForTimeout(300);

  // Dropped onto the Unsorted box, a todo leaves the ranking.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/todos/rank-order") && r.request().method() === "POST",
  );
  await dragOnto(
    page,
    ranked.getByText(a, { exact: true }),
    page.getByRole("region", { name: "Unsorted" }).getByText("Unsorted", { exact: true }),
  );
  await expect.poll(() => ours(ranked)).toEqual([c, b]);
  expect(await ours(unsorted)).toContain(a);
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect.poll(() => ours(page.getByRole("list", { name: "My order" }))).toEqual([c, b]);
});

/** Drags `source` onto the middle of `target` with the mouse. */
async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source or target not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test("a sidebar list drags into an area and back out; a click still opens it", async ({
  page,
  request,
}) => {
  const id = tag();
  const areaResponse = await request.post("/api/todos/areas", { data: { name: `Area ${id}` } });
  const area = (await areaResponse.json()) as { id: string };
  const listResponse = await request.post("/api/todos/lists", {
    data: { name: `List ${id}`, area_id: null },
  });
  const list = (await listResponse.json()) as { id: string };
  const areaOf = async () => {
    const lists = (await (await request.get("/api/todos/lists")).json()) as {
      id: string;
      area_id: string | null;
    }[];
    return lists.find((l) => l.id === list.id)?.area_id;
  };
  await page.goto("/todos/inbox");
  // The startup splash covers the page for its first moments.
  await expect(page.getByTestId("startup-splash")).toHaveCount(0);
  const listLink = page.getByRole("link", { name: new RegExp(`^List ${id}`) });

  await dragOnto(page, listLink, page.getByRole("link", { name: `Area ${id}` }));
  await expect.poll(areaOf).toBe(area.id);
  // A new drag cannot start until the drop animation has finished.
  await page.waitForTimeout(400);

  await dragOnto(page, listLink, page.getByText("Lists", { exact: true }));
  await expect.poll(areaOf).toBeNull();

  await listLink.click();
  await expect(page).toHaveURL(new RegExp(`/todos/lists/${list.id}$`));
});

test("a sidebar list dropped among another area's lists moves there without a crash", async ({
  page,
  request,
}) => {
  const id = tag();
  const makeArea = async (name: string) =>
    ((await (await request.post("/api/todos/areas", { data: { name } })).json()) as { id: string })
      .id;
  const makeList = async (name: string, areaId: string) =>
    (
      (await (
        await request.post("/api/todos/lists", { data: { name, area_id: areaId } })
      ).json()) as { id: string }
    ).id;
  const from = await makeArea(`From ${id}`);
  const to = await makeArea(`To ${id}`);
  const moving = await makeList(`Moving ${id}`, from);
  await makeList(`Staying ${id}`, from);
  await makeList(`Resident ${id}`, to);
  const areaOf = async () => {
    const lists = (await (await request.get("/api/todos/lists")).json()) as {
      id: string;
      area_id: string | null;
    }[];
    return lists.find((l) => l.id === moving)?.area_id;
  };
  await page.goto("/todos/inbox");
  await expect(page.getByTestId("startup-splash")).toHaveCount(0);

  // Hovering a list row of the other area lets dnd-kit move the row's DOM
  // node there; React must still be able to remove it from its old area.
  const resident = page.getByRole("link", { name: new RegExp(`^Resident ${id}`) });
  await resident.scrollIntoViewIfNeeded();
  await dragOnto(page, page.getByRole("link", { name: new RegExp(`^Moving ${id}`) }), resident);
  await expect.poll(areaOf).toBe(to);
  await page.waitForTimeout(400);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(`^Moving ${id}`) })).toHaveCount(1);
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

test("a page holds boxes typed anywhere, and links to a todo from both sides", async ({
  page,
  request,
}) => {
  const id = tag();
  const todo = `Write report ${id}`;
  const note = `Report outline ${id}`;
  await page.goto("/todos/inbox");
  await addInline(page, todo);

  await page.goto("/knowledge");
  await page.keyboard.press("e");
  const title = page.getByRole("textbox", { name: "Page title" });
  await expect(title).toBeFocused();
  await page.keyboard.type(note);
  await page.keyboard.press("Enter");

  // Click empty space on the page: a box starts there; type, then bold a word.
  await page.getByRole("region", { name: "Page" }).click({ position: { x: 200, y: 120 } });
  // Typed at once: the new box has the focus before the next key arrives.
  await page.keyboard.type("Numbers and ");
  const box = page.getByRole("textbox", { name: "Text box" });
  await expect(box).toContainText("Numbers and");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("story");
  await expect(box.locator("strong")).toHaveText("story");
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(box.locator("table")).toBeVisible();

  await page.getByRole("button", { name: "Details and links" }).click();
  const details = page.getByRole("complementary", { name: "Details" });
  await expect(details.getByRole("textbox", { name: "Title" })).toHaveValue(note);
  await details.getByRole("button", { name: "Link…" }).click();
  await page.getByRole("combobox", { name: "Link to" }).fill(todo);
  await page.keyboard.press("Enter");
  await expect(details.getByRole("button", { name: new RegExp(`^${todo}`) })).toBeVisible();

  // The page saves a moment after the last edit.
  await expect
    .poll(async () => {
      const entries = (await (await request.get("/api/knowledge/entries")).json()) as {
        title: string;
        body: string;
      }[];
      return entries.find((e) => e.title === note)?.body;
    })
    .toContain("Numbers and story");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Text box" }).locator("strong")).toHaveText(
    "story",
  );
  await expect(page.getByRole("textbox", { name: "Text box" }).locator("table")).toBeVisible();
  await page
    .getByRole("complementary", { name: "Details" })
    .getByRole("button", { name: new RegExp(`^${todo}`) })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Details" }).getByRole("textbox", { name: "Title" }),
  ).toHaveValue(todo);
  await expect(
    page
      .getByRole("complementary", { name: "Details" })
      .getByRole("button", { name: new RegExp(`^${note}`) }),
  ).toBeVisible();
});

test("the palette finds a todo by a word in its notes and opens it", async ({ page, request }) => {
  const word = `zebra${tag()}`;
  const title = `Search target ${tag()}`;
  await request.post("/api/todos/items", { data: { title, notes: `Mentions ${word} here` } });
  await page.goto("/knowledge");

  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search commands" }).fill(word);
  const hit = page.getByRole("option", { name: new RegExp(title) });
  await expect(hit).toContainText("Inbox");
  await hit.click();

  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);
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

test("draws on a knowledge page, moves the drawing, and keeps it after a reload", async ({
  page,
}) => {
  await page.goto("/knowledge");
  await page.keyboard.press("e");
  await expect(page.getByRole("textbox", { name: "Page title" })).toBeFocused();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByRole("button", { name: "Red pen" }).click();
  await page.getByRole("button", { name: "Thickness 8 px" }).click();

  const area = page.getByRole("region", { name: "Page" });
  const box = await area.boundingBox();
  if (box === null) throw new Error("no page area");
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  await page.mouse.move(...at(100, 100));
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(...at(100 + i * 15, 100 + i * 8));
  await page.mouse.up();
  // Nearby: the same drawing.
  await page.mouse.move(...at(120, 160));
  await page.mouse.down();
  await page.mouse.move(...at(220, 160));
  await page.mouse.up();
  await page.keyboard.press("Escape");

  const drawing = page.locator("[data-drawing-id]");
  await expect(drawing).toHaveCount(1);
  await expect(drawing.locator("path.stroke-ink-red")).toHaveCount(2);

  // Pick it by a stroke and drag it 200 px right.
  await page.mouse.move(...at(220, 160));
  await page.mouse.down();
  await page.mouse.move(...at(320, 160));
  await page.mouse.move(...at(420, 160));
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /^Drawing \(drag/ })).toBeFocused();
  const moved = await drawing.boundingBox();

  await page.reload();
  await expect(page.locator("[data-drawing-id] path.stroke-ink-red")).toHaveCount(2);
  const after = await page.locator("[data-drawing-id]").boundingBox();
  expect(after?.x).toBeCloseTo(moved?.x ?? 0, 0);
  expect(moved?.x ?? 0).toBeGreaterThan(box.x + 250);
});

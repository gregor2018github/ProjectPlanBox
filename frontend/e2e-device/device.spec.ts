import { expect, test, type Locator, type Page } from "@playwright/test";

/** One finger: a point in the viewport, in CSS pixels. */
interface Point {
  x: number;
  y: number;
}

/**
 * A real touch drag (CDP touch events, so pointerType is "touch"): press,
 * optionally wobble like a finger while holding, wait, slide onto `to` and
 * lift. Returns how many menus were open just before lifting.
 */
async function touchDrag(
  page: Page,
  from: Locator,
  to: Locator,
  options: { hold: number; wobble?: readonly Point[] },
): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const centre = async (locator: Locator): Promise<Point> => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("not visible");
    return { x: box.x + box.width / 3, y: box.y + box.height / 2 };
  };
  const start = await centre(from);
  const end = await centre(to);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", at: Point) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: at.x, y: at.y, id: 1 }],
    });
  await touch("touchStart", start);
  for (const d of options.wobble ?? []) {
    await page.waitForTimeout(40);
    await touch("touchMove", { x: start.x + d.x, y: start.y + d.y });
  }
  await page.waitForTimeout(options.hold);
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", {
      x: start.x + ((end.x - start.x) * i) / steps,
      y: start.y + ((end.y - start.y) * i) / steps,
    });
    await page.waitForTimeout(30);
  }
  const menus = await page.getByRole("menu").count();
  await touch("touchEnd", end);
  return menus;
}

/** Three todos in All todos → My order: Alpha and Bravo ranked, Charlie unsorted. */
async function myOrderWithOneUnsorted(page: Page) {
  await page.goto("/todos/inbox");
  for (const title of ["Alpha", "Bravo", "Charlie"]) {
    await page.getByRole("button", { name: "Add todo" }).first().click();
    const input = page.getByRole("textbox", { name: "New todo" });
    await input.fill(title);
    await input.press("Enter");
    await input.press("Escape");
    await expect(page.getByRole("list", { name: "Inbox" })).toContainText(title);
  }
  await page.goto("/todos/all");
  await page.getByRole("button", { name: "My order" }).click();
  const unsorted = page.getByRole("list", { name: "Unsorted todos" });
  const ranked = page.getByRole("list", { name: "My order" });
  for (const title of ["Alpha", "Bravo"]) {
    await unsorted
      .locator("li", { hasText: title })
      .getByRole("button", { name: "Add to my order" })
      .click();
  }
  await expect(unsorted.locator("li")).toHaveCount(1);
  // Let the rows that left Unsorted finish animating before measuring.
  await page.waitForTimeout(500);
  return { unsorted, ranked };
}

const rankedTitles = (ranked: Locator) =>
  ranked.locator("li").evaluateAll((rows) => rows.map((r) => r.textContent));

test("the phone app keeps todos in its own database across reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/todos/inbox");

  await page.getByRole("button", { name: "Add todo" }).first().click();
  const input = page.getByRole("textbox", { name: "New todo" });
  await input.fill("Buy milk on the phone");
  await input.press("Enter");
  await input.press("Escape");
  await expect(page.getByRole("list", { name: "Inbox" })).toContainText("Buy milk on the phone");

  await page.reload();
  await expect(page.getByRole("list", { name: "Inbox" })).toContainText("Buy milk on the phone");
  expect(errors).toEqual([]);
});

test("the Data page shows the phone's backups and Google Drive sync", async ({ page }) => {
  await page.goto("/data");
  await expect(page.getByRole("heading", { name: "Data" })).toBeVisible();
  await expect(page.getByText(/daily/).first()).toBeVisible();
});

test("the navigation stays reachable after an Insights jump link", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/insights");
  await expect(page.getByText("Loading…")).toHaveCount(0);
  const links = page.getByRole("navigation", { name: "Insights sections" }).getByRole("link");
  await links.last().click();
  // Scrolling a section into view must move only the content, never the shell.
  // (click() would scroll the button back into view, so check it first.)
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeInViewport({ ratio: 1 });
  await menu.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
});

test("the calendar pane fills the phone screen, nothing cut off", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const pane = page.getByRole("complementary", { name: "Calendar" });
  await expect(pane.getByRole("columnheader", { name: "Su" })).toBeInViewport({ ratio: 1 });
  const full = pane.getByRole("button", { name: "Open full calendar" });
  await expect(full).toBeInViewport({ ratio: 1 });
  await expect(pane.getByRole("button", { name: "Close calendar" })).toBeInViewport({ ratio: 1 });

  await full.click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(pane).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button", { name: "New event" })).toBeInViewport({
    ratio: 1,
  });
});

test("a touch drag closes the long-press menu and drops where the finger lifts", async ({
  page,
}) => {
  const { unsorted, ranked } = await myOrderWithOneUnsorted(page);
  // Held past the long-press: the menu would open, but the drag moves on.
  const menus = await touchDrag(page, unsorted.getByText("Charlie"), ranked.getByText("Alpha"), {
    hold: 600,
  });
  expect(menus).toBe(0);
  await expect
    .poll(() => rankedTitles(ranked))
    .toEqual([
      expect.stringContaining("Charlie"),
      expect.stringContaining("Alpha"),
      expect.stringContaining("Bravo"),
    ]);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("a finger that wobbles while holding still picks the todo up", async ({ page }) => {
  const { unsorted, ranked } = await myOrderWithOneUnsorted(page);
  // A real finger drifts a few pixels during the hold.
  const wobble = [
    { x: 3, y: 4 },
    { x: 6, y: 7 },
    { x: 4, y: 9 },
    { x: 7, y: 6 },
  ];
  const menus = await touchDrag(page, unsorted.getByText("Charlie"), ranked.getByText("Bravo"), {
    hold: 400,
    wobble,
  });
  expect(menus).toBe(0);
  await expect
    .poll(() => rankedTitles(ranked))
    .toEqual([
      expect.stringContaining("Alpha"),
      expect.stringContaining("Charlie"),
      expect.stringContaining("Bravo"),
    ]);
});

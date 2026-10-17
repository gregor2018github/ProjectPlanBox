import { expect, test, type CDPSession, type Page } from "@playwright/test";

/** A suffix that keeps each test's todos apart (they share one server). */
const tag = () => Math.random().toString(36).slice(2, 7);

// A phone: touch input, narrow, coarse pointer.
test.use({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });

/** Real touch input through the DevTools protocol (Playwright has no touch drag). */
async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  x: number,
  y: number,
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y }],
  });
}

/** Swipes the row titled `title` by `dx` px; `beforeLift` runs mid-swipe. */
async function swipe(page: Page, title: string, dx: number, beforeLift?: () => Promise<void>) {
  const row = page.getByText(title, { exact: true });
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  if (box === null) throw new Error(`no row for ${title}`);
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const x0 = 200;
  await touch(cdp, "touchStart", x0, y);
  for (let i = 1; i <= 8; i += 1) await touch(cdp, "touchMove", x0 + (dx * i) / 8, y);
  await beforeLift?.();
  await touch(cdp, "touchEnd", x0 + dx, y);
}

async function addToInbox(page: Page, title: string): Promise<void> {
  await page.goto("/todos/inbox");
  await page.getByRole("button", { name: "Add todo" }).first().click();
  const input = page.getByRole("textbox", { name: "New todo" });
  await input.fill(title);
  await input.press("Enter");
  await input.press("Escape");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test("a todo swiped right goes into Today, swiped left asks to delete", async ({ page }, info) => {
  const title = `Swipe me ${tag()}`;
  await addToInbox(page, title);

  await swipe(page, title, 150, async () => {
    const panel = page.locator("[data-swipe-panel='right']");
    await expect(panel).toHaveAttribute("data-armed", "");
    await expect(panel).toContainText("Add to Today");
    await expect(page.locator("[data-swipe-panel='left']")).toHaveCSS("width", "0px");
    await page.screenshot({ path: info.outputPath("swipe-right.png") });
  });
  await expect(page.getByText(`Added “${title}” to Today`).first()).toBeVisible();
  // No detail panel opened by the swipe's end.
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);

  await page.goto("/todos/today");
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await swipe(page, title, -150, async () => {
    const panel = page.locator("[data-swipe-panel='left']");
    await expect(panel).toHaveAttribute("data-armed", "");
    await expect(panel).toContainText("Delete");
    await expect(page.locator("[data-swipe-panel='right']")).toHaveCSS("width", "0px");
    await page.screenshot({ path: info.outputPath("swipe-left.png") });
  });
  const question = page.getByRole("dialog", { name: "Delete todo?" });
  await question.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});

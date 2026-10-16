import { expect, test } from "@playwright/test";

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

import { expect, test } from "@playwright/test";

/** A suffix that keeps each test's habits apart (they share one server). */
const tag = () => Math.random().toString(36).slice(2, 7);

test("a new habit is checked off today, and the streak survives a reload", async ({ page }) => {
  const name = `Stretch ${tag()}`;
  await page.goto("/habits");

  await page.getByRole("main").getByRole("button", { name: "New habit" }).click();
  await page.getByRole("dialog", { name: "New habit" }).getByRole("textbox").fill(name);
  await page.keyboard.press("Enter");

  const row = page.getByRole("listitem").filter({ hasText: name });
  const todayButton = row.getByRole("button", { name: new RegExp(`^${name} on `) }).last();
  await todayButton.click();
  await expect(todayButton).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByLabel("Current streak: 1")).toBeVisible();

  await page.reload();
  const reloaded = page.getByRole("listitem").filter({ hasText: name });
  await expect(reloaded.getByLabel("Current streak: 1")).toBeVisible();
});

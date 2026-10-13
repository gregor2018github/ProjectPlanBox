import { expect, test } from "@playwright/test";

test("a manual backup shows up in the list, and an export downloads", async ({ page }) => {
  await page.goto("/data");

  const list = page.getByRole("list", { name: "Backups on this PC" });
  const before = await list
    .getByRole("listitem")
    .count()
    .catch(() => 0);
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByText("Backup saved")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(before + 1);
  await expect(list.getByText("Manual").first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download export" }).click();
  expect((await download).suggestedFilename()).toMatch(/^planbox-export-\d{8}T\d{9}Z\.json$/);
});

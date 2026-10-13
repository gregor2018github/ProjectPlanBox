import { expect, test } from "@playwright/test";

test("the app is installable: manifest, icons and a service worker", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const body = (await manifest.json()) as { display: string; icons: { src: string }[] };
  expect(body.display).toBe("standalone");
  for (const icon of body.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }

  // 127.0.0.1 counts as a secure context, so the worker registers here as on https.
  await page.goto("/");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
});

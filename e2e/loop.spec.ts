import { expect, test, type Page } from "@playwright/test";

const SCENE = /\/s\/[\w-]+$/;

async function enterWorld(page: Page) {
  await page.goto("/play/yellow-bedroom");
  await page.waitForURL(SCENE, { timeout: 4 * 60 * 1000 });
  const things = page.getByRole("list", { name: "Things in this scene" }).getByRole("button");
  await expect(things.first()).toBeAttached({ timeout: 2 * 60 * 1000 });
  return things;
}

test("tap, choose, watch, arrive, and replay from cache", async ({ page }) => {
  const things = await enterWorld(page);
  const start = page.url();
  expect(await things.count()).toBeGreaterThanOrEqual(3);

  // Tap the first object and take its first suggested action.
  await things.first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const action = sheet.getByRole("button").filter({ hasText: /credit|free/ }).first();
  await expect(action).toBeVisible({ timeout: 60_000 });
  const actionText = (await action.textContent())!.replace(/(1 credit|▶ free.*)$/, "").trim();
  await action.click();

  // Narration shows while generating (or the clip plays right away if cached), then we arrive.
  await page.waitForURL((u) => SCENE.test(u.pathname) && u.href !== start, { timeout: 6 * 60 * 1000 });
  await expect(page.getByRole("list", { name: "Things in this scene" }).getByRole("button").first()).toBeAttached({ timeout: 2 * 60 * 1000 });

  // Back to the start: the same action is now a free cached replay.
  await page.goto(start);
  const again = await enterWorld(page);
  await again.first().click();
  const replay = page.getByRole("dialog").getByRole("button", { name: new RegExp(actionText.slice(0, 20)) });
  await expect(replay).toContainText("free", { timeout: 30_000 });
  const t0 = Date.now();
  await replay.click();
  await page.waitForURL((u) => SCENE.test(u.pathname) && u.href !== start, { timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(30_000);
});

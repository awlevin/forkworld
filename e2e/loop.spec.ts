import { expect, test, type Page } from "@playwright/test";

const SCENE = /\/s\/([\w-]+)$/;

/** Enter the curated world and wait until its objects are tappable. */
async function enterWorld(page: Page) {
  await page.goto("/play/yellow-bedroom");
  await page.waitForURL(SCENE, { timeout: 4 * 60 * 1000 });
  await expect(things(page).first()).toBeAttached({ timeout: 2 * 60 * 1000 });
}

const things = (page: Page) => page.getByRole("list", { name: "Things in this scene" }).getByRole("button");

/** Tap an object where it is on screen, the way a player would. */
async function tapObject(page: Page, index = 0) {
  const sceneId = SCENE.exec(new URL(page.url()).pathname)![1];
  const scene = await (await page.request.get(`/api/scenes/${sceneId}`)).json();
  // The biggest object is the easiest to hit inside its outline.
  const obj = [...scene.objects].sort((a, b) => b.area - a.area)[index];
  const box = (await page.locator("img[draggable=false]").first().boundingBox())!;
  const ring: [number, number][] = obj.polygons[0];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  await page.touchscreen.tap(box.x + cx * box.width, box.y + cy * box.height);
  return obj.label as string;
}

/** The sheet's action buttons once suggestions have loaded (not Close or Go). */
const actions = (page: Page) =>
  page.getByRole("dialog").getByRole("button").filter({ hasText: /\b(1 credit|free)\b/ });

test("tap, choose, watch, arrive, and replay from cache", async ({ page }) => {
  await enterWorld(page);
  const start = page.url();
  expect(await things(page).count()).toBeGreaterThanOrEqual(3);

  await tapObject(page);
  await expect(actions(page).first()).toBeVisible({ timeout: 60_000 });
  const first = actions(page).first();
  const actionText = (await first.textContent())!.replace(/(1 credit|▶ free.*)$/, "").trim();
  await first.click();

  // Generating (or an instant replay), then the clip, then the next scene with its own objects.
  await page.waitForURL((u) => SCENE.test(u.pathname) && u.href !== start, { timeout: 6 * 60 * 1000 });
  await expect(things(page).first()).toBeAttached({ timeout: 2 * 60 * 1000 });

  // The pause screen shows what that scene cost.
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("What making this scene cost")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Resume" }).click();

  // Back at the start, the same action is now a free cached replay.
  await page.goto(start);
  await expect(things(page).first()).toBeAttached({ timeout: 60_000 });
  await tapObject(page);
  const replay = page.getByRole("dialog").getByRole("button", { name: new RegExp(escape(actionText.slice(0, 20))) });
  await expect(replay).toContainText("free", { timeout: 30_000 });
  const t0 = Date.now();
  await replay.click();
  await page.waitForURL((u) => SCENE.test(u.pathname) && u.href !== start, { timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(30_000);
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

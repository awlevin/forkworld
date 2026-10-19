import { chromium, devices } from "@playwright/test";
const out = process.argv[2];
const label = process.argv[3] ?? "yellow wooden bed";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ...devices["iPhone 14"] });
const page = await ctx.newPage();
const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
await page.goto("https://forkworld-eight.vercel.app/play/yellow-bedroom");
await page.waitForURL(/\/s\//, { timeout: 60000 });
const start = page.url();
const things = page.getByRole("list", { name: "Things in this scene" }).getByRole("button");
await things.first().waitFor({ state: "attached", timeout: 60000 });
await page.waitForTimeout(2000);
// Tap the object where it is on screen: inside its outline, mapped through the image's on-screen box.
const scene = await (await page.request.get("https://forkworld-eight.vercel.app/api/scenes/" + start.split("/s/")[1])).json();
const obj = scene.objects.find((o) => o.label === label);
const box = await page.locator("img[draggable=false]").first().boundingBox();
const poly = obj.polygons[0];
const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
await page.touchscreen.tap(box.x + cx * box.width, box.y + cy * box.height);
const sheet = page.getByRole("dialog");
await sheet.getByText(/1 credit|free/).first().waitFor({ timeout: 60000 });
console.log(t(), "actions:", (await sheet.getByRole("button").allTextContents()).join(" | "));
await page.screenshot({ path: `${out}/1-sheet.png` });
await sheet.getByRole("button").filter({ hasText: /1 credit|free/ }).first().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: `${out}/2-generating.png` });
console.log(t(), "generating screenshot");
let shotVideo = false;
const deadline = Date.now() + 300000;
while (Date.now() < deadline && page.url() === start) {
  if (!shotVideo && (await page.locator("video").count())) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/3-video.png` });
    console.log(t(), "video playing");
    shotVideo = true;
  }
  const err = await page.getByText(/went wrong|didn't work|stalled/).count();
  if (err) { console.log(t(), "error shown:", await page.getByText(/went wrong|didn't work|stalled/).first().textContent()); break; }
  await page.waitForTimeout(500);
}
console.log(t(), "url:", page.url());
await things.first().waitFor({ state: "attached", timeout: 120000 }).catch(() => console.log("no objects yet"));
console.log(t(), "objects:", (await things.allTextContents()).join(" | "));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/4-arrived.png` });
await page.getByRole("button", { name: "Pause" }).click();
await page.getByText("What making this scene cost").waitFor({ timeout: 20000 }).catch(() => {});
await page.screenshot({ path: `${out}/5-pause.png` });
await page.getByRole("dialog", { name: "Paused" }).evaluate((el) => el.scrollTo(0, el.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/6-pause-costs.png` });
console.log(t(), "done");
await browser.close();

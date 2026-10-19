import "server-only";
import sharp from "sharp";
import type { CostCtx } from "@/lib/cost";
import { readBytes, store } from "@/lib/storage";
import type { OutcomePlan, WorldBible } from "@/lib/types";
import { aiConfig } from "./config";
import { runFal } from "./fal";
import { renderPrompt } from "./prompts";

/**
 * Scenes are portrait 9:16 so they fill a phone screen, and every image is
 * stored at exactly this size so video frames and stills line up.
 */
export const SCENE_W = 720;
export const SCENE_H = 1280;
const ASPECT = "9:16";

type FalImages = { images: { url: string }[] };

export type Keyframe = { url: string; width: number; height: number };

/** Step 5: the next scene image, edited from the current one so style and characters carry over. */
export async function generateKeyframe(opts: {
  currentUrl: string;
  plan: OutcomePlan;
  bible: WorldBible;
  key: string;
  ctx: CostCtx;
}): Promise<Keyframe> {
  const prompt = renderPrompt("keyframe", {
    imagePrompt: opts.plan.imagePrompt,
    artStyle: opts.bible.artStyle,
    camera: opts.bible.camera,
  }).user;
  return editImage("keyframe", prompt, opts.currentUrl, opts.key, opts.ctx);
}

/**
 * A seed (upload or curated painting) becomes the root scene. Unless it is
 * already 9:16, the image model reframes it: the original stays intact and the
 * scene is extended above and below in the same style.
 */
export async function prepareSeed(seedUrl: string, key: string, ctx: CostCtx): Promise<Keyframe> {
  const bytes = await readBytes(seedUrl);
  const meta = await sharp(bytes).metadata();
  const aspect = (meta.width ?? 9) / (meta.height ?? 16);
  if (Math.abs(aspect - SCENE_W / SCENE_H) < 0.03) return saveScene(bytes, key);
  // Bundled seeds aren't reachable by fal; put a copy in Blob first.
  const source = seedUrl.startsWith("/") ? await store(`${key}-source.jpg`, bytes, "image/jpeg") : seedUrl;
  return editImage(
    "seed-reframe",
    "Reframe this picture as a tall 9:16 portrait. Keep everything already in it exactly as it is, unchanged and uncropped, and continue the scene naturally above and below it in the identical style, palette, brushwork and lighting. No borders, frames, text or letterboxing.",
    source,
    key,
    ctx,
  );
}

async function editImage(step: string, prompt: string, referenceUrl: string, key: string, ctx: CostCtx) {
  const out = await runFal<FalImages>(
    step,
    aiConfig().image,
    { prompt, image_urls: [referenceUrl], aspect_ratio: ASPECT, output_format: "jpeg", resolution: "1K", num_images: 1 },
    ctx,
  );
  if (!out.images?.[0]) throw new Error("image model returned no image");
  return saveScene(await readBytes(out.images[0].url), key);
}

/** Store at exactly SCENE_W×SCENE_H (the model's output can be off by a few pixels). */
async function saveScene(bytes: Buffer, key: string): Promise<Keyframe> {
  const jpeg = await sharp(bytes).rotate().resize(SCENE_W, SCENE_H, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  const url = await store(`${key}.jpg`, jpeg, "image/jpeg");
  return { url, width: SCENE_W, height: SCENE_H };
}

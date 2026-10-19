import "server-only";
import type { CostCtx } from "@/lib/cost";
import { storeFromUrl } from "@/lib/storage";
import type { WorldBible } from "@/lib/types";
import { aiConfig } from "./config";
import { runFal } from "./fal";
import { renderPrompt } from "./prompts";

type Adapter = (first: string, last: string, prompt: string, seconds: number) => Record<string, unknown>;

const veo: Adapter = (first, last, prompt, seconds) => ({
  first_frame_url: first,
  last_frame_url: last,
  prompt,
  duration: seconds <= 4 ? "4s" : seconds <= 6 ? "6s" : "8s",
  resolution: "720p",
  aspect_ratio: "9:16",
  generate_audio: false,
});

/**
 * First-frame/last-frame video models on fal. Each names the two frames
 * differently; to add a model, add an entry here and its price in pricing.ts.
 */
const ADAPTERS: Record<string, Adapter> = {
  "fal-ai/veo3.1/fast/first-last-frame-to-video": veo,
  "fal-ai/veo3.1/first-last-frame-to-video": veo,
  "fal-ai/kling-video/v2.1/pro/image-to-video": (first, last, prompt) => ({
    image_url: first,
    tail_image_url: last,
    prompt,
    duration: "5",
  }),
  "fal-ai/kling-video/v3/pro/image-to-video": (first, last, prompt, seconds) => ({
    start_image_url: first,
    end_image_url: last,
    prompt,
    duration: String(Math.min(15, Math.max(3, seconds))),
    generate_audio: false,
  }),
  "fal-ai/minimax/hailuo-02/pro/image-to-video": (first, last, prompt) => ({
    image_url: first,
    end_image_url: last,
    prompt,
  }),
};

export const videoSeconds = () => Number(process.env.VIDEO_SECONDS ?? 4);

/** Step 6: animate from the current scene to the next keyframe. */
export async function generateTransition(opts: {
  fromUrl: string;
  toUrl: string;
  motionPrompt: string;
  bible: WorldBible;
  key: string;
  ctx: CostCtx;
}): Promise<string> {
  const model = aiConfig().video;
  const adapter = ADAPTERS[model];
  if (!adapter) throw new Error(`No video adapter for ${model}; add one in src/lib/ai/video.ts`);
  const prompt = renderPrompt("motion", { motionPrompt: opts.motionPrompt, artStyle: opts.bible.artStyle }).user;
  const out = await runFal<{ video: { url: string } }>("video", model, adapter(opts.fromUrl, opts.toUrl, prompt, videoSeconds()), opts.ctx);
  if (!out.video?.url) throw new Error("video model returned no video");
  return storeFromUrl(`${opts.key}.mp4`, out.video.url, "video/mp4");
}

import "server-only";
import sharp from "sharp";
import { logCost, type CostCtx } from "@/lib/cost";
import { requireEnv } from "@/lib/env";
import { aiConfig } from "./config";

export type Moderation = { flagged: boolean; categories: string[] };

/** OpenAI's moderation endpoint (free), for uploads and typed actions. See aiConfig().moderation. */
async function moderate(input: unknown, ctx: CostCtx): Promise<Moderation> {
  const model = aiConfig().moderation;
  if (model === "llm") return { flagged: false, categories: [] };
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requireEnv("OPENAI_API_KEY", "OpenAI moderation")}`,
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`moderation failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { results: { flagged: boolean; categories: Record<string, boolean> }[] };
  await logCost(ctx, { step: "moderation", model, usd: 0, durationMs: Date.now() - started });
  const r = json.results[0];
  return { flagged: r.flagged, categories: Object.keys(r.categories).filter((k) => r.categories[k]) };
}

export function moderateText(text: string, ctx: CostCtx) {
  return moderate(text, ctx);
}

export async function moderateImage(bytes: Buffer, ctx: CostCtx) {
  const small = await sharp(bytes).resize(768, 768, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return moderate([{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}` } }], ctx);
}

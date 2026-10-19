import "server-only";
import type { CostCtx } from "@/lib/cost";
import { worldBibleSchema, type WorldBible } from "@/lib/types";
import { structured } from "./llm";

/** Step 1: the world bible, from the seed image. */
export async function generateWorldBible(imageUrl: string, opts: { hint?: string; ctx: CostCtx }): Promise<WorldBible> {
  return structured({
    step: "world-bible",
    tier: "llm",
    prompt: "world-bible",
    vars: { hint: opts.hint || "none" },
    images: [{ url: imageUrl, maxSide: 1280 }],
    schema: worldBibleSchema,
    ctx: opts.ctx,
  });
}

/** The bible as compact text for later prompts. storySoFar is passed separately, per scene. */
export function bibleText(b: WorldBible) {
  return [
    `Title: ${b.title}`,
    `Setting: ${b.setting}`,
    `Tone: ${b.tone}`,
    `Art style: ${b.artStyle}`,
    `Camera: ${b.camera}`,
    `Characters: ${b.characters.map((c) => `${c.name} (${c.description})`).join("; ") || "none"}`,
    `Rules: ${b.rules.map((r) => `- ${r}`).join(" ")}`,
  ].join("\n");
}

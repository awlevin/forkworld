import "server-only";
import type { CostCtx } from "@/lib/cost";
import { outcomePlanSchema, type OutcomePlan, type SceneObject, type WorldBible } from "@/lib/types";
import { structured } from "./llm";
import { bibleText } from "./world-bible";

/** Step 4: narration, next-scene image prompt, motion prompt and the updated story. */
export async function planOutcome(opts: {
  imageUrl: string;
  object: SceneObject;
  action: string;
  bible: WorldBible;
  storySoFar: string;
  ctx: CostCtx;
}): Promise<OutcomePlan> {
  const box = opts.object.bbox.map((n) => n.toFixed(2)).join(", ");
  return structured({
    step: "outcome",
    tier: "llm",
    prompt: "outcome",
    vars: {
      worldBible: bibleText(opts.bible),
      storySoFar: opts.storySoFar,
      objectLabel: opts.object.label,
      objectBox: box,
      action: opts.action,
    },
    images: [{ url: opts.imageUrl, maxSide: 1280 }],
    schema: outcomePlanSchema,
    ctx: opts.ctx,
  });
}

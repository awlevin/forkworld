import "server-only";
import { z } from "zod";
import type { CostCtx } from "@/lib/cost";
import { readBytes } from "@/lib/storage";
import { actionSuggestionSchema, type ActionSuggestion, type SceneObject, type WorldBible } from "@/lib/types";
import { objectCrop } from "@/lib/vision/images";
import { structured } from "./llm";
import { bibleText } from "./world-bible";

const actionsSchema = z.object({ actions: z.array(actionSuggestionSchema).length(3) });

/** Step 3a: three varied actions for a clicked object. */
export async function proposeActions(opts: {
  imageUrl: string;
  object: SceneObject;
  others: SceneObject[];
  bible: WorldBible;
  storySoFar: string;
  explored: string[];
  ctx: CostCtx;
}): Promise<ActionSuggestion[]> {
  const image = await readBytes(opts.imageUrl);
  const { actions } = await structured({
    step: "actions",
    tier: "llmFast",
    prompt: "actions",
    vars: {
      worldBible: bibleText(opts.bible),
      storySoFar: opts.storySoFar,
      objectLabel: opts.object.label,
      otherObjects: opts.others.map((o) => o.label).join(", ") || "nothing else",
      explored: opts.explored.length ? opts.explored.join("; ") : "nothing yet",
    },
    images: [{ bytes: image }, { bytes: await objectCrop(image, opts.object.bbox) }],
    schema: actionsSchema,
    ctx: opts.ctx,
  });
  return actions.map((a) => ({ ...a, text: tidy(a.text) }));
}

const verdictSchema = z.object({
  verdict: z.enum(["ok", "rewrite", "reject"]),
  action: z.string(),
  sameAs: z.number().int().nullable(),
  reason: z.string(),
});

export type ActionVerdict =
  | { ok: true; action: string; sameAs: string | null }
  | { ok: false; reason: string };

/**
 * Step 3b: check a typed action against the world and content policy. If it
 * means the same as an existing action, return that one so it replays from cache.
 */
export async function validateAction(opts: {
  input: string;
  object: SceneObject;
  bible: WorldBible;
  existing: string[];
  ctx: CostCtx;
}): Promise<ActionVerdict> {
  const input = opts.input.trim().replace(/\s+/g, " ").slice(0, 140);
  if (input.length < 2) return { ok: false, reason: "Type a few words about what you want to do." };
  const exact = opts.existing.find((e) => actionKey(e) === actionKey(input));
  if (exact) return { ok: true, action: exact, sameAs: exact };

  const v = await structured({
    step: "validate",
    tier: "llmFast",
    prompt: "validate-action",
    vars: {
      worldBible: bibleText(opts.bible),
      objectLabel: opts.object.label,
      input: input.replace(/"/g, "'"),
      existing: opts.existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "none",
    },
    schema: verdictSchema,
    ctx: opts.ctx,
  });
  if (v.verdict === "reject") return { ok: false, reason: v.reason || "That doesn't work in this world. Try something else." };
  const same = v.sameAs ? opts.existing[v.sameAs - 1] : undefined;
  return { ok: true, action: same ?? tidy(v.action || input), sameAs: same ?? null };
}

/** Cache key for an action: case, punctuation and spacing don't make a new branch. */
export function actionKey(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tidy(text: string) {
  const t = text.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

import "server-only";
import { z } from "zod";
import type { CostCtx } from "@/lib/cost";
import { readBytes } from "@/lib/storage";
import type { SceneObject, WorldBible } from "@/lib/types";
import { contactSheet, maskToGrid } from "@/lib/vision/images";
import { area, bbox, iou, polygons, type Grid } from "@/lib/vision/mask";
import { aiConfig } from "./config";
import { runFal } from "./fal";
import { structured } from "./llm";

const MIN_OBJECTS = 5;
const MAX_OBJECTS = 12;
const MAX_CANDIDATES = 14;
/** Masks smaller than this fraction of the image are too fiddly to click; larger ones are background. */
const MIN_AREA = 0.003;
const MAX_AREA = 0.6;
const DUPLICATE_IOU = 0.6;

const proposalSchema = z.object({
  candidates: z
    .array(
      z.object({
        label: z.string(),
        samPrompt: z.string(),
        box: z.array(z.number()).length(4).describe("[xMin, yMin, xMax, yMax] in 0-1000"),
        interest: z.number().min(1).max(5),
      }),
    )
    .max(MAX_CANDIDATES + 4),
});

const labelSchema = z.object({
  tiles: z.array(z.object({ tile: z.number().int(), keep: z.boolean(), label: z.string(), interest: z.number().min(1).max(5) })),
});

type SamOutput = {
  masks: { url: string }[];
  metadata?: { index: number; box?: number[] | null; score?: number | null }[] | null;
  boxes?: (number[] | null)[] | null;
};

type Candidate = { label: string; interest: number; grid: Grid; box: [number, number, number, number]; area: number };

/**
 * Step 2: the clickable objects in a scene.
 *
 * SAM 3 segments by concept ("chair"), so the LLM first proposes what is worth
 * clicking, with a text prompt and a rough box for each. SAM 3 returns masks
 * for each prompt; we keep the instance that matches the box, drop tiny,
 * huge and duplicate masks, then the LLM reviews a contact sheet of the masks
 * to name each one and throw out bad ones. 5 to 12 objects survive.
 */
export async function segmentScene(opts: {
  imageUrl: string;
  width: number;
  height: number;
  bible: WorldBible;
  storySoFar: string;
  ctx: CostCtx;
}): Promise<SceneObject[]> {
  const aspect = opts.width / opts.height;
  const { candidates } = await structured({
    step: "segment-propose",
    tier: "llm",
    prompt: "segment-propose",
    vars: {
      worldTitle: opts.bible.title,
      artStyle: opts.bible.artStyle,
      storySoFar: opts.storySoFar,
      maxCandidates: MAX_CANDIDATES,
    },
    images: [{ url: opts.imageUrl }],
    schema: proposalSchema,
    ctx: opts.ctx,
  });

  const imageUrl = opts.imageUrl;
  const endpoint = aiConfig().segment;
  const settled = await Promise.allSettled(
    candidates.slice(0, MAX_CANDIDATES).map(async (c): Promise<Candidate | null> => {
      const out = await runFal<SamOutput>(
        "segment",
        endpoint,
        {
          image_url: imageUrl,
          prompt: c.samPrompt,
          apply_mask: false,
          return_multiple_masks: true,
          max_masks: 4,
          include_boxes: true,
          include_scores: true,
          output_format: "png",
        },
        opts.ctx,
      );
      if (!out.masks?.length) return null;
      const want = toXywh(c.box);
      const idx = pickInstance(out, want);
      const grid = await maskToGrid(await readBytes(out.masks[idx].url), aspect);
      const a = area(grid);
      if (a < MIN_AREA || a > MAX_AREA) return null;
      return { label: c.label, interest: c.interest, grid, box: bbox(grid), area: a };
    }),
  );
  const masks = settled.flatMap((s) => (s.status === "fulfilled" && s.value ? [s.value] : []));
  if (!masks.length) throw new Error("segmentation found no usable masks");

  // Most interesting first, then drop masks that duplicate one we kept.
  masks.sort((a, b) => b.interest - a.interest);
  const unique: Candidate[] = [];
  for (const m of masks) if (!unique.some((u) => iou(u.grid, m.grid) > DUPLICATE_IOU)) unique.push(m);

  const sheet = await contactSheet(
    await readBytes(opts.imageUrl),
    unique.map((m) => ({ grid: m.grid, bbox: m.box })),
  );
  const { tiles } = await structured({
    step: "segment-label",
    tier: "llm",
    prompt: "segment-label",
    vars: { count: unique.length, guesses: unique.map((m, i) => `${i + 1}. ${m.label}`).join("\n") },
    images: [{ bytes: sheet }],
    schema: labelSchema,
    ctx: opts.ctx,
  });

  const reviewed = unique.map((m, i) => {
    const t = tiles.find((t) => t.tile === i + 1);
    return { ...m, keep: t?.keep ?? true, label: t?.label?.trim() || m.label, interest: t?.interest ?? m.interest };
  });
  const kept = reviewed.filter((m) => m.keep).sort((a, b) => b.interest - a.interest);
  // Too strict a review would leave a bare scene: top up from the rejects.
  const topUp = reviewed.filter((m) => !m.keep).sort((a, b) => b.interest - a.interest);
  const chosen = [...kept, ...topUp.slice(0, Math.max(0, MIN_OBJECTS - kept.length))].slice(0, MAX_OBJECTS);

  return chosen.map((m, i) => ({
    id: `o${i + 1}`,
    label: m.label.toLowerCase(),
    polygons: polygons(m.grid),
    bbox: m.box,
    area: Math.round(m.area * 10000) / 10000,
  }));
}

function toXywh([x0, y0, x1, y1]: number[]): [number, number, number, number] {
  const [a, b] = [Math.min(x0, x1) / 1000, Math.min(y0, y1) / 1000];
  return [a, b, Math.abs(x1 - x0) / 1000, Math.abs(y1 - y0) / 1000];
}

/** The SAM instance whose box best overlaps the LLM's box; SAM boxes are normalized [cx, cy, w, h]. */
function pickInstance(out: SamOutput, want: [number, number, number, number]) {
  const boxes = out.metadata?.map((m) => m.box ?? null) ?? out.boxes ?? [];
  let best = 0;
  let bestScore = -1;
  out.masks.forEach((_, i) => {
    const b = boxes[i];
    if (!b || b.length !== 4) return;
    const score = boxIou([b[0] - b[2] / 2, b[1] - b[3] / 2, b[2], b[3]], want);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

export function boxIou(a: [number, number, number, number], b: [number, number, number, number]) {
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

import "server-only";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/db";

/** Who a model call was for. Every pipeline step takes one so its cost lands in the log. */
export type CostCtx = { worldId?: string; sceneId?: string; edgeId?: string; userId?: string | null };

export async function logCost(
  ctx: CostCtx,
  entry: {
    step: string;
    model: string;
    usd: number;
    /** gateway: the AI Gateway's reported charge. fal-price: fal's live unit price × quantity. list-price / table: published prices. */
    source?: "gateway" | "fal-price" | "list-price" | "table" | "unknown";
    units?: Record<string, number>;
    durationMs?: number;
  },
) {
  try {
    const db = getDb();
    await db.insert(schema.costs).values({
      id: nanoid(),
      step: entry.step,
      model: entry.model,
      usd: entry.usd,
      source: entry.source ?? "table",
      units: entry.units,
      durationMs: entry.durationMs,
      worldId: ctx.worldId,
      sceneId: ctx.sceneId,
      edgeId: ctx.edgeId,
      userId: ctx.userId ?? null,
    });
  } catch (err) {
    // Never fail a generation because the cost log is down.
    console.error("cost log failed", err);
  }
}

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { after } from "next/server";
import { getDb, schema, type Db } from "@/db";
import { actionKey } from "@/lib/ai/actions";
import { aiConfig } from "@/lib/ai/config";
import { generateKeyframe } from "@/lib/ai/keyframe";
import { planOutcome } from "@/lib/ai/outcome";
import { segmentScene } from "@/lib/ai/segment";
import { generateTransition } from "@/lib/ai/video";
import type { Edge, Scene } from "@/db/schema";
import type { EdgeStatus } from "@/lib/types";
import { refundCredits, spendCredits, underGenerationLimit } from "@/lib/user";

/** An edge that hasn't moved in this long was abandoned (its function died) and may be retried. */
export const STALE_EDGE_MS = 6 * 60 * 1000;

export type StartResult =
  | { ok: true; edgeId: string; cached: boolean }
  | { ok: false; status: number; error: string };

export function isStale(e: Pick<Edge, "status" | "updatedAt">) {
  return !["ready", "failed"].includes(e.status) && Date.now() - e.updatedAt.getTime() > STALE_EDGE_MS;
}

async function findEdge(db: Db, sceneId: string, objectId: string, key: string) {
  const [e] = await db
    .select()
    .from(schema.edges)
    .where(and(eq(schema.edges.fromSceneId, sceneId), eq(schema.edges.objectId, objectId), eq(schema.edges.actionKey, key)));
  return e;
}

/**
 * Take an action. A ready edge replays for free; one already generating is
 * joined; anything else costs a credit and starts the background job.
 */
export async function startEdge(opts: { scene: Scene; objectId: string; actionText: string; userId: string }): Promise<StartResult> {
  const db = getDb();
  const key = actionKey(opts.actionText);
  const existing = await findEdge(db, opts.scene.id, opts.objectId, key);

  if (existing?.status === "ready") {
    await db
      .update(schema.edges)
      .set({ playCount: sql`${schema.edges.playCount} + 1` })
      .where(eq(schema.edges.id, existing.id));
    return { ok: true, edgeId: existing.id, cached: true };
  }
  if (existing && existing.status !== "failed" && !isStale(existing)) {
    return { ok: true, edgeId: existing.id, cached: false };
  }

  if (!(await underGenerationLimit(opts.userId))) {
    return { ok: false, status: 429, error: "You're exploring faster than the world can paint. Try again in a little while, or follow a path someone already took (those are free)." };
  }
  if (!(await spendCredits(opts.userId, 1))) {
    return { ok: false, status: 402, error: "You're out of credits. Paths other players already explored are still free." };
  }

  if (existing) {
    // Retry a failed or abandoned edge in place; the unique key keeps it one row.
    await db
      .update(schema.edges)
      .set({ status: "queued", error: null, createdBy: opts.userId, updatedAt: new Date() })
      .where(eq(schema.edges.id, existing.id));
    after(() => runEdge(existing.id));
    return { ok: true, edgeId: existing.id, cached: false };
  }

  const id = nanoid(12);
  const inserted = await db
    .insert(schema.edges)
    .values({
      id,
      worldId: opts.scene.worldId,
      fromSceneId: opts.scene.id,
      objectId: opts.objectId,
      actionKey: key,
      actionText: opts.actionText,
      createdBy: opts.userId,
      playCount: 1,
    })
    .onConflictDoNothing()
    .returning({ id: schema.edges.id });
  if (!inserted.length) {
    // Someone else started the same action a moment ago: join theirs, give the credit back.
    await refundCredits(opts.userId, 1);
    const raced = await findEdge(db, opts.scene.id, opts.objectId, key);
    return { ok: true, edgeId: raced!.id, cached: raced!.status === "ready" };
  }
  after(() => runEdge(id));
  return { ok: true, edgeId: id, cached: false };
}

async function setStatus(db: Db, id: string, status: EdgeStatus, extra: Partial<typeof schema.edges.$inferInsert> = {}) {
  await db.update(schema.edges).set({ status, updatedAt: new Date(), ...extra }).where(eq(schema.edges.id, id));
}

/**
 * Steps 4-7 for one edge: plan, keyframe, then the transition video and the
 * new scene's segmentation in parallel. The edge is ready when the video is;
 * segmentation usually finishes first, so the scene is clickable when the clip
 * ends. Each stage is saved as it finishes, so a retry resumes where the last
 * attempt stopped instead of paying for the same plan or keyframe twice.
 */
export async function runEdge(edgeId: string) {
  const db = getDb();
  const [edge] = await db.select().from(schema.edges).where(eq(schema.edges.id, edgeId));
  if (!edge) return;
  const ctx = { worldId: edge.worldId, sceneId: edge.fromSceneId, edgeId, userId: edge.createdBy };
  let segmenting: Promise<unknown> = Promise.resolve();

  try {
    const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, edge.fromSceneId));
    const [world] = await db.select().from(schema.worlds).where(eq(schema.worlds.id, edge.worldId));
    const object = scene?.objects.find((o) => o.id === edge.objectId);
    if (!scene || !world?.bible || !object) throw new Error("scene, world or object missing");
    const bible = world.bible;

    let plan = edge.plan;
    if (!plan) {
      await setStatus(db, edgeId, "planning");
      const cfg = aiConfig();
      const outcome = await planOutcome({ imageUrl: scene.imageUrl, object, action: edge.actionText, bible, storySoFar: scene.storySoFar, ctx });
      plan = { ...outcome, models: { llm: cfg.llm, image: cfg.image, video: cfg.video } };
      await setStatus(db, edgeId, "imaging", { narration: plan.narration, plan });
    }

    let next: Scene | undefined;
    if (edge.toSceneId) [next] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, edge.toSceneId));
    if (!next) {
      await setStatus(db, edgeId, "imaging");
      const id = nanoid(12);
      const frame = await generateKeyframe({ currentUrl: scene.imageUrl, plan, bible, key: `worlds/${edge.worldId}/${id}`, ctx });
      [next] = await db
        .insert(schema.scenes)
        .values({
          id,
          worldId: edge.worldId,
          parentSceneId: scene.id,
          viaEdgeId: edgeId,
          imageUrl: frame.url,
          width: frame.width,
          height: frame.height,
          storySoFar: plan.storySoFar,
          depth: scene.depth + 1,
        })
        .returning();
      await db.update(schema.edges).set({ toSceneId: id }).where(eq(schema.edges.id, edgeId));
    }
    if (next.segStatus !== "ready") segmenting = segmentAndSave(next);

    if (!edge.videoUrl) {
      await setStatus(db, edgeId, "animating");
      const videoUrl = await generateTransition({
        fromUrl: scene.imageUrl,
        toUrl: next.imageUrl,
        motionPrompt: plan.motionPrompt,
        bible,
        key: `worlds/${edge.worldId}/${next.id}-in`,
        ctx,
      });
      await db.update(schema.edges).set({ videoUrl }).where(eq(schema.edges.id, edgeId));
    }
    await setStatus(db, edgeId, "ready");
  } catch (err) {
    console.error("edge failed", edgeId, err);
    await setStatus(db, edgeId, "failed", { error: err instanceof Error ? err.message.slice(0, 300) : "generation failed" });
    await refundCredits(edge.createdBy, 1);
  }
  // Keep the function alive until the new scene is clickable.
  await segmenting;
}

/** Segment a scene (step 7). Also used to retry a scene whose segmentation failed. */
export async function segmentAndSave(scene: Scene) {
  const db = getDb();
  const [world] = await db.select().from(schema.worlds).where(eq(schema.worlds.id, scene.worldId));
  if (!world?.bible) return;
  await db.update(schema.scenes).set({ segStatus: "pending" }).where(eq(schema.scenes.id, scene.id));
  try {
    const objects = await segmentScene({
      imageUrl: scene.imageUrl,
      width: scene.width,
      height: scene.height,
      bible: world.bible,
      storySoFar: scene.storySoFar,
      ctx: { worldId: scene.worldId, sceneId: scene.id },
    });
    await db.update(schema.scenes).set({ objects, segStatus: "ready" }).where(eq(schema.scenes.id, scene.id));
  } catch (err) {
    console.error("resegment failed", scene.id, err);
    await db.update(schema.scenes).set({ segStatus: "failed" }).where(eq(schema.scenes.id, scene.id));
  }
}

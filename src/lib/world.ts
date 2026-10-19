import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { after } from "next/server";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import { prepareSeed } from "@/lib/ai/keyframe";
import { segmentScene } from "@/lib/ai/segment";
import { generateWorldBible } from "@/lib/ai/world-bible";
import { errorText, trace } from "@/lib/log";
import { store } from "@/lib/storage";
import { refundCredits } from "@/lib/user";
import { curatedBySlug } from "@/worlds";

/** A world stuck in "creating" this long was abandoned (the function died); setup runs again. */
const STALE_SETUP_MS = 5 * 60 * 1000;

export async function getWorld(id: string) {
  const db = getDb();
  const [w] = await db.select().from(schema.worlds).where(eq(schema.worlds.id, id));
  return w;
}

/** Curated worlds are created in the database on first visit. Returns the world row. */
export async function ensureCuratedWorld(slug: string) {
  const curated = curatedBySlug(slug);
  if (!curated) return null;
  const db = getDb();
  const id = `c-${slug}`;
  const inserted = await db
    .insert(schema.worlds)
    .values({
      id,
      slug,
      title: curated.title,
      seedImageUrl: curated.seed,
      bible: curated.bible,
      visibility: "public",
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) {
    after(() => setupWorld(id));
    return inserted[0];
  }
  const world = (await getWorld(id))!;
  if (needsSetup(world)) {
    await db.update(schema.worlds).set({ status: "creating", error: null, createdAt: new Date() }).where(eq(schema.worlds.id, id));
    after(() => setupWorld(id));
  }
  return world;
}

function needsSetup(w: typeof schema.worlds.$inferSelect) {
  if (w.status === "failed") return true;
  return w.status === "creating" && Date.now() - w.createdAt.getTime() > STALE_SETUP_MS;
}

/** A new world from an uploaded picture (already moderated and stored). */
export async function createUploadedWorld(opts: { seedImageUrl: string; createdBy: string; visibility: "public" | "unlisted" }) {
  const db = getDb();
  const id = nanoid(10);
  await db.insert(schema.worlds).values({
    id,
    title: "A new world",
    seedImageUrl: opts.seedImageUrl,
    createdBy: opts.createdBy,
    visibility: opts.visibility,
  });
  after(() => setupWorld(id));
  return id;
}

/**
 * Turn a seed into a playable world: world bible, 9:16 root scene, and the
 * root scene's clickable objects. Runs in the background after the response.
 */
export async function setupWorld(worldId: string) {
  const db = getDb();
  const world = await getWorld(worldId);
  if (!world) return;
  const ctx = { worldId, userId: world.createdBy };
  const curated = world.slug ? curatedBySlug(world.slug) : undefined;
  const subject = `world:${worldId}`;
  await trace(subject, "setup started");
  try {
    const [bible, root] = await Promise.all([
      world.bible ? Promise.resolve(world.bible) : generateWorldBible(world.seedImageUrl, { ctx }),
      prepareSeed(world.seedImageUrl, `worlds/${worldId}/root-${nanoid(6)}`, ctx),
    ]);
    await trace(subject, "bible and root image ready", { root: root.url });
    if (!bible.safe) {
      await db
        .update(schema.worlds)
        .set({ status: "rejected", error: "This picture can't be used. Try another one." })
        .where(eq(schema.worlds.id, worldId));
      await refundCredits(world.createdBy, 1);
      return;
    }
    const sceneId = nanoid(12);
    await db.insert(schema.scenes).values({
      id: sceneId,
      worldId,
      imageUrl: root.url,
      width: root.width,
      height: root.height,
      storySoFar: bible.storySoFar,
    });
    await db
      .update(schema.worlds)
      .set({ bible, title: curated?.title ?? bible.title, rootSceneId: sceneId })
      .where(eq(schema.worlds.id, worldId));

    const objects = await segmentScene({
      imageUrl: root.url,
      width: root.width,
      height: root.height,
      bible,
      storySoFar: bible.storySoFar,
      ctx: { ...ctx, sceneId },
    });
    await db.update(schema.scenes).set({ objects, segStatus: "ready" }).where(eq(schema.scenes.id, sceneId));
    await db.update(schema.worlds).set({ status: "ready" }).where(eq(schema.worlds.id, worldId));
    await trace(subject, "ready", { objects: objects.length });
  } catch (err) {
    await trace(subject, "setup failed", { error: errorText(err) }, "error");
    await db
      .update(schema.worlds)
      .set({ status: "failed", error: "Something went wrong building this world. Open it again to retry." })
      .where(eq(schema.worlds.id, worldId));
    await refundCredits(world.createdBy, 1);
  }
}

/** Store an upload as the seed: re-encoded (drops EXIF and anything odd), max 2048px. */
export async function storeSeed(bytes: Buffer) {
  const jpeg = await sharp(bytes).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return store(`uploads/${nanoid(16)}.jpg`, jpeg, "image/jpeg");
}

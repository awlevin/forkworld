import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
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

/** A setup attempt that hasn't finished in this long died with its function; another may start. */
const STALE_SETUP_MS = 5 * 60 * 1000;

export async function getWorld(id: string) {
  const db = getDb();
  const [w] = await db.select().from(schema.worlds).where(eq(schema.worlds.id, id));
  return w;
}

/** Curated worlds get a database row on first visit; setup starts when the loading screen asks for it. */
export async function ensureCuratedWorld(slug: string) {
  const curated = curatedBySlug(slug);
  if (!curated) return null;
  const db = getDb();
  const id = `c-${slug}`;
  await db
    .insert(schema.worlds)
    .values({ id, slug, title: curated.title, seedImageUrl: curated.seed, bible: curated.bible, visibility: "public" })
    .onConflictDoNothing();
  return (await getWorld(id))!;
}

/**
 * Start setup unless it is done or already running. The claim is one atomic
 * update, so two visitors arriving together start it once. Call from route
 * handlers only: jobs started during a page render share its fetch memoization.
 */
export async function startSetup(worldId: string) {
  const db = getDb();
  const claimed = await db
    .update(schema.worlds)
    .set({ status: "creating", error: null, setupStartedAt: new Date() })
    .where(
      and(
        eq(schema.worlds.id, worldId),
        inArray(schema.worlds.status, ["creating", "failed"]),
        or(isNull(schema.worlds.setupStartedAt), lt(schema.worlds.setupStartedAt, new Date(Date.now() - STALE_SETUP_MS))),
      ),
    )
    .returning({ id: schema.worlds.id });
  if (claimed.length) after(() => setupWorld(worldId));
  return claimed.length > 0;
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
  await startSetup(id);
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
      .set({ status: "failed", error: "Something went wrong building this world.", setupStartedAt: null })
      .where(eq(schema.worlds.id, worldId));
    await refundCredits(world.createdBy, 1);
  }
}

/** Store an upload as the seed: re-encoded (drops EXIF and anything odd), max 2048px. */
export async function storeSeed(bytes: Buffer) {
  const jpeg = await sharp(bytes).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return store(`uploads/${nanoid(16)}.jpg`, jpeg, "image/jpeg");
}

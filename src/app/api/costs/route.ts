import { and, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUserId } from "@/lib/user";
import { getScene } from "@/lib/views";

const c = schema.costs;
const usd = sql<number>`coalesce(sum(${c.usd}), 0)::float`;

/**
 * Real spend around a scene, for the pause screen: what it took to make this
 * scene (step by step), this world, this player, and everyone.
 */
export async function GET(req: Request) {
  const sceneId = new URL(req.url).searchParams.get("sceneId") ?? "";
  const scene = await getScene(sceneId);
  if (!scene) return Response.json({ error: "Scene not found" }, { status: 404 });
  const db = getDb();
  const userId = await currentUserId();

  // Making this scene: its edge's plan, keyframe and clip plus its segmentation.
  // The first scene of a world instead carries the world's setup (bible, reframe).
  const made: SQL = scene.viaEdgeId
    ? or(eq(c.edgeId, scene.viaEdgeId), and(eq(c.sceneId, scene.id), isNull(c.edgeId), like(c.step, "segment%")))!
    : or(
        and(eq(c.worldId, scene.worldId), isNull(c.sceneId), isNull(c.edgeId)),
        and(eq(c.sceneId, scene.id), isNull(c.edgeId), like(c.step, "segment%")),
      )!;
  // Exploring it: action suggestions and checks of typed actions.
  const exploring = and(eq(c.sceneId, scene.id), isNull(c.edgeId), or(eq(c.step, "actions"), eq(c.step, "validate")))!;

  const [steps, [explore], [world], [you], [everyone], bySource] = await Promise.all([
    db
      .select({ step: c.step, model: c.model, source: c.source, usd, calls: sql<number>`count(*)::int` })
      .from(c)
      .where(made)
      .groupBy(c.step, c.model, c.source)
      .orderBy(sql`usd desc`),
    db.select({ usd }).from(c).where(exploring),
    db.select({ usd }).from(c).where(eq(c.worldId, scene.worldId)),
    userId ? db.select({ usd }).from(c).where(eq(c.userId, userId)) : Promise.resolve([{ usd: 0 }]),
    db.select({ usd }).from(c),
    db.select({ source: c.source, usd }).from(c).groupBy(c.source),
  ]);

  return Response.json(
    {
      scene: { usd: steps.reduce((s, r) => s + r.usd, 0), steps },
      exploring: explore.usd,
      world: world.usd,
      you: you.usd,
      everyone: everyone.usd,
      bySource,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

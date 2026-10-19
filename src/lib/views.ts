import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { EdgeStatus, EdgeView, ExploredEdge, PathStep, SceneView } from "@/lib/types";
import { isStale } from "./generate";

export async function getScene(id: string) {
  const db = getDb();
  const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id));
  return s;
}

/** Everything the player needs for one scene: image, objects, explored branches, and the path from the root. */
export async function getSceneView(id: string): Promise<SceneView | null> {
  const db = getDb();
  const scene = await getScene(id);
  if (!scene) return null;
  const [world] = await db.select({ title: schema.worlds.title }).from(schema.worlds).where(eq(schema.worlds.id, scene.worldId));
  const edges = await db.select().from(schema.edges).where(eq(schema.edges.fromSceneId, id));
  const explored: ExploredEdge[] = edges
    .filter((e) => e.status !== "failed" && !isStale(e))
    .map((e) => ({ edgeId: e.id, objectId: e.objectId, actionText: e.actionText, status: e.status as EdgeStatus, playCount: e.playCount }));

  const chain = await db.execute(sql`
    with recursive chain as (
      select id, parent_scene_id, via_edge_id, image_url, depth from scenes where id = ${id}
      union all
      select s.id, s.parent_scene_id, s.via_edge_id, s.image_url, s.depth
      from scenes s join chain c on s.id = c.parent_scene_id
    )
    select c.id, c.image_url, c.depth, e.action_text, e.plan->>'title' as title
    from chain c left join edges e on e.id = c.via_edge_id
    order by c.depth`);
  const rows = (chain as unknown as { rows: Record<string, unknown>[] }).rows;
  const path: PathStep[] = rows.map((r) => ({
    sceneId: String(r.id),
    imageUrl: String(r.image_url),
    actionText: (r.action_text as string | null) ?? null,
    title: (r.title as string | null) ?? null,
  }));

  return {
    id: scene.id,
    worldId: scene.worldId,
    worldTitle: world?.title ?? "Forkworld",
    imageUrl: scene.imageUrl,
    width: scene.width,
    height: scene.height,
    segStatus: scene.segStatus,
    objects: scene.objects,
    storySoFar: scene.storySoFar,
    depth: scene.depth,
    parentSceneId: scene.parentSceneId,
    explored,
    path,
  };
}

export async function getEdgeView(id: string, cached = false): Promise<EdgeView | null> {
  const db = getDb();
  const [e] = await db.select().from(schema.edges).where(eq(schema.edges.id, id));
  if (!e) return null;
  const to = e.toSceneId ? await getScene(e.toSceneId) : undefined;
  const stale = isStale(e);
  return {
    id: e.id,
    status: stale ? "failed" : (e.status as EdgeStatus),
    actionText: e.actionText,
    narration: e.narration,
    videoUrl: e.videoUrl,
    toSceneId: e.toSceneId,
    toImageUrl: to?.imageUrl ?? null,
    error: stale ? "This one stalled. Try it again." : e.error,
    cached,
  };
}

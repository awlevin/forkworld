import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { proposeActions } from "@/lib/ai/actions";
import { currentUserId } from "@/lib/user";
import { getSceneView } from "@/lib/views";
import { getWorld } from "@/lib/world";

const body = z.object({ objectId: z.string().max(20) });

/** The three suggested actions for an object, generated once and shared, plus what others already tried. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { objectId } = parsed.data;
  const view = await getSceneView((await params).id);
  const object = view?.objects.find((o) => o.id === objectId);
  if (!view || !object) return Response.json({ error: "Object not found" }, { status: 404 });
  const explored = view.explored.filter((e) => e.objectId === objectId).sort((a, b) => b.playCount - a.playCount);

  const db = getDb();
  const where = and(eq(schema.suggestions.sceneId, view.id), eq(schema.suggestions.objectId, objectId));
  let [row] = await db.select().from(schema.suggestions).where(where);
  if (!row) {
    const world = await getWorld(view.worldId);
    if (!world?.bible) return Response.json({ error: "World is not ready" }, { status: 409 });
    try {
      const actions = await proposeActions({
        imageUrl: view.imageUrl,
        object,
        others: view.objects.filter((o) => o.id !== objectId),
        bible: world.bible,
        storySoFar: view.storySoFar,
        explored: explored.map((e) => e.actionText),
        ctx: { worldId: view.worldId, sceneId: view.id, userId: await currentUserId() },
      });
      await db.insert(schema.suggestions).values({ sceneId: view.id, objectId, actions }).onConflictDoNothing();
      [row] = await db.select().from(schema.suggestions).where(where);
    } catch (err) {
      console.error("action proposals failed", err);
      return Response.json({ error: "Couldn't think of anything. Type your own action instead." , actions: [], explored }, { status: 200 });
    }
  }
  return Response.json({ actions: row.actions, explored });
}

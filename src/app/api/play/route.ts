import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { actionKey, validateAction } from "@/lib/ai/actions";
import { moderateText } from "@/lib/ai/moderation";
import { startEdge } from "@/lib/generate";
import { currentUserId } from "@/lib/user";
import { getEdgeView, getScene } from "@/lib/views";
import { getWorld } from "@/lib/world";

// The generation runs in after() and needs the function to stay alive for it.
export const maxDuration = 300;

const body = z.object({
  sceneId: z.string().max(20),
  objectId: z.string().max(20),
  action: z.string().min(1).max(200),
});

/** Take an action: replay it from cache, join a generation in flight, or start a new one. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Cookies are needed to play." }, { status: 401 });

  const { sceneId, objectId } = parsed.data;
  const scene = await getScene(sceneId);
  const object = scene?.objects.find((o) => o.id === objectId);
  if (!scene || !object) return Response.json({ error: "Object not found" }, { status: 404 });
  const world = await getWorld(scene.worldId);
  if (!world?.bible) return Response.json({ error: "World is not ready" }, { status: 409 });

  // Known actions (suggested, or already explored here) skip validation; anything typed is checked.
  const db = getDb();
  const [sugg] = await db
    .select()
    .from(schema.suggestions)
    .where(and(eq(schema.suggestions.sceneId, sceneId), eq(schema.suggestions.objectId, objectId)));
  const explored = await db
    .select({ text: schema.edges.actionText, status: schema.edges.status })
    .from(schema.edges)
    .where(and(eq(schema.edges.fromSceneId, sceneId), eq(schema.edges.objectId, objectId)));
  const known = [...(sugg?.actions.map((a) => a.text) ?? []), ...explored.filter((e) => e.status !== "failed").map((e) => e.text)];
  let action = known.find((k) => actionKey(k) === actionKey(parsed.data.action));

  if (!action) {
    const ctx = { worldId: scene.worldId, sceneId, userId };
    const mod = await moderateText(parsed.data.action, ctx).catch(() => ({ flagged: false }));
    if (mod.flagged) return Response.json({ error: "Let's keep this world friendly. Try something else." }, { status: 400 });
    const verdict = await validateAction({ input: parsed.data.action, object, bible: world.bible, existing: known, ctx });
    if (!verdict.ok) return Response.json({ error: verdict.reason }, { status: 400 });
    action = verdict.action;
  }

  const result = await startEdge({ scene, objectId, actionText: action, userId });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(await getEdgeView(result.edgeId, result.cached));
}

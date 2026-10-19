import { getScene } from "@/lib/views";
import { getWorld } from "@/lib/world";

/** Poll a world while it is being set up. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const world = await getWorld((await params).id);
  if (!world) return Response.json({ error: "Not found" }, { status: 404 });
  const root = world.rootSceneId ? await getScene(world.rootSceneId) : undefined;
  return Response.json(
    {
      id: world.id,
      title: world.title,
      status: world.status,
      error: world.error,
      rootSceneId: world.rootSceneId,
      rootImageUrl: root?.imageUrl ?? null,
      ready: world.status === "ready" && root?.segStatus === "ready",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

import { notFound, redirect } from "next/navigation";
import { WorldLoading } from "@/components/world-loading";
import { getScene } from "@/lib/views";
import { getWorld } from "@/lib/world";

/** A world by id: its first scene, or the loading screen while it is set up. */
export default async function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const world = await getWorld((await params).id);
  if (!world) notFound();
  const root = world.rootSceneId ? await getScene(world.rootSceneId) : undefined;
  if (world.status === "ready" && root?.segStatus === "ready") redirect(`/s/${root.id}`);
  return <WorldLoading worldId={world.id} seedUrl={world.seedImageUrl} />;
}

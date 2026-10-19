import { notFound, redirect } from "next/navigation";
import { WorldLoading } from "@/components/world-loading";
import { getScene } from "@/lib/views";
import { ensureCuratedWorld } from "@/lib/world";

// The first visit sets the world up in after(), which needs time to finish.
export const maxDuration = 300;

/** Entry to a curated world: set up on first visit, then straight into its first scene. */
export default async function PlayCurated({ params }: { params: Promise<{ slug: string }> }) {
  const world = await ensureCuratedWorld((await params).slug);
  if (!world) notFound();
  const root = world.rootSceneId ? await getScene(world.rootSceneId) : undefined;
  if (world.status === "ready" && root?.segStatus === "ready") redirect(`/s/${root.id}`);
  return <WorldLoading worldId={world.id} seedUrl={world.seedImageUrl} />;
}

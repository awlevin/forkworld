import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Player } from "@/components/player";
import { getSceneView } from "@/lib/views";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await getSceneView((await params).id);
  if (!view) return {};
  const title = `${view.worldTitle} · Forkworld`;
  return {
    title,
    description: view.storySoFar,
    openGraph: { title, description: view.storySoFar, images: [{ url: view.imageUrl, width: view.width, height: view.height }] },
    twitter: { card: "summary_large_image", images: [view.imageUrl] },
  };
}

/** One scene, by URL. Every scene in every world can be shared. */
export default async function ScenePage({ params }: Props) {
  const view = await getSceneView((await params).id);
  if (!view) notFound();
  return <Player initial={view} />;
}

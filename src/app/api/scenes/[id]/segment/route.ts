import { after } from "next/server";
import { segmentAndSave } from "@/lib/generate";
import { getScene } from "@/lib/views";

export const maxDuration = 300;

/** Try segmentation again for a scene where it failed. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scene = await getScene((await params).id);
  if (!scene) return Response.json({ error: "Scene not found" }, { status: 404 });
  if (scene.segStatus !== "failed") return Response.json({ ok: true });
  after(() => segmentAndSave(scene));
  return Response.json({ ok: true });
}

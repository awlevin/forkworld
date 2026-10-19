import { getSceneView } from "@/lib/views";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const view = await getSceneView((await params).id);
  if (!view) return Response.json({ error: "Scene not found" }, { status: 404 });
  return Response.json(view, { headers: { "cache-control": "no-store" } });
}

import { getEdgeView } from "@/lib/views";

/** Poll a generation. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const view = await getEdgeView((await params).id);
  if (!view) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(view, { headers: { "cache-control": "no-store" } });
}

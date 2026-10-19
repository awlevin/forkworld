import { falRequestInfo } from "@/lib/ai/fal";

/** Status, logs and result of one fal request: /api/admin/fal?key=ADMIN_KEY&endpoint=...&request=... */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.ADMIN_KEY || url.searchParams.get("key") !== process.env.ADMIN_KEY) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const endpoint = url.searchParams.get("endpoint") ?? "";
  const request = url.searchParams.get("request") ?? "";
  return Response.json(await falRequestInfo(endpoint, request), { headers: { "cache-control": "no-store" } });
}

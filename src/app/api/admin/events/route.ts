import { desc, like } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Recent job events as JSON: /api/admin/events?key=ADMIN_KEY[&subject=edge:abc] */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.ADMIN_KEY || url.searchParams.get("key") !== process.env.ADMIN_KEY) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const subject = url.searchParams.get("subject");
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(subject ? like(schema.events.subject, `${subject}%`) : undefined)
    .orderBy(desc(schema.events.createdAt))
    .limit(Number(url.searchParams.get("limit") ?? 100));
  return Response.json(rows, { headers: { "cache-control": "no-store" } });
}

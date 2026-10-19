import { currentUserId, getUser } from "@/lib/user";

export async function GET() {
  const id = await currentUserId();
  if (!id) return Response.json({ credits: null });
  const user = await getUser(id);
  return Response.json({ credits: user.credits }, { headers: { "cache-control": "no-store" } });
}

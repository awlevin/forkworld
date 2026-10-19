import { startSetup } from "@/lib/world";

// Setup runs in after() and needs the function alive until it finishes.
export const maxDuration = 300;

/** Start (or retry) a world's setup. Safe to call repeatedly: only one attempt runs at a time. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = await startSetup((await params).id);
  return Response.json({ started });
}

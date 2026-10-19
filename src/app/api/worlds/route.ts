import { moderateImage } from "@/lib/ai/moderation";
import { currentUserId, spendCredits, underUploadLimit } from "@/lib/user";
import { createUploadedWorld, storeSeed } from "@/lib/world";

export const maxDuration = 300;

const MAX_BYTES = 12 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];

/** "Start from any picture": the upload becomes the root of a new world. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Cookies are needed to play." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Choose a picture first." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That picture is over 12 MB." }, { status: 400 });
  if (file.type && !TYPES.includes(file.type)) return Response.json({ error: "Use a JPEG, PNG or WebP picture." }, { status: 400 });
  if (!(await underUploadLimit(userId))) return Response.json({ error: "That's a lot of new worlds. Try again in an hour." }, { status: 429 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let seedUrl: string;
  try {
    seedUrl = await storeSeed(bytes);
  } catch {
    return Response.json({ error: "That file doesn't look like a picture." }, { status: 400 });
  }
  const mod = await moderateImage(bytes, { userId }).catch((err) => {
    console.error("image moderation failed", err);
    return { flagged: false };
  });
  if (mod.flagged) return Response.json({ error: "This picture can't be used. Try another one." }, { status: 400 });
  if (!(await spendCredits(userId, 1))) return Response.json({ error: "You're out of credits." }, { status: 402 });

  const worldId = await createUploadedWorld({
    seedImageUrl: seedUrl,
    createdBy: userId,
    visibility: form?.get("public") === "on" ? "public" : "unlisted",
  });
  return Response.json({ worldId });
}

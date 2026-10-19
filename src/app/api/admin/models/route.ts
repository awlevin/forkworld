import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";

export const maxDuration = 120;

/**
 * Which gateway models this deployment can use for the LLM steps: each one gets
 * a tiny call with an image and structured output, like the real steps.
 * /api/admin/models?key=ADMIN_KEY&models=openai/gpt-5.4-mini,google/gemini-3-flash
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.ADMIN_KEY || url.searchParams.get("key") !== process.env.ADMIN_KEY) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const models = (url.searchParams.get("models") ?? "").split(",").filter(Boolean);
  const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e8b830" } }).jpeg().toBuffer();
  const results = await Promise.all(
    models.map(async (model) => {
      const started = Date.now();
      try {
        const r = await generateText({
          model,
          output: Output.object({ schema: z.object({ color: z.string() }) }),
          messages: [{ role: "user", content: [{ type: "file", mediaType: "image/jpeg", data: image }, { type: "text", text: "What colour is this image?" }] }],
          maxRetries: 0,
        });
        return { model, ok: true, ms: Date.now() - started, output: r.output, usage: r.usage, gateway: r.providerMetadata?.gateway };
      } catch (err) {
        return { model, ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
      }
    }),
  );
  return Response.json(results);
}

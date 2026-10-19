/**
 * Price estimates used for the cost log. They come from the providers' public
 * pricing pages (fal model pages and the Vercel AI Gateway model list, October
 * 2026) and are only as current as this file: edit them to match your account.
 * Calls through the AI Gateway log the gateway's own cost when it reports one.
 */

/** USD per 1M tokens: [input, output]. Keys are "provider/model" as the AI Gateway names them. */
const LLM_PRICES: Record<string, [number, number]> = {
  "openai/gpt-5.5": [5, 30],
  "openai/gpt-5.4": [2.5, 15],
  "openai/gpt-5.4-mini": [0.75, 4.5],
  "openai/gpt-5.4-nano": [0.2, 1.25],
  "anthropic/claude-sonnet-5.5": [2, 10],
  "anthropic/claude-haiku-5.5": [0.1, 0.5],
};

/** "openai:gpt-5.5" and "gateway:openai/gpt-5.5" share a price; Anthropic's direct ids use dashes ("claude-sonnet-5-5"). */
export function llmCost(model: string, inputTokens = 0, outputTokens = 0) {
  const key = model.replace(/^gateway:/, "").replace(":", "/").replace(/-(\d)-(\d)$/, "-$1.$2");
  const [i, o] = LLM_PRICES[key] ?? [0, 0];
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

/**
 * What a fal call bills for. fal doesn't report the cost of a single request,
 * so the cost log multiplies the quantity actually requested by the account's
 * live unit price (fal-billing.ts), falling back to `listPrice` from the
 * model's pricing page. `multiplier` covers options priced as a factor of the
 * base unit (resolution, audio).
 */
export type FalUsage = { quantity: number; unit: "image" | "second" | "video" | "request"; multiplier: number; listPrice: number };

const seconds = (d: unknown, fallback: number) => Number.parseFloat(String(d ?? fallback)) || fallback;

const FAL_USAGE: Record<string, (input: Record<string, unknown>) => FalUsage> = {
  "fal-ai/sam-3/image": () => ({ quantity: 1, unit: "request", multiplier: 1, listPrice: 0.005 }),
  "fal-ai/nano-banana-2/edit": (input) => ({
    quantity: Number(input.num_images ?? 1),
    unit: "image",
    multiplier: { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 }[String(input.resolution ?? "1K")] ?? 1,
    listPrice: 0.08,
  }),
  "fal-ai/nano-banana-pro/edit": (input) => ({ quantity: Number(input.num_images ?? 1), unit: "image", multiplier: 1, listPrice: 0.15 }),
  "fal-ai/veo3.1/fast/first-last-frame-to-video": (input) => ({
    quantity: seconds(input.duration, 8),
    unit: "second",
    multiplier: input.generate_audio ? 1.5 : 1,
    listPrice: 0.1,
  }),
  "fal-ai/veo3.1/first-last-frame-to-video": (input) => ({
    quantity: seconds(input.duration, 8),
    unit: "second",
    multiplier: input.generate_audio ? 2 : 1,
    listPrice: 0.2,
  }),
  "fal-ai/kling-video/v2.1/pro/image-to-video": (input) => ({
    quantity: 1,
    unit: "video",
    multiplier: 1 + Math.max(0, seconds(input.duration, 5) - 5) * 0.2,
    listPrice: 0.49,
  }),
  "fal-ai/kling-video/v3/pro/image-to-video": (input) => ({
    quantity: seconds(input.duration, 5),
    unit: "second",
    multiplier: input.generate_audio ? 1.5 : 1,
    listPrice: 0.112,
  }),
  "fal-ai/minimax/hailuo-02/pro/image-to-video": () => ({ quantity: 6, unit: "second", multiplier: 1, listPrice: 0.08 }),
};

export function falUsage(endpoint: string, input: Record<string, unknown>): FalUsage | null {
  return FAL_USAGE[endpoint]?.(input) ?? null;
}

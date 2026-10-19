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

type FalPrice = (input: Record<string, unknown>) => { usd: number; units: Record<string, number> };

const seconds = (d: unknown, fallback: number) => Number.parseFloat(String(d ?? fallback)) || fallback;

/** USD per call for fal endpoints, from the request input. */
const FAL_PRICES: Record<string, FalPrice> = {
  "fal-ai/sam-3/image": () => ({ usd: 0.005, units: { requests: 1 } }),
  "fal-ai/nano-banana-2/edit": (input) => {
    const scale = { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 }[String(input.resolution ?? "1K")] ?? 1;
    return { usd: 0.08 * scale, units: { images: 1 } };
  },
  "fal-ai/nano-banana-pro/edit": () => ({ usd: 0.15, units: { images: 1 } }),
  "fal-ai/veo3.1/fast/first-last-frame-to-video": (input) => {
    const s = seconds(input.duration, 8);
    return { usd: s * (input.generate_audio ? 0.15 : 0.1), units: { seconds: s } };
  },
  "fal-ai/veo3.1/first-last-frame-to-video": (input) => {
    const s = seconds(input.duration, 8);
    return { usd: s * (input.generate_audio ? 0.4 : 0.2), units: { seconds: s } };
  },
  "fal-ai/kling-video/v2.1/pro/image-to-video": (input) => {
    const s = seconds(input.duration, 5);
    return { usd: 0.49 + Math.max(0, s - 5) * 0.098, units: { seconds: s } };
  },
  "fal-ai/kling-video/v3/pro/image-to-video": (input) => {
    const s = seconds(input.duration, 5);
    return { usd: s * (input.generate_audio ? 0.168 : 0.112), units: { seconds: s } };
  },
  "fal-ai/minimax/hailuo-02/pro/image-to-video": () => ({ usd: 0.48, units: { seconds: 6 } }),
};

export function falCost(endpoint: string, input: Record<string, unknown>) {
  return FAL_PRICES[endpoint]?.(input) ?? { usd: 0, units: {} };
}

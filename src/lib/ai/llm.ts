import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import sharp from "sharp";
import type { z } from "zod";
import { logCost, type CostCtx } from "@/lib/cost";
import { requireEnv } from "@/lib/env";
import { readBytes } from "@/lib/storage";
import { aiConfig } from "./config";
import { llmCost } from "./pricing";
import { renderPrompt, type PromptName } from "./prompts";

export type LlmTier = "llm" | "llmFast";

/** "openai:gpt-5.5" → a model instance. "gateway:openai/gpt-5.5" goes through the Vercel AI Gateway. */
function resolveModel(id: string): LanguageModel {
  const [provider, ...rest] = id.split(":");
  const name = rest.join(":");
  if (provider === "openai") return createOpenAI({ apiKey: requireEnv("OPENAI_API_KEY", `LLM ${id}`) })(name);
  if (provider === "anthropic") return createAnthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY", `LLM ${id}`) })(name);
  if (provider === "gateway") return name;
  throw new Error(`Unknown LLM provider in "${id}" (use openai:, anthropic: or gateway:)`);
}

export type LlmImage = { url: string; maxSide?: number } | { bytes: Buffer };

/** Shrink and re-encode images before sending: big paintings cost tokens and add latency. */
async function imagePart(img: LlmImage) {
  const src = "bytes" in img ? img.bytes : await readBytes(img.url);
  const maxSide = "maxSide" in img && img.maxSide ? img.maxSide : 1024;
  const data = await sharp(src).resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { type: "file" as const, mediaType: "image/jpeg", data };
}

/**
 * One structured LLM call: render the prompt from /prompts, attach images,
 * validate the JSON against the zod schema, and log the cost.
 */
export async function structured<S extends z.ZodType>(opts: {
  step: string;
  tier: LlmTier;
  prompt: PromptName;
  vars: Record<string, string | number>;
  images?: LlmImage[];
  schema: S;
  ctx: CostCtx;
}): Promise<z.infer<S>> {
  const modelId = aiConfig()[opts.tier];
  const { system, user } = renderPrompt(opts.prompt, opts.vars);
  const images = await Promise.all((opts.images ?? []).map(imagePart));
  const messages: ModelMessage[] = [{ role: "user", content: [...images, { type: "text", text: user }] }];
  const started = Date.now();
  const result = await generateText({
    model: resolveModel(modelId),
    instructions: system,
    messages,
    output: Output.object({ schema: opts.schema }),
    // Reasoning models: keep latency down, these are short creative tasks.
    providerOptions: { openai: { reasoningEffort: "low" } },
    maxRetries: 2,
  });
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const reported = Number((result.providerMetadata?.gateway as { cost?: unknown } | undefined)?.cost);
  await logCost(opts.ctx, {
    step: opts.step,
    model: modelId,
    usd: Number.isFinite(reported) && reported > 0 ? reported : llmCost(modelId, inputTokens, outputTokens),
    units: { inputTokens, outputTokens },
    durationMs: Date.now() - started,
  });
  return result.output as z.infer<S>;
}

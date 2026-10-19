import "server-only";
import { createFalClient, type FalClient } from "@fal-ai/client";
import { logCost, type CostCtx } from "@/lib/cost";
import { requireEnv } from "@/lib/env";
import { errorText, withTimeout } from "@/lib/log";
import { falCost } from "./pricing";

let client: FalClient | undefined;
function fal() {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  client ??= createFalClient({ credentials: key ?? requireEnv("FAL_KEY", "fal.ai for segmentation, images and video") });
  return client;
}

/** Longest any call to these models should take, queue time included. */
const TIMEOUT_MS: Record<string, number> = { video: 240_000, segment: 60_000 };

/** Run a fal endpoint through its queue and log the cost. Inputs reference images by public Blob URL. */
export async function runFal<T>(step: string, endpoint: string, input: Record<string, unknown>, ctx: CostCtx): Promise<T> {
  const started = Date.now();
  const result = await withTimeout(
    fal().subscribe(endpoint, { input, pollInterval: 1000 }),
    TIMEOUT_MS[step] ?? 120_000,
    endpoint,
  ).catch((err) => {
    throw new Error(`${endpoint}: ${errorText(err)}`);
  });
  const { usd, units } = falCost(endpoint, input);
  await logCost(ctx, { step, model: endpoint, usd, units, durationMs: Date.now() - started });
  return result.data as T;
}

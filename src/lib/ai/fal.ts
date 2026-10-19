import "server-only";
import { createFalClient, type FalClient } from "@fal-ai/client";
import { logCost, type CostCtx } from "@/lib/cost";
import { requireEnv } from "@/lib/env";
import { falCost } from "./pricing";

let client: FalClient | undefined;
function fal() {
  client ??= createFalClient({ credentials: requireEnv("FAL_KEY", "fal.ai for segmentation, images and video") });
  return client;
}

/** Run a fal endpoint through its queue and log the cost. Inputs reference images by public Blob URL. */
export async function runFal<T>(step: string, endpoint: string, input: Record<string, unknown>, ctx: CostCtx): Promise<T> {
  const started = Date.now();
  const result = await fal().subscribe(endpoint, { input, pollInterval: 1000 });
  const { usd, units } = falCost(endpoint, input);
  await logCost(ctx, { step, model: endpoint, usd, units, durationMs: Date.now() - started });
  return result.data as T;
}

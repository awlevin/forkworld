import "server-only";
import { createFalClient, type FalClient } from "@fal-ai/client";
import { logCost, type CostCtx } from "@/lib/cost";
import { requireEnv } from "@/lib/env";
import { errorText, withTimeout } from "@/lib/log";
import { falCallCost } from "./fal-billing";
import { falUsage } from "./pricing";

let client: FalClient | undefined;
function fal() {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  client ??= createFalClient({
    credentials: key ?? requireEnv("FAL_KEY", "fal.ai for segmentation, images and video"),
    // Queue status is polled with identical GETs; Next must never serve those from its fetch cache.
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
  return client;
}

/** Ask fal about one request (admin debugging). */
export async function falRequestInfo(endpoint: string, requestId: string) {
  const status = await fal().queue.status(endpoint, { requestId, logs: true }).catch((e) => ({ error: errorText(e) }));
  const result = await fal().queue.result(endpoint, { requestId }).then((r) => r.data).catch((e) => ({ error: errorText(e) }));
  return { status, result };
}

/** Longest any call to these models should take, queue time included. */
const TIMEOUT_MS: Record<string, number> = { video: 240_000, segment: 90_000 };

/** Run a fal endpoint through its queue and log the cost. Inputs reference images by public Blob URL. */
export async function runFal<T>(step: string, endpoint: string, input: Record<string, unknown>, ctx: CostCtx): Promise<T> {
  const started = Date.now();
  let requestId = "";
  let last = "";
  const result = await withTimeout(
    fal().subscribe(endpoint, {
      input,
      pollInterval: 1000,
      onEnqueue: (id) => (requestId = id),
      onQueueUpdate: (s) => (last = s.status === "IN_QUEUE" ? `IN_QUEUE at ${s.queue_position}` : s.status),
    }),
    TIMEOUT_MS[step] ?? 240_000,
    endpoint,
  ).catch((err) => {
    throw new Error(`${endpoint} (request ${requestId || "not queued"}, last status ${last || "none"}): ${errorText(err)}`);
  });
  const { usd, units, source } = await falCallCost(endpoint, falUsage(endpoint, input));
  await logCost(ctx, { step, model: endpoint, usd, units, source, durationMs: Date.now() - started });
  return result.data as T;
}

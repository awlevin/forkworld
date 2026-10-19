import "server-only";
import type { FalUsage } from "./pricing";

const API = "https://api.fal.ai/v1/models";

function falKey() {
  return process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "";
}

type Price = { unit_price: number; unit: string };
const prices = new Map<string, { price: Price | null; at: number }>();
const PRICE_TTL_MS = 60 * 60 * 1000;

/** The account's current unit price for an endpoint, cached for an hour. Null if fal won't say. */
async function unitPrice(endpoint: string): Promise<Price | null> {
  const hit = prices.get(endpoint);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;
  let price: Price | null = null;
  try {
    const res = await fetch(`${API}/pricing?endpoint_id=${encodeURIComponent(endpoint)}`, {
      headers: { authorization: `Key ${falKey()}` },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { prices?: (Price & { endpoint_id: string })[] };
      price = json.prices?.find((p) => p.endpoint_id === endpoint) ?? null;
    }
  } catch {
    // Fall back to the list price below.
  }
  prices.set(endpoint, { price, at: Date.now() });
  return price;
}

function sameUnit(falUnit: string, ours: FalUsage["unit"]) {
  const u = falUnit.toLowerCase();
  if (ours === "request") return /request|call|unit/.test(u);
  return u.includes(ours);
}

/** Cost of one fal call: live unit price × quantity when the units line up, else the list price. */
export async function falCallCost(endpoint: string, usage: FalUsage | null): Promise<{
  usd: number;
  source: "fal-price" | "list-price" | "unknown";
  units: Record<string, number>;
}> {
  if (!usage) return { usd: 0, source: "unknown", units: {} };
  const live = await unitPrice(endpoint);
  const useLive = live && sameUnit(live.unit, usage.unit);
  const each = useLive ? live.unit_price : usage.listPrice;
  return {
    usd: each * usage.quantity * usage.multiplier,
    source: useLive ? "fal-price" : "list-price",
    units: { [usage.unit === "second" ? "seconds" : `${usage.unit}s`]: usage.quantity, unitPrice: each, multiplier: usage.multiplier },
  };
}

export type FalBilled = { endpoint: string; usd: number; quantity: number; unit: string };

/**
 * What fal itself says was charged, per endpoint, for a window. Needs a key
 * with billing access (fal "BILLING" or "FULL" preset); returns an error otherwise.
 */
export async function falBilledUsage(start: Date, end: Date): Promise<{ rows: FalBilled[] } | { error: string }> {
  const url = `${API}/usage?start=${start.toISOString()}&end=${end.toISOString()}&expand=summary`;
  const res = await fetch(url, { headers: { authorization: `Key ${falKey()}` }, cache: "no-store" }).catch(() => null);
  if (!res) return { error: "fal usage API unreachable" };
  if (res.status === 401 || res.status === 403) return { error: "The fal key can't read billing. A key with the BILLING or FULL preset shows fal's own totals here." };
  if (!res.ok) return { error: `fal usage API: ${res.status}` };
  const json = (await res.json()) as {
    summary?: { endpoint_id: string; cost_total?: number; cost?: number; quantity: number; unit: string }[];
  };
  return {
    rows: (json.summary ?? []).map((r) => ({ endpoint: r.endpoint_id, usd: r.cost_total ?? r.cost ?? 0, quantity: r.quantity, unit: r.unit })),
  };
}

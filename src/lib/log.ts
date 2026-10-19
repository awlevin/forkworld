import "server-only";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/db";

/**
 * Background jobs run after the response, where nobody sees a thrown error.
 * Each step is logged to the console and to the events table (/admin shows it).
 */
export async function trace(subject: string, message: string, data?: Record<string, unknown>, level: "info" | "error" = "info") {
  (level === "error" ? console.error : console.info)(`[${subject}] ${message}`, data ?? "");
  try {
    await getDb().insert(schema.events).values({ id: nanoid(), subject, level, message: message.slice(0, 500), data });
  } catch (err) {
    console.error("event log failed", err);
  }
}

export function errorText(err: unknown) {
  if (err instanceof Error) {
    const body = (err as { body?: unknown }).body;
    return (body ? `${err.message}: ${JSON.stringify(body)}` : err.message).slice(0, 500);
  }
  return String(err).slice(0, 500);
}

/** Reject if a step takes longer than it ever should, so a stuck call becomes a visible error. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";

export const USER_COOKIE = "fw_uid";

export const limits = {
  startCredits: () => Number(process.env.START_CREDITS ?? 20),
  generationsPerHour: () => Number(process.env.GENERATIONS_PER_HOUR ?? 12),
  uploadsPerHour: () => Number(process.env.UPLOADS_PER_HOUR ?? 4),
};

/** The anonymous player id. proxy.ts makes sure the cookie exists. */
export async function currentUserId(): Promise<string | null> {
  const id = (await cookies()).get(USER_COOKIE)?.value;
  return id && /^[\w-]{16,64}$/.test(id) ? id : null;
}

export async function getUser(id: string) {
  const db = getDb();
  await db.insert(schema.users).values({ id, credits: limits.startCredits() }).onConflictDoNothing();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u;
}

/** Atomically take credits; false if the player doesn't have enough. */
export async function spendCredits(id: string, n = 1) {
  await getUser(id);
  const db = getDb();
  const rows = await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} - ${n}` })
    .where(and(eq(schema.users.id, id), gte(schema.users.credits, n)))
    .returning({ credits: schema.users.credits });
  return rows.length > 0;
}

export async function refundCredits(id: string | null, n = 1) {
  if (!id) return;
  const db = getDb();
  await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} + ${n}` })
    .where(eq(schema.users.id, id));
}

const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

/** New generations in the last hour, cached replays don't count. */
export async function underGenerationLimit(id: string) {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.edges)
    .where(and(eq(schema.edges.createdBy, id), gte(schema.edges.createdAt, hourAgo())));
  return n < limits.generationsPerHour();
}

export async function underUploadLimit(id: string) {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.worlds)
    .where(and(eq(schema.worlds.createdBy, id), gte(schema.worlds.createdAt, hourAgo())));
  return n < limits.uploadsPerHour();
}

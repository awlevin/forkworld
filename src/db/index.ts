import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
  db ??= drizzle(neon(requireEnv("DATABASE_URL", "Neon Postgres for worlds, scenes and edges")), { schema });
  return db;
}

export { schema };

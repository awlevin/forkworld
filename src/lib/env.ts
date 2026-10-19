import "server-only";

/** Read a required env var, failing with a message that says what it is for. */
export function requireEnv(name: string, purpose: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (${purpose}). See README → Environment variables.`);
  return v;
}

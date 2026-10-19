import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Prompts live in /prompts as Markdown so they can be tuned without touching
 * code. Each file has a `## System` section and a `## User` section; the user
 * section is a template where `{{name}}` is replaced by a value from code.
 * Text before the first `##` heading is notes for humans and is not sent.
 */
export type PromptName =
  | "world-bible"
  | "segment-propose"
  | "segment-label"
  | "actions"
  | "validate-action"
  | "outcome"
  | "keyframe"
  | "motion";

const cache = new Map<PromptName, { system: string; user: string }>();

export function loadPrompt(name: PromptName) {
  const hit = process.env.NODE_ENV === "production" ? cache.get(name) : undefined;
  if (hit) return hit;
  const raw = readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8");
  const parsed = parsePrompt(raw);
  cache.set(name, parsed);
  return parsed;
}

export function parsePrompt(raw: string) {
  const system = section(raw, "System");
  const user = section(raw, "User");
  return { system, user };
}

function section(raw: string, title: string) {
  const re = new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");
  return (re.exec(raw)?.[1] ?? "").trim();
}

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`prompt variable {{${k}}} has no value`);
    return String(vars[k]);
  });
}

export function renderPrompt(name: PromptName, vars: Record<string, string | number>) {
  const p = loadPrompt(name);
  return { system: fill(p.system, vars), user: fill(p.user, vars) };
}

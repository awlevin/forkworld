import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { requireEnv } from "@/lib/env";

/** Images, masks and videos live in Vercel Blob. Keys are content-addressed by id, so files never change. */
export async function store(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  const blob = await put(key, Buffer.from(body), {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    token: requireEnv("BLOB_READ_WRITE_TOKEN", "Vercel Blob for scene images and videos"),
  });
  return blob.url;
}

/** Copy a remote file (a fal output) into Blob, so URLs never expire. */
export async function storeFromUrl(key: string, url: string, contentType: string) {
  return store(key, await readBytes(url), contentType);
}

/** Bytes for a URL: remote files, or files bundled under /public (curated seeds). */
export async function readBytes(url: string): Promise<Buffer> {
  if (url.startsWith("/")) {
    const root = path.join(process.cwd(), "public");
    const file = path.normalize(path.join(root, url));
    if (!file.startsWith(root + path.sep)) throw new Error("bad path");
    return readFile(file);
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sleep } from "@/lib/client";

type WorldStatus = { status: string; error: string | null; rootSceneId: string | null; rootImageUrl: string | null; ready: boolean; title: string };

/** Shown while a world is set up (bible, reframed seed, objects); jumps into the first scene when ready. */
export function WorldLoading({ worldId, seedUrl }: { worldId: string; seedUrl: string }) {
  const router = useRouter();
  const [w, setW] = useState<WorldStatus | null>(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    let live = true;
    const started = Date.now();
    (async () => {
      // Starts setup if nobody has (first visit to a curated world, or a retry after a failure).
      await fetch(`/api/worlds/${worldId}/setup`, { method: "POST" }).catch(() => {});
      while (live) {
        const res = await fetch(`/api/worlds/${worldId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        if (!live) return;
        if (res) setW(res);
        setSecs(Math.round((Date.now() - started) / 1000));
        if (res?.ready) return router.replace(`/s/${res.rootSceneId}`);
        if (res && ["failed", "rejected"].includes(res.status)) return;
        await sleep(2000);
      }
    })();
    return () => {
      live = false;
    };
  }, [worldId, router]);

  const failed = w && ["failed", "rejected"].includes(w.status);
  const image = w?.rootImageUrl ?? seedUrl;
  const step = !w?.rootSceneId ? "Stretching the picture into a world…" : "Finding the things you can touch…";

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink">
      <img src={image} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-md" />
      <div className="pb-safe absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent px-6">
        <div className="mx-auto w-full max-w-md pb-8 text-center">
          <h1 className="font-serif text-3xl text-paper">{w?.title ?? "A new world"}</h1>
          {failed ? (
            <>
              <p className="mt-4 text-sm text-red-200">{w?.error ?? "Something went wrong building this world."}</p>
              <div className="mt-6 flex justify-center gap-3">
                {w?.status === "failed" && (
                  <button onClick={() => window.location.reload()} className="rounded-2xl bg-glow px-5 py-3 text-sm font-semibold text-ink">
                    Try again
                  </button>
                )}
                <Link href="/" className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold">
                  Back home
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-paper/70">{step}</p>
              <p className="mt-1 text-xs tabular-nums text-paper/40">{secs}s · usually under a minute</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

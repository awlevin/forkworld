"use client";

import { useEffect, useState } from "react";
import type { EdgeView } from "@/lib/types";

const STAGES: Record<string, string> = {
  queued: "Getting ready…",
  planning: "Deciding what happens…",
  imaging: "Painting the next scene…",
  animating: "Bringing it to life…",
  ready: "Here it comes…",
};

/** Shown over the zoomed, blurred scene while a new path is generated. */
export function Generating({ edge, startedAt }: { edge: EdgeView; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div className="pb-safe pointer-events-none fixed inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent px-6 pt-safe">
      <div className="mx-auto w-full max-w-md pb-6 text-center">
        <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.2em] text-glow/80">{edge.actionText}</p>
        {edge.narration ? (
          <p key={edge.narration} className="animate-fade-in font-serif text-2xl italic leading-snug text-paper">
            {edge.narration}
          </p>
        ) : (
          <p className="font-serif text-2xl italic leading-snug text-paper/40">…</p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3 text-sm text-paper/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-glow opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-glow" />
          </span>
          <span>{STAGES[edge.status] ?? "Working…"}</span>
          <span className="tabular-nums text-paper/40">{secs}s</span>
        </div>
        <p className="mt-2 text-xs text-paper/40">
          {secs < 75 ? "New paths take about a minute." : "Taking a little longer than usual…"}
        </p>
      </div>
    </div>
  );
}

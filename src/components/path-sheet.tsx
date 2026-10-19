"use client";

import Link from "next/link";
import type { PathStep } from "@/lib/types";

/** The path from the world's first scene to here. Tap any step to go back to it. */
export function PathSheet(props: { path: PathStep[]; currentId: string; storySoFar: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end" onClick={props.onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="animate-rise pb-safe relative mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-ink px-4 pt-3 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Your path"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h2 className="font-serif text-xl text-glow">Your path</h2>
        {props.storySoFar && <p className="mt-2 font-serif text-[15px] italic leading-relaxed text-paper/75">{props.storySoFar}</p>}
        <ol className="mt-4 flex flex-col gap-1">
          {props.path.map((step, i) => {
            const current = step.sceneId === props.currentId;
            return (
              <li key={step.sceneId}>
                <Link
                  href={`/s/${step.sceneId}`}
                  onClick={props.onClose}
                  className={`flex items-center gap-3 rounded-2xl p-2 ${current ? "bg-white/10 ring-1 ring-glow/40" : "active:bg-white/5"}`}
                >
                  <img src={step.imageUrl} alt="" className="h-16 w-9 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i === 0 ? "The beginning" : (step.title ?? step.actionText)}</span>
                    {step.actionText && <span className="block truncate text-xs text-paper/50">{step.actionText}</span>}
                  </span>
                  {current && <span className="text-[11px] font-semibold text-glow">You are here</span>}
                </Link>
              </li>
            );
          })}
        </ol>
        <button onClick={props.onClose} className="mt-4 mb-2 w-full rounded-2xl bg-white/10 py-3 text-sm font-semibold active:bg-white/15">
          Close
        </button>
      </div>
    </div>
  );
}

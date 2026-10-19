"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActionSuggestion, ExploredEdge, SceneObject } from "@/lib/types";

const KIND_DOT: Record<ActionSuggestion["kind"], string> = {
  sensible: "bg-emerald-300",
  bold: "bg-amber-300",
  weird: "bg-fuchsia-300",
};

/**
 * Bottom sheet for a tapped object: three suggested actions, paths other
 * players already took (free to replay), and a free-text action.
 */
export function ActionSheet(props: {
  object: SceneObject;
  actions: ActionSuggestion[] | null;
  explored: ExploredEdge[];
  error: string | null;
  busy: boolean;
  onPlay: (action: string) => void;
  onClose: () => void;
  onHeight: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const { onHeight } = props;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => {
      ro.disconnect();
      onHeight(0);
    };
  }, [onHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const readyByText = new Map(props.explored.filter((e) => e.status === "ready").map((e) => [e.actionText.toLowerCase(), e]));
  const suggested = new Set(props.actions?.map((a) => a.text.toLowerCase()) ?? []);
  const others = props.explored.filter((e) => !suggested.has(e.actionText.toLowerCase()));

  return (
    <div
      ref={ref}
      className="animate-rise pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[72dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-ink/92 px-4 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/10 backdrop-blur-xl"
      role="dialog"
      aria-label={`Actions for ${props.object.label}`}
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl leading-tight text-glow first-letter:uppercase">{props.object.label}</h2>
        <button
          onClick={props.onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-paper/80 active:bg-white/20"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {props.actions === null && !props.error
          ? [0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.07]" />)
          : props.actions?.map((a) => {
              const cached = readyByText.get(a.text.toLowerCase());
              return (
                <ActionButton key={a.text} disabled={props.busy} onClick={() => props.onPlay(a.text)}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[a.kind]}`} aria-hidden />
                  <span className="flex-1 text-left">{a.text}</span>
                  <Cost cached={!!cached} plays={cached?.playCount} />
                </ActionButton>
              );
            })}
        {props.error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{props.error}</p>}
      </div>

      {others.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-paper/50">Others tried</p>
          <div className="flex flex-col gap-2">
            {others.map((e) => (
              <ActionButton key={e.edgeId} disabled={props.busy} onClick={() => props.onPlay(e.actionText)}>
                <span className="flex-1 text-left">{e.actionText}</span>
                {e.status === "ready" ? <Cost cached plays={e.playCount} /> : <span className="text-xs text-paper/50">being painted…</span>}
              </ActionButton>
            ))}
          </div>
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) props.onPlay(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={140}
          placeholder="Do something else…"
          enterKeyHint="go"
          className="min-w-0 flex-1 rounded-2xl bg-white/[0.08] px-4 py-3.5 text-base text-paper placeholder:text-paper/40 focus:outline-none focus:ring-2 focus:ring-glow/60"
        />
        <button
          type="submit"
          disabled={props.busy || !text.trim()}
          className="rounded-2xl bg-glow px-5 font-semibold text-ink disabled:opacity-40"
        >
          Go
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-paper/40">New paths cost 1 credit and take about a minute. Paths others took are free.</p>
    </div>
  );
}

function ActionButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3 text-[15px] font-medium text-paper ring-1 ring-white/5 transition active:scale-[0.98] active:bg-white/[0.14] disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

function Cost({ cached, plays }: { cached: boolean; plays?: number }) {
  if (cached)
    return (
      <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
        ▶ free{plays ? ` · ${plays}` : ""}
      </span>
    );
  return <span className="shrink-0 text-[11px] text-paper/45">1 credit</span>;
}

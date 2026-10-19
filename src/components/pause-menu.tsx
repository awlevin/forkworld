"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PathStep } from "@/lib/types";

type Costs = {
  scene: { usd: number; steps: { step: string; model: string; source: string; usd: number; calls: number }[] };
  exploring: number;
  world: number;
  you: number;
  everyone: number;
};

const STEP_NAMES: Record<string, string> = {
  outcome: "Plan the outcome",
  keyframe: "Paint the next scene",
  video: "Animate the transition",
  "segment-propose": "Spot things to tap",
  segment: "Outline them (SAM 3)",
  "segment-label": "Name them",
  "world-bible": "Write the world bible",
  "seed-reframe": "Reframe the picture",
};

const SOURCE: Record<string, string> = {
  gateway: "billed",
  "fal-price": "fal price",
  "list-price": "list price",
  table: "estimate",
  unknown: "unknown",
};

/** Everything that isn't the game: path, story, sharing and what it all cost. */
export function PauseMenu(props: {
  sceneId: string;
  worldTitle: string;
  path: PathStep[];
  storySoFar: string;
  credits: number | null;
  onClose: () => void;
}) {
  const [costs, setCosts] = useState<Costs | null>(null);
  const [costError, setCostError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/costs?sceneId=${props.sceneId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setCosts)
      .catch(() => setCostError(true));
  }, [props.sceneId]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) return navigator.share({ title: props.worldTitle, url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 overflow-y-auto bg-ink/90 backdrop-blur-xl" role="dialog" aria-label="Paused">
      <div className="pt-safe pb-safe mx-auto max-w-md px-4">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-paper/50">Paused</p>
            <h2 className="font-serif text-2xl text-glow">{props.worldTitle}</h2>
          </div>
          <button onClick={props.onClose} className="rounded-full bg-glow px-5 py-2.5 text-sm font-semibold text-ink active:scale-95">
            Resume
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <MenuButton onClick={share}>{copied ? "Copied" : "Share scene"}</MenuButton>
          <MenuButton href="/">Home</MenuButton>
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white/[0.06] py-3 text-sm">
            <span className="font-semibold tabular-nums">✦ {props.credits ?? "–"}</span>
            <span className="text-[11px] text-paper/50">credits</span>
          </div>
        </div>

        {props.storySoFar && (
          <Section title="Story so far">
            <p className="font-serif text-[15px] italic leading-relaxed text-paper/80">{props.storySoFar}</p>
          </Section>
        )}

        <Section title="Your path">
          <ol className="flex flex-col gap-1">
            {props.path.map((step, i) => {
              const current = step.sceneId === props.sceneId;
              return (
                <li key={step.sceneId}>
                  <Link
                    href={`/s/${step.sceneId}`}
                    onClick={props.onClose}
                    className={`flex items-center gap-3 rounded-2xl p-2 ${current ? "bg-white/10 ring-1 ring-glow/40" : "active:bg-white/5"}`}
                  >
                    <img src={step.imageUrl} alt="" className="h-14 w-8 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i === 0 ? "The beginning" : (step.title ?? step.actionText)}</span>
                      {step.actionText && <span className="block truncate text-xs text-paper/50">{step.actionText}</span>}
                    </span>
                    {current && <span className="text-[11px] font-semibold text-glow">Here</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section title="Costs">
          {costError ? (
            <p className="text-sm text-paper/50">Costs couldn&apos;t load right now.</p>
          ) : !costs ? (
            <div className="h-24 animate-pulse rounded-2xl bg-white/[0.06]" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="This scene" usd={costs.scene.usd} />
                <Stat label="This world" usd={costs.world} />
                <Stat label="You, all time" usd={costs.you} />
                <Stat label="Everyone, all time" usd={costs.everyone} />
              </div>
              {costs.scene.steps.length > 0 && (
                <div className="mt-3 rounded-2xl bg-white/[0.04] p-3">
                  <p className="mb-2 text-xs text-paper/60">What making this scene cost</p>
                  <ul className="flex flex-col gap-1.5 text-xs">
                    {costs.scene.steps.map((s) => (
                      <li key={`${s.step}-${s.model}-${s.source}`} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-paper/85">
                            {STEP_NAMES[s.step] ?? s.step}
                            {s.calls > 1 ? ` ×${s.calls}` : ""}
                          </span>
                          <span className="block truncate text-[10px] text-paper/40">
                            {s.model.replace(/^gateway:/, "")} · {SOURCE[s.source] ?? s.source}
                          </span>
                        </span>
                        <span className="tabular-nums text-paper/85">{money(s.usd)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {costs.exploring > 0 && <p className="mt-2 text-xs text-paper/50">Action suggestions here so far: {money(costs.exploring)}</p>}
              <p className="mt-3 text-[11px] leading-relaxed text-paper/40">
                Text models: the AI Gateway&apos;s billed amount. fal models: your account&apos;s live unit price × what was generated.
              </p>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-paper/50">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, usd }: { label: string; usd: number }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] p-3">
      <p className="text-[11px] text-paper/50">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{money(usd)}</p>
    </div>
  );
}

function MenuButton({ children, onClick, href }: { children: React.ReactNode; onClick?: () => void; href?: string }) {
  const cls = "flex items-center justify-center rounded-2xl bg-white/[0.06] py-3 text-sm font-medium active:bg-white/[0.12]";
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function money(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

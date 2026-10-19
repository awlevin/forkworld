"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hitTest } from "@/lib/client";
import type { SceneObject } from "@/lib/types";

export type StagePhase = "explore" | "generating" | "playing";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The scene: image, transition video and a canvas of object outlines, all
 * laid out in one rect. Portrait screens fill edge to edge (cover); wide
 * screens show the whole 9:16 frame (contain).
 */
export function Stage(props: {
  imageUrl: string;
  width: number;
  height: number;
  objects: SceneObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Outline and name every object. */
  reveal: boolean;
  /** Changes when a new scene arrives: outlines pulse once so players see what's tappable. */
  pulseKey: string;
  /** Branches already explored per object. */
  badges: Record<string, number>;
  phase: StagePhase;
  /** While generating, the camera drifts into this box. */
  focus: [number, number, number, number] | null;
  videoUrl: string | null;
  onVideoEnd: () => void;
  /** Height of the bottom sheet, so the selected object can be lifted above it. */
  sheetHeight: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rect = fit(size.w, size.h, props.width, props.height);
  const selected = props.objects.find((o) => o.id === props.selectedId) ?? null;
  const lift = liftFor(selected, rect, size.h, props.sheetHeight);

  // Pulse outlines once when a scene becomes clickable.
  const hasObjects = props.objects.length > 0;
  useEffect(() => {
    if (!hasObjects) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setPulse(Math.sin(Math.PI * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [props.pulseKey, hasObjects]);

  const interactive = props.phase === "explore";
  const activeId = props.selectedId ?? (interactive ? hoverId : null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !rect.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(rect.w * dpr);
    c.height = Math.round(rect.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!interactive) return;
    for (const o of props.objects) {
      const active = o.id === activeId;
      const alpha = active ? 1 : props.reveal ? 0.6 : pulse * 0.75;
      if (alpha > 0.01) outline(ctx, o, c.width, c.height, dpr, alpha, active);
    }
  }, [props.objects, props.reveal, activeId, pulse, rect.w, rect.h, interactive]);

  const toNorm = useCallback(
    (e: React.PointerEvent): [number, number] | null => {
      const b = box.current?.getBoundingClientRect();
      if (!b || !rect.w) return null;
      const x = (e.clientX - b.left - rect.x) / rect.w;
      const y = (e.clientY - b.top - rect.y + lift) / rect.h;
      return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x, y] : null;
    },
    [rect.x, rect.y, rect.w, rect.h, lift],
  );

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !interactive) return;
    const p = toNorm(e);
    setHoverId(p ? (hitTest(props.objects, p)?.id ?? null) : null);
  };
  const onTap = (e: React.PointerEvent) => {
    if (!interactive) return;
    const p = toNorm(e);
    props.onSelect(p ? (hitTest(props.objects, p)?.id ?? null) : null);
  };

  const generating = props.phase === "generating";
  const focus = props.focus;
  const origin = focus
    ? `${(focus[0] + focus[2] / 2) * rect.w}px ${(focus[1] + focus[3] / 2) * rect.h}px`
    : "50% 50%";
  const active = props.objects.find((o) => o.id === activeId);

  return (
    <div
      ref={box}
      className="stage absolute inset-0 overflow-hidden"
      onPointerMove={onMove}
      onPointerLeave={() => setHoverId(null)}
      onPointerUp={onTap}
      style={{ cursor: interactive && hoverId ? "pointer" : "default" }}
    >
      {/* Soft fill for the letterbox on wide screens. */}
      <img src={props.imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{ transform: `translateY(${-lift}px)` }}
      >
        <div className="absolute overflow-hidden" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <img
            src={props.imageUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full"
            style={{
              transformOrigin: origin,
              transform: generating ? "scale(1.8)" : "scale(1)",
              filter: generating ? "blur(7px) brightness(0.55) saturate(1.15)" : "none",
              transition: generating ? "transform 45s cubic-bezier(.1,.6,.2,1), filter 1.2s ease" : "transform .4s ease, filter .4s ease",
            }}
          />
          {props.phase === "playing" && props.videoUrl && (
            <video
              key={props.videoUrl}
              src={props.videoUrl}
              poster={props.imageUrl}
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={props.onVideoEnd}
              onError={props.onVideoEnd}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
          {interactive &&
            props.objects.map((o) => {
              const n = props.badges[o.id];
              if (!n) return null;
              return (
                <span
                  key={o.id}
                  className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-glow ring-1 ring-glow/40 backdrop-blur-sm"
                  style={{ left: `${(o.bbox[0] + o.bbox[2]) * 100}%`, top: `${o.bbox[1] * 100}%` }}
                  title={`${n} path${n === 1 ? "" : "s"} explored here`}
                >
                  <BranchIcon /> {n}
                </span>
              );
            })}
          {interactive && props.reveal &&
            props.objects
              .filter((o) => o.id !== activeId)
              .map((o) => <Label key={o.id} object={o} subtle />)}
          {interactive && active && <Label object={active} />}
        </div>
      </div>
      {/* The outlines are canvas-only; this list makes the objects reachable by screen readers and keyboards. */}
      {interactive && props.objects.length > 0 && (
        <ul className="sr-only" aria-label="Things in this scene">
          {props.objects.map((o) => (
            <li key={o.id}>
              <button onPointerUp={(e) => e.stopPropagation()} onClick={() => props.onSelect(o.id)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Label({ object, subtle }: { object: SceneObject; subtle?: boolean }) {
  const [x, y, w] = object.bbox;
  const cx = Math.min(0.85, Math.max(0.15, x + w / 2));
  const top = Math.max(0.04, y);
  return (
    <span
      className={`pointer-events-none absolute max-w-[60%] -translate-x-1/2 -translate-y-[120%] truncate rounded-full px-2.5 py-1 font-medium backdrop-blur-md ${
        subtle ? "bg-black/45 text-[11px] text-paper/85" : "bg-black/70 text-xs text-glow ring-1 ring-glow/50"
      }`}
      style={{ left: `${cx * 100}%`, top: `${top * 100}%` }}
    >
      {object.label}
    </span>
  );
}

function BranchIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="4" cy="3" r="1.6" />
      <circle cx="4" cy="13" r="1.6" />
      <circle cx="12" cy="5" r="1.6" />
      <path d="M4 4.6v6.8M12 6.6c0 3-8 2-8 5" />
    </svg>
  );
}

function fit(cw: number, ch: number, iw: number, ih: number): Rect {
  if (!cw || !ch) return { x: 0, y: 0, w: 0, h: 0 };
  const portrait = cw / ch < 0.8;
  const scale = portrait ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/** How far to slide the scene up so the selected object stays visible above the sheet. */
function liftFor(o: SceneObject | null, r: Rect, ch: number, sheet: number) {
  if (!o || !sheet || !r.h) return 0;
  const visible = ch - sheet;
  const center = r.y + (o.bbox[1] + o.bbox[3] / 2) * r.h;
  const want = center - visible * 0.45;
  const max = Math.max(0, r.y + r.h - visible);
  return Math.max(0, Math.min(want, max));
}

function outline(ctx: CanvasRenderingContext2D, o: SceneObject, w: number, h: number, dpr: number, a: number, active: boolean) {
  ctx.save();
  ctx.beginPath();
  for (const poly of o.polygons) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
  }
  ctx.lineJoin = "round";
  ctx.fillStyle = `rgba(255, 217, 138, ${a * (active ? 0.16 : 0.08)})`;
  ctx.fill("evenodd");
  ctx.shadowColor = `rgba(255, 210, 120, ${a})`;
  ctx.shadowBlur = (active ? 18 : 10) * dpr;
  ctx.strokeStyle = `rgba(255, 240, 205, ${a})`;
  ctx.lineWidth = (active ? 2.5 : 1.5) * dpr;
  ctx.stroke();
  if (active) ctx.stroke();
  ctx.restore();
}

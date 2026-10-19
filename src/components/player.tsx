"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, sleep } from "@/lib/client";
import type { ActionSuggestion, EdgeView, ExploredEdge, SceneView } from "@/lib/types";
import { ActionSheet } from "./action-sheet";
import { Generating } from "./generating";
import { PauseMenu } from "./pause-menu";
import { Stage, type StagePhase } from "./stage";

type Menu = { objectId: string; actions: ActionSuggestion[] | null; explored: ExploredEdge[]; error: string | null };

/**
 * The game loop on one screen: explore a scene → pick an action → wait while
 * it is generated (or replay it from cache) → play the clip → arrive in the
 * next scene. The URL follows along so every scene can be shared.
 */
export function Player({ initial }: { initial: SceneView }) {
  const router = useRouter();
  const [scene, setScene] = useState(initial);
  const [phase, setPhase] = useState<StagePhase>("explore");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [edge, setEdge] = useState<EdgeView | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [focus, setFocus] = useState<[number, number, number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [paused, setPaused] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const run = useRef(0);

  // Browser back/forward and path jumps render the page with a new scene.
  useEffect(() => {
    run.current++;
    setScene(initial);
    setPhase("explore");
    setMenu(null);
    setEdge(null);
    setError(null);
  }, [initial]);

  useEffect(() => {
    api.me().then((m) => setCredits(m.credits)).catch(() => {});
  }, [scene.id]);

  // A scene is tappable once its objects are found; until then, poll.
  useEffect(() => {
    if (scene.segStatus !== "pending") return;
    const id = scene.id;
    let live = true;
    (async () => {
      while (live) {
        await sleep(1500);
        const next = await api.scene(id).catch(() => null);
        if (live && next && next.segStatus !== "pending") setScene(next);
        if (next?.segStatus !== "pending") break;
      }
    })();
    return () => {
      live = false;
    };
  }, [scene.id, scene.segStatus]);

  const select = useCallback(
    async (objectId: string | null) => {
      if (!objectId) return setMenu(null);
      if (menu?.objectId === objectId) return;
      setMenu({ objectId, actions: null, explored: scene.explored.filter((e) => e.objectId === objectId), error: null });
      try {
        const res = await api.actions(scene.id, objectId);
        setMenu((m) => (m?.objectId === objectId ? { objectId, actions: res.actions, explored: res.explored, error: res.error ?? null } : m));
      } catch (err) {
        setMenu((m) => (m?.objectId === objectId ? { ...m, actions: [], error: (err as Error).message } : m));
      }
    },
    [menu?.objectId, scene.id, scene.explored],
  );

  const arrive = useCallback(async (toSceneId: string, toImageUrl: string | null) => {
    if (toImageUrl) await preload(toImageUrl);
    const next = await api.scene(toSceneId);
    window.history.pushState(null, "", `/s/${toSceneId}`);
    setScene(next);
    setPhase("explore");
    setEdge(null);
    setFocus(null);
  }, []);

  const play = useCallback(
    async (action: string) => {
      if (!menu) return;
      const object = scene.objects.find((o) => o.id === menu.objectId);
      setBusy(true);
      setError(null);
      let e: EdgeView;
      try {
        e = await api.play(scene.id, menu.objectId, action);
      } catch (err) {
        setBusy(false);
        setMenu((m) => (m ? { ...m, error: (err as Error).message } : m));
        return;
      }
      setBusy(false);
      setMenu(null);
      setFocus(object?.bbox ?? null);
      setEdge(e);
      setStartedAt(Date.now());
      api.me().then((m) => setCredits(m.credits)).catch(() => {});
      const me = ++run.current;

      // Poll until the edge is ready (instant for cached paths).
      setPhase(e.status === "ready" ? "playing" : "generating");
      while (e.status !== "ready" && e.status !== "failed") {
        await sleep(1500);
        if (run.current !== me) return;
        e = await api.edge(e.id).catch(() => e);
        if (run.current !== me) return;
        setEdge(e);
      }
      if (e.status === "failed") {
        setPhase("explore");
        setFocus(null);
        setError(e.error ?? "That didn't work. Try again.");
        api.me().then((m) => setCredits(m.credits)).catch(() => {});
        return;
      }
      if (e.toImageUrl) preload(e.toImageUrl);
      setPhase("playing");
      if (!e.videoUrl) await arrive(e.toSceneId!, e.toImageUrl);
    },
    [menu, scene.id, scene.objects, arrive],
  );

  const onVideoEnd = useCallback(() => {
    if (edge?.toSceneId) arrive(edge.toSceneId, edge.toImageUrl);
  }, [edge, arrive]);

  const badges: Record<string, number> = {};
  for (const e of scene.explored) if (e.status === "ready") badges[e.objectId] = (badges[e.objectId] ?? 0) + 1;
  const selected = scene.objects.find((o) => o.id === menu?.objectId) ?? null;
  const exploring = phase === "explore";

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink">
      <Stage
        imageUrl={scene.imageUrl}
        width={scene.width}
        height={scene.height}
        objects={scene.segStatus === "ready" ? scene.objects : []}
        selectedId={menu?.objectId ?? null}
        onSelect={select}
        reveal={reveal}
        pulseKey={scene.id}
        badges={badges}
        phase={phase}
        focus={focus}
        videoUrl={phase === "playing" ? (edge?.videoUrl ?? null) : null}
        onVideoEnd={onVideoEnd}
        sheetHeight={sheetHeight}
      />

      {exploring && (
        <header className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => setPaused(true)}
              aria-label="Pause"
              className="grid h-10 w-10 place-items-center rounded-full bg-black/45 backdrop-blur-md active:bg-black/70"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                <rect x="2" y="1.5" width="3.5" height="11" rx="1" />
                <rect x="8.5" y="1.5" width="3.5" height="11" rx="1" />
              </svg>
            </button>
            {scene.parentSceneId && (
              <button
                onClick={() => router.push(`/s/${scene.parentSceneId}`)}
                aria-label="Go back one scene"
                className="grid h-10 w-10 place-items-center rounded-full bg-black/45 backdrop-blur-md active:bg-black/70"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3L5 8l5 5" />
                </svg>
              </button>
            )}
          </div>
          {credits !== null && (
            <span className="pointer-events-auto rounded-full bg-black/45 px-3 py-2 text-xs font-semibold tabular-nums backdrop-blur-md" title="Credits for new paths">
              ✦ {credits}
            </span>
          )}
        </header>
      )}

      {exploring && !menu && (
        <footer className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-16">
          <span className="min-w-0 truncate text-xs text-paper/60">
            {scene.depth === 0 ? scene.worldTitle : `${scene.worldTitle} · ${scene.depth} step${scene.depth === 1 ? "" : "s"} in`}
          </span>
          <button
            onClick={() => setReveal((r) => !r)}
            aria-pressed={reveal}
            className={`pointer-events-auto rounded-full px-4 py-2.5 text-xs font-semibold backdrop-blur-md ${reveal ? "bg-glow text-ink" : "bg-black/45 text-paper active:bg-black/70"}`}
          >
            {reveal ? "Hide" : "Show"} things
          </button>
        </footer>
      )}

      {exploring && scene.segStatus === "pending" && (
        <Toast>Looking around…</Toast>
      )}
      {exploring && scene.segStatus === "failed" && (
        <Toast>
          Couldn&apos;t make out the objects here.{" "}
          <button
            className="font-semibold text-glow underline"
            onClick={async () => {
              await api.resegment(scene.id).catch(() => {});
              setScene((s) => ({ ...s, segStatus: "pending" }));
            }}
          >
            Try again
          </button>
        </Toast>
      )}
      {exploring && error && (
        <Toast onClose={() => setError(null)}>
          <span className="text-red-200">{error}</span>
        </Toast>
      )}

      {exploring && menu && selected && (
        <ActionSheet
          object={selected}
          actions={menu.actions}
          explored={menu.explored}
          error={menu.error}
          busy={busy}
          onPlay={play}
          onClose={() => setMenu(null)}
          onHeight={setSheetHeight}
        />
      )}

      {phase === "generating" && edge && <Generating edge={edge} startedAt={startedAt} />}
      {phase === "playing" && edge?.narration && (
        <p className="animate-fade-in pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-6 pt-20 text-center font-serif text-lg italic leading-snug text-paper">
          {edge.narration}
        </p>
      )}

      {paused && (
        <PauseMenu
          sceneId={scene.id}
          worldTitle={scene.worldTitle}
          path={scene.path}
          storySoFar={scene.storySoFar}
          credits={credits}
          onClose={() => setPaused(false)}
        />
      )}
    </main>
  );
}

function Toast({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-20 flex justify-center px-4">
      <div className="pointer-events-auto animate-fade-in flex items-center gap-3 rounded-2xl bg-black/70 px-4 py-2.5 text-sm backdrop-blur-md">
        <span>{children}</span>
        {onClose && (
          <button onClick={onClose} className="text-paper/60" aria-label="Dismiss">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}



function preload(url: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

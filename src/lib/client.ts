import type { ActionSuggestion, EdgeView, ExploredEdge, SceneObject, SceneView } from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Something went wrong (${res.status})`);
  return data as T;
}

export const api = {
  scene: (id: string) => fetch(`/api/scenes/${id}`, { cache: "no-store" }).then((r) => json<SceneView>(r)),
  actions: (sceneId: string, objectId: string) =>
    fetch(`/api/scenes/${sceneId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId }),
    }).then((r) => json<{ actions: ActionSuggestion[]; explored: ExploredEdge[]; error?: string }>(r)),
  play: (sceneId: string, objectId: string, action: string) =>
    fetch("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sceneId, objectId, action }),
    }).then((r) => json<EdgeView>(r)),
  edge: (id: string) => fetch(`/api/edges/${id}`, { cache: "no-store" }).then((r) => json<EdgeView>(r)),
  resegment: (sceneId: string) => fetch(`/api/scenes/${sceneId}/segment`, { method: "POST" }).then((r) => json(r)),
  me: () => fetch("/api/me", { cache: "no-store" }).then((r) => json<{ credits: number | null }>(r)),
};

export function pointInPolygon([x, y]: [number, number], poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The smallest object under a normalized point, so a pillow wins over the bed it sits on. */
export function hitTest(objects: SceneObject[], pt: [number, number]) {
  let best: SceneObject | null = null;
  for (const o of objects) {
    if (o.polygons.some((p) => pointInPolygon(pt, p)) && (!best || o.area < best.area)) best = o;
  }
  return best;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

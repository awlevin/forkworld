import type { Pt } from "@/lib/types";

/** A binary mask on a small grid: 1 = object. */
export type Grid = { w: number; h: number; data: Uint8Array };

/** Grid width used for contours and overlap tests. Fine enough for outlines, cheap enough for a dozen masks. */
export const GRID_W = 256;

export function area(g: Grid) {
  let n = 0;
  for (let i = 0; i < g.data.length; i++) n += g.data[i];
  return n / g.data.length;
}

export function iou(a: Grid, b: Grid) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    inter += a.data[i] & b.data[i];
    union += a.data[i] | b.data[i];
  }
  return union === 0 ? 0 : inter / union;
}

/** Normalized [x, y, w, h] of the set pixels. */
export function bbox(g: Grid): [number, number, number, number] {
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.data[y * g.w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return [0, 0, 0, 0];
  return [x0 / g.w, y0 / g.h, (x1 - x0 + 1) / g.w, (y1 - y0 + 1) / g.h];
}

/** 4-connected components, largest first, each as its own grid. */
export function components(g: Grid): { grid: Grid; size: number }[] {
  const label = new Int32Array(g.data.length);
  const out: { grid: Grid; size: number }[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < g.data.length; start++) {
    if (!g.data[start] || label[start]) continue;
    next++;
    const comp = new Uint8Array(g.data.length);
    let size = 0;
    stack.push(start);
    label[start] = next;
    while (stack.length) {
      const i = stack.pop()!;
      comp[i] = 1;
      size++;
      const x = i % g.w;
      const y = (i - x) / g.w;
      const ns = [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, y > 0 ? i - g.w : -1, y < g.h - 1 ? i + g.w : -1];
      for (const n of ns) {
        if (n >= 0 && g.data[n] && !label[n]) {
          label[n] = next;
          stack.push(n);
        }
      }
    }
    out.push({ grid: { w: g.w, h: g.h, data: comp }, size });
  }
  return out.sort((a, b) => b.size - a.size);
}

// Clockwise from west, y pointing down.
const DIRS: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

/** Moore-neighbour tracing of the outer boundary of a single component. Pixel coordinates. */
export function traceOuter(g: Grid): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.data[y * g.w + x] === 1;
  let sx = -1, sy = -1;
  for (let i = 0; i < g.data.length && sx < 0; i++) if (g.data[i]) [sx, sy] = [i % g.w, Math.floor(i / g.w)];
  if (sx < 0) return [];

  const pts: Pt[] = [[sx, sy]];
  let [cx, cy] = [sx, sy];
  // We entered the start pixel from the west (raster scan), so the backtrack is west.
  let back = 0;
  const limit = g.data.length * 4;
  for (let steps = 0; steps < limit; steps++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (at(cx + DIRS[d][0], cy + DIRS[d][1])) {
        found = d;
        break;
      }
    }
    if (found < 0) break; // isolated pixel
    const prev = (found + 7) % 8;
    const [px, py] = [cx + DIRS[prev][0], cy + DIRS[prev][1]];
    cx += DIRS[found][0];
    cy += DIRS[found][1];
    // New backtrack: direction from the new pixel to the last empty neighbour we checked.
    back = DIRS.findIndex(([dx, dy]) => dx === px - cx && dy === py - cy);
    if (cx === sx && cy === sy) break;
    pts.push([cx, cy]);
  }
  return pts;
}

/** Ramer-Douglas-Peucker. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, dist = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
      if (d > dist) [dist, worst] = [d, i];
    }
    if (dist > eps && worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** RDP on a closed ring: split at the point farthest from the start, simplify both halves. */
export function simplifyRing(ring: Pt[], eps: number): Pt[] {
  if (ring.length < 4) return ring;
  const [sx, sy] = ring[0];
  let far = 1;
  ring.forEach(([x, y], i) => {
    if (Math.hypot(x - sx, y - sy) > Math.hypot(ring[far][0] - sx, ring[far][1] - sy)) far = i;
  });
  const a = simplify(ring.slice(0, far + 1), eps);
  const b = simplify([...ring.slice(far), ring[0]], eps);
  return [...a, ...b.slice(1, -1)];
}

/**
 * Outer contours of a mask as normalized polygons: the largest part, plus any
 * other part at least a fifth its size (a cat behind a chair leg is two parts).
 */
export function polygons(g: Grid, maxParts = 3, maxPoints = 80): Pt[][] {
  const comps = components(g);
  if (!comps.length) return [];
  const biggest = comps[0].size;
  return comps
    .filter((c) => c.size >= Math.max(6, biggest / 5))
    .slice(0, maxParts)
    .map((c) => {
      const ring = traceOuter(c.grid);
      let eps = 0.75;
      let simple = simplifyRing(ring, eps);
      while (simple.length > maxPoints) simple = simplifyRing(ring, (eps *= 1.5));
      return simple.map(([x, y]) => [round((x + 0.5) / g.w), round((y + 0.5) / g.h)] as Pt);
    })
    .filter((p) => p.length >= 3);
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Rasterize normalized polygons onto a grid (even-odd). */
export function rasterize(polys: Pt[][], w: number, h: number): Grid {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const py = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / w;
      if (polys.some((p) => pointInPolygon([px, py], p))) data[y * w + x] = 1;
    }
  }
  return { w, h, data };
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

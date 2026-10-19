import { describe, expect, it } from "vitest";
import { area, bbox, components, iou, pointInPolygon, polygons, rasterize, traceOuter, type Grid } from "./mask";

function grid(rows: string[]): Grid {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (data[y * w + x] = c === "#" ? 1 : 0)));
  return { w, h, data };
}

describe("mask geometry", () => {
  const square = grid([
    "......",
    ".####.",
    ".####.",
    ".####.",
    "......",
  ]);

  it("measures area and bbox", () => {
    expect(area(square)).toBeCloseTo(12 / 30);
    expect(bbox(square)).toEqual([1 / 6, 1 / 5, 4 / 6, 3 / 5]);
  });

  it("traces the outer boundary clockwise without repeats", () => {
    const ring = traceOuter(square);
    expect(ring[0]).toEqual([1, 1]);
    expect(ring).toHaveLength(10); // perimeter pixels of a 4x3 block
    expect(new Set(ring.map((p) => p.join())).size).toBe(ring.length);
  });

  it("traces concave shapes", () => {
    const u = grid([
      "#...#",
      "#...#",
      "#####",
    ]);
    const ring = traceOuter(u);
    expect(ring.length).toBeGreaterThanOrEqual(9);
    expect(ring).toContainEqual([0, 0]);
    expect(ring).toContainEqual([4, 0]);
  });

  it("splits components and drops specks from polygons", () => {
    const two = grid([
      "###.....#",
      "###...##.",
      "###...##.",
      "......##.",
    ]);
    expect(components(two).map((c) => c.size)).toEqual([9, 6, 1]);
    // The single pixel is too small to be its own part.
    expect(polygons(two)).toHaveLength(2);
  });

  it("round-trips a polygon through rasterize and trace", () => {
    const tri: [number, number][] = [[0.1, 0.1], [0.9, 0.2], [0.4, 0.9]];
    const g = rasterize([tri], 64, 64);
    const [poly] = polygons(g);
    expect(poly.length).toBeGreaterThanOrEqual(3);
    expect(poly.length).toBeLessThan(40);
    expect(pointInPolygon([0.45, 0.4], poly)).toBe(true);
    expect(pointInPolygon([0.9, 0.9], poly)).toBe(false);
    expect(iou(g, rasterize([poly], 64, 64))).toBeGreaterThan(0.85);
  });
});

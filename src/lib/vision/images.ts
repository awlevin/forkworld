import "server-only";
import sharp from "sharp";
import { GRID_W, type Grid } from "./mask";

/** Decode a mask image (white = object) onto the contour grid for an image of the given aspect. */
export async function maskToGrid(png: Buffer, aspect: number): Promise<Grid> {
  const w = GRID_W;
  const h = Math.max(1, Math.round(GRID_W / aspect));
  const raw = await sharp(png).flatten({ background: "#000" }).greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer();
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = raw[i] > 127 ? 1 : 0;
  return { w, h, data };
}

function gridToRaw(g: Grid) {
  const raw = Buffer.alloc(g.data.length);
  for (let i = 0; i < g.data.length; i++) raw[i] = g.data[i] ? 255 : 0;
  return raw;
}

/** Padded crop box in pixels around a normalized bbox. */
export function cropBox(bbox: [number, number, number, number], width: number, height: number, pad = 0.2) {
  const [x, y, w, h] = bbox;
  const side = Math.max(w * width, h * height, 64);
  const cx = (x + w / 2) * width;
  const cy = (y + h / 2) * height;
  const half = (side * (1 + pad * 2)) / 2;
  const left = Math.max(0, Math.round(cx - half));
  const top = Math.max(0, Math.round(cy - half));
  return {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(half * 2))),
    height: Math.max(1, Math.min(height - top, Math.round(half * 2))),
  };
}

/** A close-up of one object, for the action prompt. */
export async function objectCrop(image: Buffer, bbox: [number, number, number, number]) {
  const meta = await sharp(image).metadata();
  const box = cropBox(bbox, meta.width!, meta.height!);
  return sharp(image).extract(box).resize(512, 512, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
}

/**
 * A grid of numbered tiles, one per mask: the masked object bright, the rest
 * dimmed. One image lets the LLM review every mask in a single call.
 */
export async function contactSheet(image: Buffer, masks: { grid: Grid; bbox: [number, number, number, number] }[]) {
  const { data: rgb, info } = await sharp(image)
    .resize(1024, 1024, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const dim = await sharp(rgb, { raw: { width, height, channels: 3 } }).linear(0.3, 0).raw().toBuffer();

  const TILE = 256;
  const tiles = await Promise.all(
    masks.map(async (m, i) => {
      const alpha = await sharp(gridToRaw(m.grid), { raw: { width: m.grid.w, height: m.grid.h, channels: 1 } })
        .resize(width, height, { fit: "fill" })
        .blur(1)
        .raw()
        .toBuffer();
      const bright = await sharp(rgb, { raw: { width, height, channels: 3 } })
        .joinChannel(alpha, { raw: { width, height, channels: 1 } })
        .png()
        .toBuffer();
      const tile = await sharp(dim, { raw: { width, height, channels: 3 } })
        .composite([{ input: bright }])
        .extract(cropBox(m.bbox, width, height, 0.15))
        .resize(TILE, TILE, { fit: "contain", background: "#111" })
        .composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}"><rect width="44" height="34" fill="#e11d48"/><text x="22" y="25" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="22" fill="#fff">${i + 1}</text></svg>`,
            ),
          },
        ])
        .png()
        .toBuffer();
      return tile;
    }),
  );

  const cols = Math.min(4, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  return sharp({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: "#111" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * TILE, top: Math.floor(i / cols) * TILE })))
    .jpeg({ quality: 85 })
    .toBuffer();
}

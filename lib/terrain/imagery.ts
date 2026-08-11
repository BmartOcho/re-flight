// Server-side satellite-imagery builder: fetches Sentinel-2 cloudless tiles
// (EOX s2maps.eu — free, no key), mosaics them, and resamples to a square RGB
// texture over the SAME lat/lon box as the DEM, so the texture drapes over the
// terrain mesh with a plain linear UV mapping (row 0 = north, like the DEM).
//
// This is an OPTIONAL realism layer: everything must keep working when the
// tile host is unreachable (some sandboxes block it) — callers treat a null
// result as "no imagery" and the procedural palette renders instead.
//
// Licensing: "Sentinel-2 cloudless" by EOX IT Services GmbH is CC BY-NC-SA 4.0
// (contains modified Copernicus Sentinel data). Attribution is carried in
// `source` and must be shown in the disclosure footer wherever the texture is
// rendered. Swap IMAGERY_URL for a licensed provider for commercial use.
import * as jpeg from 'jpeg-js';

import type { Box } from './build';

const IMAGERY_URL = (z: number, y: number, x: number) =>
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`;
export const IMAGERY_ATTRIBUTION = 'Sentinel-2 cloudless by EOX (CC BY-NC-SA 4.0)';

const lonX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

function tileSpan(box: Box, z: number) {
  const nt = 2 ** z;
  const xt = Math.floor(lonX(box.lon1) * nt) - Math.floor(lonX(box.lon0) * nt) + 1;
  const yt = Math.floor(mercY(box.lat0) * nt) - Math.floor(mercY(box.lat1) * nt) + 1;
  return xt * yt;
}

function pickZoom(box: Box, maxTiles: number, zMax: number): number {
  for (let z = zMax; z >= 6; z--) if (tileSpan(box, z) <= maxTiles) return z;
  return 6;
}

async function fetchTile(z: number, x: number, y: number, timeoutMs: number): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(IMAGERY_URL(z, y, x), { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`imagery tile ${z}/${y}/${x} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export interface ImageryResult {
  /** Encoded JPEG, `px` x `px`, row 0 = north (same orientation as the DEM grid). */
  jpeg: Buffer;
  px: number;
  z: number;
  source: string;
}

export interface ImageryOptions {
  /** Output texture size in pixels (square). */
  px?: number;
  maxTiles?: number;
  zMax?: number;
  /** Per-tile fetch timeout — keep small in serverless contexts. */
  timeoutMs?: number;
  /** Cache hook (the build script injects a disk cache; serverless goes direct). */
  getCached?: (z: number, x: number, y: number) => Buffer | null;
  putCached?: (z: number, x: number, y: number, buf: Buffer) => void;
}

/**
 * Build a satellite texture for a lat/lon box. Throws on network failure —
 * callers catch and fall back to the procedural palette.
 */
export async function buildImagery(box: Box, opts: ImageryOptions = {}): Promise<ImageryResult> {
  const px = opts.px ?? 1024;
  const z = pickZoom(box, opts.maxTiles ?? 80, opts.zMax ?? 13);
  const nt = 2 ** z;
  const xmin = Math.floor(lonX(box.lon0) * nt);
  const xmax = Math.floor(lonX(box.lon1) * nt);
  const ymin = Math.floor(mercY(box.lat1) * nt);
  const ymax = Math.floor(mercY(box.lat0) * nt);
  const tw = xmax - xmin + 1;
  const th = ymax - ymin + 1;
  const W = tw * 256;
  const H = th * 256;
  const mosaic = new Uint8Array(W * H * 3);

  const jobs: { x: number; y: number }[] = [];
  for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) jobs.push({ x, y });
  await mapLimit(jobs, 8, async ({ x, y }) => {
    let buf = opts.getCached?.(z, x, y) ?? null;
    if (!buf) {
      buf = await fetchTile(z, x, y, opts.timeoutMs ?? 8000);
      opts.putCached?.(z, x, y, buf);
    }
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 64 });
    if (img.width !== 256 || img.height !== 256) throw new Error(`unexpected tile size ${img.width}x${img.height}`);
    const ox = (x - xmin) * 256;
    const oy = (y - ymin) * 256;
    const ch = img.data.length / (256 * 256); // 3 (RGB) or 4 (RGBA) depending on decoder
    for (let py = 0; py < 256; py++) {
      for (let pxx = 0; pxx < 256; pxx++) {
        const s = (py * 256 + pxx) * ch;
        const d = ((oy + py) * W + (ox + pxx)) * 3;
        mosaic[d] = img.data[s];
        mosaic[d + 1] = img.data[s + 1];
        mosaic[d + 2] = img.data[s + 2];
      }
    }
  });

  // Resample: output pixel grid is LINEAR in lat/lon over the box (matching the
  // DEM's grid), sampled bilinearly from the mercator mosaic.
  const out = Buffer.alloc(px * px * 4);
  for (let i = 0; i < px; i++) {
    const lat = box.lat1 - (box.lat1 - box.lat0) * (i / (px - 1));
    const gy = Math.max(0, Math.min(H - 1.0001, mercY(lat) * nt * 256 - ymin * 256));
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const y1 = Math.min(y0 + 1, H - 1);
    for (let j = 0; j < px; j++) {
      const lon = box.lon0 + (box.lon1 - box.lon0) * (j / (px - 1));
      const gx = Math.max(0, Math.min(W - 1.0001, lonX(lon) * nt * 256 - xmin * 256));
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const x1 = Math.min(x0 + 1, W - 1);
      const d = (i * px + j) * 4;
      for (let c = 0; c < 3; c++) {
        out[d + c] =
          mosaic[(y0 * W + x0) * 3 + c] * (1 - fx) * (1 - fy) +
          mosaic[(y0 * W + x1) * 3 + c] * fx * (1 - fy) +
          mosaic[(y1 * W + x0) * 3 + c] * (1 - fx) * fy +
          mosaic[(y1 * W + x1) * 3 + c] * fx * fy;
      }
      out[d + 3] = 255;
    }
  }

  const encoded = jpeg.encode({ data: out, width: px, height: px }, 80);
  return { jpeg: Buffer.from(encoded.data), px, z, source: `${IMAGERY_ATTRIBUTION} · z${z}` };
}

// Server-side DEM builder for on-demand flights (uploads). Fetches AWS terrarium
// tiles (the elevation bucket sends no CORS headers, so this can only run
// server-side), mosaics, and resamples to an n x n Int16 heightmap — same north->
// south / west->east row order as lib/replay/track.ts#demAt expects.
//
// Mirrors the math in scripts/terrain.ts (which builds the curated flights' DEMs
// at build time); this variant auto-picks a zoom to bound the tile count so it
// stays fast inside a serverless function.
import { PNG } from 'pngjs';

export interface Box {
  lat0: number;
  lat1: number;
  lon0: number;
  lon1: number;
}

const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
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

/** Largest zoom (<= zMax) whose tile count fits maxTiles — trades detail for speed. */
export function pickZoom(box: Box, maxTiles = 120, zMax = 12): number {
  for (let z = zMax; z >= 7; z--) if (tileSpan(box, z) <= maxTiles) return z;
  return 7;
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${TILE}/${z}/${x}/${y}.png`);
      if (!res.ok) throw new Error(`tile ${z}/${x}/${y} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
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

export interface DEMResult {
  n: number;
  z: number;
  box: Box;
  heights: Int16Array;
  min: number;
  max: number;
}

export async function buildDEM(box: Box, n: number, opts: { maxTiles?: number } = {}): Promise<DEMResult> {
  const z = pickZoom(box, opts.maxTiles ?? 120);
  const nt = 2 ** z;
  const xmin = Math.floor(lonX(box.lon0) * nt);
  const xmax = Math.floor(lonX(box.lon1) * nt);
  const ymin = Math.floor(mercY(box.lat1) * nt);
  const ymax = Math.floor(mercY(box.lat0) * nt);

  const txs: number[] = [];
  const tys: number[] = [];
  for (let x = xmin; x <= xmax; x++) txs.push(x);
  for (let y = ymin; y <= ymax; y++) tys.push(y);
  const W = txs.length * 256;
  const H = tys.length * 256;
  const mosaic = new Float32Array(W * H);

  const jobs: { x: number; y: number }[] = [];
  for (const y of tys) for (const x of txs) jobs.push({ x, y });
  await mapLimit(jobs, 8, async ({ x, y }) => {
    const png = PNG.sync.read(await fetchTile(z, x, y));
    const ox = (x - xmin) * 256;
    const oy = (y - ymin) * 256;
    for (let py = 0; py < 256; py++) {
      for (let px = 0; px < 256; px++) {
        const k = (py * 256 + px) * 4;
        mosaic[(oy + py) * W + (ox + px)] = png.data[k] * 256 + png.data[k + 1] + png.data[k + 2] / 256 - 32768;
      }
    }
  });

  const sample = (lat: number, lon: number): number => {
    let gx = lonX(lon) * nt * 256 - xmin * 256;
    let gy = mercY(lat) * nt * 256 - ymin * 256;
    gx = Math.max(0, Math.min(W - 1.0001, gx));
    gy = Math.max(0, Math.min(H - 1.0001, gy));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const x1 = Math.min(x0 + 1, W - 1);
    const y1 = Math.min(y0 + 1, H - 1);
    return (
      mosaic[y0 * W + x0] * (1 - fx) * (1 - fy) +
      mosaic[y0 * W + x1] * fx * (1 - fy) +
      mosaic[y1 * W + x0] * (1 - fx) * fy +
      mosaic[y1 * W + x1] * fx * fy
    );
  };

  const heights = new Int16Array(n * n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const lat = box.lat1 - (box.lat1 - box.lat0) * (i / (n - 1));
    for (let j = 0; j < n; j++) {
      const lon = box.lon0 + (box.lon1 - box.lon0) * (j / (n - 1));
      const h = Math.round(sample(lat, lon));
      heights[i * n + j] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { n, z, box, heights, min, max };
}

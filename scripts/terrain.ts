// Build-time terrain: fetch AWS terrarium tiles over each flight's box, mosaic
// them, and resample to an n x n Int16 heightmap (metres MSL) written as
// terrain.bin. Rows run north (lat1) -> south (lat0), columns west (lon0) ->
// east (lon1) — the exact order lib/replay/track.ts#demAt and the mesh builder
// expect. Then patch meta.json's terrain box.
//
// Terrarium tiles are free, no key, no auth:
//   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
//   elevation_m = (R*256 + G + B/256) - 32768
//
// This is a dev-time tool. The produced .bin is committed so builds are hermetic.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FLIGHTS } from '../data/authored';
import type { TrackData } from '../lib/types';
import { trackExtent } from '../lib/replay/track';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'flights');
const CACHE = join(ROOT, 'scripts', '.tilecache');
const Z = 12;
const NTILES = 2 ** Z;
const TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const lonX = (lon: number) => (lon + 180) / 360;

async function fetchTile(x: number, y: number): Promise<Buffer> {
  const dir = join(CACHE, String(Z), String(x));
  const path = join(dir, `${y}.png`);
  if (existsSync(path)) return readFileSync(path);
  const url = `${TILE}/${Z}/${x}/${y}.png`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, buf);
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

interface Box {
  lat0: number;
  lat1: number;
  lon0: number;
  lon1: number;
}

async function buildDEM(box: Box, n: number): Promise<Int16Array> {
  const xmin = Math.floor(lonX(box.lon0) * NTILES);
  const xmax = Math.floor(lonX(box.lon1) * NTILES);
  const ymin = Math.floor(mercY(box.lat1) * NTILES); // north edge -> smaller y
  const ymax = Math.floor(mercY(box.lat0) * NTILES); // south edge -> larger y
  const txs: number[] = [];
  const tys: number[] = [];
  for (let x = xmin; x <= xmax; x++) txs.push(x);
  for (let y = ymin; y <= ymax; y++) tys.push(y);

  const W = txs.length * 256;
  const H = tys.length * 256;
  const mosaic = new Float32Array(W * H);

  const jobs: { x: number; y: number }[] = [];
  for (const y of tys) for (const x of txs) jobs.push({ x, y });
  process.stdout.write(`    fetching ${jobs.length} z${Z} tiles (${txs.length}x${tys.length}) `);
  let done = 0;
  await mapLimit(jobs, 6, async ({ x, y }) => {
    const png = PNG.sync.read(await fetchTile(x, y));
    const ox = (x - xmin) * 256;
    const oy = (y - ymin) * 256;
    for (let py = 0; py < 256; py++) {
      for (let px = 0; px < 256; px++) {
        const k = (py * 256 + px) * 4;
        const elev = png.data[k] * 256 + png.data[k + 1] + png.data[k + 2] / 256 - 32768;
        mosaic[(oy + py) * W + (ox + px)] = elev;
      }
    }
    if (++done % 10 === 0 || done === jobs.length) process.stdout.write('.');
  });
  process.stdout.write('\n');

  // Global fractional pixel of a lat/lon, relative to the mosaic origin.
  const sample = (lat: number, lon: number): number => {
    let gx = lonX(lon) * NTILES * 256 - xmin * 256;
    let gy = mercY(lat) * NTILES * 256 - ymin * 256;
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
  for (let i = 0; i < n; i++) {
    const lat = box.lat1 - (box.lat1 - box.lat0) * (i / (n - 1)); // north -> south
    for (let j = 0; j < n; j++) {
      const lon = box.lon0 + (box.lon1 - box.lon0) * (j / (n - 1)); // west -> east
      heights[i * n + j] = Math.round(sample(lat, lon));
    }
  }
  return heights;
}

async function main() {
  console.log('Building terrain DEMs →', OUT_DIR);
  for (const f of FLIGHTS) {
    if (f.embeddedTerrain) {
      console.log(`  ${f.slug}: embedded DEM, skipping`);
      continue;
    }
    const dir = join(OUT_DIR, f.slug);
    const track = JSON.parse(readFileSync(join(dir, 'track.json'), 'utf8')) as TrackData;
    const n = f.terrainN ?? 384;
    let box: Box;
    if (f.terrainBox) {
      box = f.terrainBox;
    } else {
      const e = trackExtent(track);
      const mLat = 10 / 111; // ~10 km
      const mLon = 10 / (111 * Math.cos((((e.lat0 + e.lat1) / 2) * Math.PI) / 180));
      box = { lat0: e.lat0 - mLat, lat1: e.lat1 + mLat, lon0: e.lon0 - mLon, lon1: e.lon1 + mLon };
    }
    console.log(
      `  ${f.slug}: box lat[${box.lat0.toFixed(3)},${box.lat1.toFixed(3)}] lon[${box.lon0.toFixed(3)},${box.lon1.toFixed(3)}] n=${n}`,
    );
    const heights = await buildDEM(box, n);

    // stats
    let mn = Infinity;
    let mx = -Infinity;
    for (const h of heights) {
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    const buf = Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength);
    writeFileSync(join(dir, 'terrain.bin'), buf);

    const metaPath = join(dir, 'meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.terrain = { lat0: box.lat0, lat1: box.lat1, lon0: box.lon0, lon1: box.lon1, n, source: f.terrainSource };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`    DEM ${n}x${n}  min ${mn} m  max ${mx} m (${(mx / 0.3048).toFixed(0)} ft)  → terrain.bin (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Build-time satellite imagery for the curated flights: fetch Sentinel-2
// cloudless tiles (EOX) over each flight's existing terrain box, resample to a
// texture aligned with the DEM grid, and write imagery.jpg next to terrain.bin
// (patching meta.json's terrain.imageryUrl / imagerySource). Night flights are
// skipped — daylight imagery under a night scene reads wrong, and the
// procedural night palette (city lights, moonlit water) is the better look.
//
// Best-effort by design: the imagery host is not reachable from every sandbox
// (some egress policies block it — this repo's CI/dev container may). A flight
// that can't get imagery keeps the procedural palette; nothing fails. Like the
// DEMs, produced .jpg files are committed so builds stay hermetic and offline.
// Run: npm run imagery   (cache: scripts/.tilecache/eox/)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImagery } from '../lib/terrain/imagery';
import type { FlightMeta } from '../lib/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'flights');
const CACHE = join(ROOT, 'scripts', '.tilecache', 'eox');
const PX = 1536;

async function main() {
  const { FLIGHTS } = await import('../data/authored');
  let wrote = 0;
  for (const f of FLIGHTS) {
    const metaPath = join(OUT_DIR, f.slug, 'meta.json');
    if (!existsSync(metaPath)) {
      console.log(`  ${f.slug}: no meta.json (run \`npm run data\` first), skipping`);
      continue;
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as FlightMeta;
    if (!meta.terrain) {
      console.log(`  ${f.slug}: no terrain, skipping`);
      continue;
    }
    if (meta.theme === 'night') {
      console.log(`  ${f.slug}: night scene — procedural palette is the intended look, skipping`);
      continue;
    }
    const box = { lat0: meta.terrain.lat0, lat1: meta.terrain.lat1, lon0: meta.terrain.lon0, lon1: meta.terrain.lon1 };
    try {
      const img = await buildImagery(box, {
        px: PX,
        maxTiles: 220,
        zMax: 13,
        timeoutMs: 20000,
        getCached: (z, x, y) => {
          const p = join(CACHE, String(z), String(x), `${y}.jpg`);
          return existsSync(p) ? readFileSync(p) : null;
        },
        putCached: (z, x, y, buf) => {
          const dir = join(CACHE, String(z), String(x));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${y}.jpg`), buf);
        },
      });
      writeFileSync(join(OUT_DIR, f.slug, 'imagery.jpg'), img.jpeg);
      meta.terrain.imageryUrl = `/flights/${f.slug}/imagery.jpg`;
      meta.terrain.imagerySource = img.source;
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      console.log(`  ${f.slug}: imagery.jpg ${(img.jpeg.length / 1024).toFixed(0)} KB (z${img.z}, ${PX}px)`);
      wrote++;
    } catch (e) {
      console.log(`  ${f.slug}: imagery unavailable (${e instanceof Error ? e.message : e}) — keeping procedural palette`);
    }
  }
  console.log(wrote ? `Done — ${wrote} flight(s) textured.` : 'Done — no imagery written (host unreachable?). Procedural palette remains.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

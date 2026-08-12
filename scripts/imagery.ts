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

// Socket-level failures, as opposed to an HTTP status. `fetch` collapses these
// into an opaque "TypeError: fetch failed", which reads like the host is
// blocking us when it usually isn't — see the hint below.
const TRANSPORT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Dig the real socket error code out of fetch's nested `cause` chain. */
function causeCode(e: unknown): string | null {
  let c = e as { code?: unknown; cause?: unknown } | undefined;
  for (let i = 0; i < 5 && c; i++) {
    if (typeof c.code === 'string') return c.code;
    c = c.cause as typeof c;
  }
  return null;
}

// tiles.maps.eox.at is dual-stack. If a machine resolves its AAAA record but has
// no working IPv6 route to it, Node's happy-eyeballs can surface the dead IPv6
// attempt as ETIMEDOUT instead of falling back to IPv4 — roughly half of tile
// requests die while `curl` to the same URL succeeds every time. That looks
// exactly like "the host is unreachable", so say so explicitly rather than
// letting the next person spend an hour on it. Deliberately NOT worked around in
// code: pinning the family would break genuinely IPv6-only networks.
function transportHint(): void {
  console.log(`
  ── note ───────────────────────────────────────────────────────────────────
  That was a socket-level failure, not a refusal from the host. If \`curl\` can
  reach the tile host but this script can't, suspect a broken IPv6 path:

      curl -6 -sS -o /dev/null https://tiles.maps.eox.at/  # fails => no v6 route

  If so, re-run with happy-eyeballs disabled so Node uses IPv4:

      NODE_OPTIONS=--no-network-family-autoselection npm run imagery
  ───────────────────────────────────────────────────────────────────────────`);
}

async function main() {
  const { FLIGHTS } = await import('../data/authored');
  let wrote = 0;
  let sawTransportFailure = false;
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
      const code = causeCode(e);
      if (code && TRANSPORT_CODES.has(code)) sawTransportFailure = true;
      const detail = `${e instanceof Error ? e.message : e}${code ? ` · ${code}` : ''}`;
      console.log(`  ${f.slug}: imagery unavailable (${detail}) — keeping procedural palette`);
    }
  }
  console.log(wrote ? `Done — ${wrote} flight(s) textured.` : 'Done — no imagery written. Procedural palette remains.');
  if (sawTransportFailure) transportHint();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Build-time ingest: pull the embedded ADS-B track (and, for Denali, the embedded
// DEM) out of each reference prototype and emit the static per-flight artifacts.
//
//   public/flights/<slug>/track.json    the 1 Hz smoothed track, verbatim
//   public/flights/<slug>/terrain.bin   Int16 LE heightmap (Denali here; others via terrain.ts)
//   public/flights/<slug>/meta.json     authored config + track stats + terrain box
//
// This never touches the network — the data already exists in the prototypes and
// was validated by the prior build. scripts/verify.ts re-checks it numerically.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLIGHTS } from '../data/authored';
import type { FlightMeta, TerrainMeta, TrackData } from '../lib/types';
import { trackExtent } from '../lib/replay/track';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROTO_DIR = join(ROOT, 'reference', 'prototypes');
const OUT_DIR = join(ROOT, 'public', 'flights');

function extractScriptJSON(html: string, id: string): string | null {
  const re = new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`);
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function ingestFlight(f: (typeof FLIGHTS)[number]): void {
  const html = readFileSync(join(PROTO_DIR, f.sourceHtml), 'utf8');

  // --- track ---
  const flightRaw = extractScriptJSON(html, 'flightdata');
  if (!flightRaw) throw new Error(`${f.slug}: no flightdata block in ${f.sourceHtml}`);
  const track = JSON.parse(flightRaw) as TrackData;
  if (!Array.isArray(track.s) || track.s.length === 0) throw new Error(`${f.slug}: empty track`);
  track.hz = track.hz ?? 1;

  // QNH/datum correction (gotcha #7): shift baro altitude so touchdown = field
  // elevation and ground samples sit on, not under, the real terrain.
  const corr = f.altCorrectionFt ?? 0;
  if (corr) for (const s of track.s) s[2] += corr;

  const dir = join(OUT_DIR, f.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'track.json'), JSON.stringify(track));

  // --- terrain (embedded only for Denali) ---
  let terrain: TerrainMeta | null = null;
  if (f.embeddedTerrain) {
    const terRaw = extractScriptJSON(html, 'terrain');
    if (!terRaw) throw new Error(`${f.slug}: embeddedTerrain set but no terrain block`);
    const ter = JSON.parse(terRaw) as { lat0: number; lat1: number; lon0: number; lon1: number; n: number; h: string };
    const buf = Buffer.from(ter.h, 'base64'); // raw Int16 LE bytes
    const expected = ter.n * ter.n * 2;
    if (buf.length !== expected) {
      throw new Error(`${f.slug}: terrain size ${buf.length} != expected ${expected} (n=${ter.n})`);
    }
    writeFileSync(join(dir, 'terrain.bin'), buf);
    terrain = { lat0: ter.lat0, lat1: ter.lat1, lon0: ter.lon0, lon1: ter.lon1, n: ter.n, source: f.terrainSource };
  }

  // --- meta ---  (strip authored-only fields; the rest maps onto FlightMeta)
  const {
    sourceHtml: _s,
    embeddedTerrain: _e,
    terrainSource: _t,
    terrainBox: _tb,
    terrainN: _tn,
    fieldElevationFt: _fe,
    altCorrectionFt: _ac,
    ...rest
  } = f;
  const meta: FlightMeta = {
    ...rest,
    altCorrectionFt: corr,
    terrain,
    track: { t0: track.t0, hz: track.hz, count: track.s.length, base: track.base },
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

  const extent = trackExtent(track);
  console.log(
    `  ${f.slug.padEnd(14)} ${String(track.s.length).padStart(5)} samples  ` +
      `lat[${extent.lat0.toFixed(3)},${extent.lat1.toFixed(3)}] lon[${extent.lon0.toFixed(3)},${extent.lon1.toFixed(3)}]  ` +
      `terrain:${terrain ? 'embedded' : 'pending'}`,
  );
}

function main() {
  console.log('Ingesting flights →', OUT_DIR);
  for (const f of FLIGHTS) ingestFlight(f);
  console.log('Done. (Run `npm run terrain` to build DEMs for the non-embedded flights.)');
}

main();

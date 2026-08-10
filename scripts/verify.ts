// THE VERIFICATION HARNESS (docs/HANDOFF.md §4).
//
// Every bug in this project was caught by a numeric check, never by looking at
// the screen — the renders always looked plausible while the trail was 12 km out
// of sync or the aircraft was pinned at maximum bank. This runs as `prebuild`, so
// a flight that fails does not ship.
//
// It exercises the EXACT math the renderer uses: the shared track lib for state /
// attitude / DEM, and three.js CatmullRomCurve3 for the arc-length trail (the same
// class, options, and arcLengthDivisions the engine builds).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FLIGHTS } from '../data/authored';
import type { FlightMeta, TrackData } from '../lib/types';
import {
  M,
  FT_TO_M,
  makeStateAt,
  makeToXZ,
  makeAltY,
  demAt,
  bankRad,
  pitchRad,
} from '../lib/replay/track';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'flights');
const CLAMP_BANK_DEG = 35;
const KT = 0.514444;

interface Check {
  name: string;
  detail: string;
  pass: boolean;
  /** false = informational only, never fails the build. */
  gate?: boolean;
}

const GS_BAND: Record<string, [number, number]> = {
  DHC3: [35, 190], // Turbo Otter
  A319: [95, 600],
  B39M: [95, 600],
};

function verifyFlight(slug: string): Check[] {
  const authored = FLIGHTS.find((f) => f.slug === slug)!;
  const dir = join(OUT_DIR, slug);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as FlightMeta;
  const track = JSON.parse(readFileSync(join(dir, 'track.json'), 'utf8')) as TrackData;
  const S = track.s;
  const T0 = track.t0;
  const T1 = T0 + S.length - 1;
  const checks: Check[] = [];

  const stateAt = makeStateAt(track);
  const toXZ = makeToXZ(meta.origin);
  const altY = makeAltY(meta.datum);

  let heights: Int16Array | null = null;
  if (meta.terrain && existsSync(join(dir, 'terrain.bin'))) {
    const buf = readFileSync(join(dir, 'terrain.bin'));
    heights = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  }

  // ---- 1. Trail tip vs aircraft position (< 200 m worst case) -------------
  // Build the tube curve exactly like the engine, then compare the drawn trail
  // tip (curve.getPointAt(arcFrac(t))) against the aircraft (toXZ(stateAt(t))).
  const curvePts = S.map((s) => new THREE.Vector3(toXZ(s[0], s[1]).x, altY(s[2]), toXZ(s[0], s[1]).z));
  const curve = new THREE.CatmullRomCurve3(curvePts);
  curve.arcLengthDivisions = 4000;
  curve.updateArcLengths();
  const LEN = curve.getLengths(4000);
  const LTOT = LEN[LEN.length - 1];
  const arcFrac = (t: number): number => {
    const u = Math.min(1, Math.max(0, (t - T0) / (S.length - 1)));
    const x = u * (LEN.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = LEN[i];
    const b = LEN[Math.min(LEN.length - 1, i + 1)];
    return (a + (b - a) * f) / LTOT;
  };
  let worstTrailM = 0;
  let worstTrailT = 0;
  const N = 400;
  const tip = new THREE.Vector3();
  for (let k = 0; k <= N; k++) {
    const t = T0 + (k / N) * (T1 - T0);
    const s = stateAt(t);
    const p = toXZ(s.lat, s.lon);
    curve.getPointAt(Math.min(1, Math.max(0, arcFrac(t))), tip);
    const dScene = Math.hypot(tip.x - p.x, tip.y - altY(s.alt), tip.z - p.z);
    const dM = dScene / M;
    if (dM > worstTrailM) {
      worstTrailM = dM;
      worstTrailT = t;
    }
  }
  checks.push({
    name: 'Trail tip vs aircraft',
    detail: `worst ${worstTrailM.toFixed(0)} m @ t+${Math.round(worstTrailT - T0)}s (threshold 200 m)`,
    pass: worstTrailM < 200,
    gate: true,
  });

  // ---- 2. Samples below the terrain mesh (must be 0) ---------------------
  if (heights && meta.terrain) {
    let below = 0;
    let minClearance = Infinity;
    let inBox = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      // only meaningful inside the DEM box
      if (s[0] < meta.terrain.lat0 || s[0] > meta.terrain.lat1 || s[1] < meta.terrain.lon0 || s[1] > meta.terrain.lon1)
        continue;
      inBox++;
      const groundM = demAt(meta.terrain, heights, s[0], s[1]);
      const altM = s[2] * FT_TO_M;
      const clearance = altM - groundM;
      if (clearance < minClearance) minClearance = clearance;
      if (clearance < -5) below++;
    }
    checks.push({
      name: 'Samples below terrain',
      detail: `${below} below · min clearance ${Number.isFinite(minClearance) ? minClearance.toFixed(0) : 'n/a'} m over ${inBox} in-box samples`,
      pass: below === 0,
      gate: true,
    });
  }

  // ---- 3. Max bank (< 35°, < 5% at the clamp) ---------------------------
  let maxBank = 0;
  let atClamp = 0;
  // ---- 4. Max pitch (< 20°) --------------------------------------------
  let maxPitch = 0;
  // ---- 5. Groundspeed plausibility -------------------------------------
  let gsMin = Infinity;
  let gsMax = -Infinity;
  const fieldElev = authored.fieldElevationFt ?? meta.datum;
  for (let sec = 0; sec <= T1 - T0; sec++) {
    const s = stateAt(T0 + sec);
    const bank = Math.abs((bankRad(s.turn, s.gs) * 180) / Math.PI);
    if (bank > maxBank) maxBank = bank;
    if (bank >= CLAMP_BANK_DEG - 0.05) atClamp++;
    const pitch = Math.abs((pitchRad(s.vs, s.gs) * 180) / Math.PI);
    if (pitch > maxPitch) maxPitch = pitch;
    if (s.alt > fieldElev + 500) {
      gsMin = Math.min(gsMin, s.gs);
      gsMax = Math.max(gsMax, s.gs);
    }
  }
  const clampPct = (atClamp / (T1 - T0 + 1)) * 100;
  checks.push({
    name: 'Max bank angle',
    detail: `${maxBank.toFixed(1)}° · ${clampPct.toFixed(1)}% at clamp (thresholds 35°, 5%)`,
    pass: maxBank < CLAMP_BANK_DEG + 0.01 && clampPct < 5,
    gate: true,
  });
  checks.push({
    name: 'Max pitch angle',
    detail: `${maxPitch.toFixed(1)}° (threshold 20°)`,
    pass: maxPitch < 20,
    gate: true,
  });
  const band = GS_BAND[meta.aircraft.icao] ?? [0, 700];
  checks.push({
    name: 'Groundspeed plausibility',
    detail: `airborne ${Number.isFinite(gsMin) ? gsMin.toFixed(0) : 'n/a'}–${Number.isFinite(gsMax) ? gsMax.toFixed(0) : 'n/a'} kt (${meta.aircraft.icao} band ${band[0]}–${band[1]})`,
    pass: !Number.isFinite(gsMin) || (gsMin >= band[0] && gsMax <= band[1]),
    gate: true,
  });

  // ---- 6. Teleport / gap integrity (max 1 s position jump) --------------
  // The track is uniform 1 Hz, so there are no time gaps by construction; a
  // fabricated bridge across a real >60 s dropout would show up as an
  // implausible single-second jump. Flag anything above 700 kt equivalent.
  let maxJumpKt = 0;
  let jumpAtT = 0;
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1];
    const b = S[i];
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const cl = Math.cos((a[0] * Math.PI) / 180);
    const dM = 6371000 * Math.hypot(dLat, dLon * cl);
    const kt = dM / KT / 1; // per 1 s
    if (kt > maxJumpKt) {
      maxJumpKt = kt;
      jumpAtT = T0 + i;
    }
  }
  checks.push({
    name: 'Gap / teleport integrity',
    detail: `max 1 s step ${maxJumpKt.toFixed(0)} kt-equiv @ t+${jumpAtT - T0}s (threshold 700)`,
    pass: maxJumpKt < 700,
    gate: true,
  });

  // ---- 7. Touchdown vs field elevation (~50 ft) ------------------------
  if (authored.fieldElevationFt != null) {
    const last = S[S.length - 1];
    const diff = Math.abs(last[2] - authored.fieldElevationFt);
    checks.push({
      name: 'Touchdown vs field elev',
      detail: `final ${Math.round(last[2])} ft vs field ${authored.fieldElevationFt} ft — Δ${diff.toFixed(0)} ft (threshold 50)`,
      pass: diff <= 50,
      gate: true,
    });
  }

  // ---- 8. Peak elevation in DEM vs published ---------------------------
  // Grid DEMs from public ~28 m tiles undersample sharp spires (the Grand Teton
  // reads ~2.7% low at 232 m posts; the reference Denali DEM itself is 0.6% low),
  // so this gate is 3% — enough to catch cones / gross errors. Every numeric
  // READOUT uses the published elevation from meta, not the mesh.
  if (heights && meta.terrain && meta.reference) {
    const ref = meta.reference;
    const ter = meta.terrain;
    const n = ter.n;
    // Max raw DEM CELL within ~700 m of the published summit. Bilinear smooths a
    // sharp spire down; the question this gate answers is "does the mesh contain
    // a cell at roughly summit height", i.e. it is a real mountain, not a cone.
    const ci = Math.round(((ter.lat1 - ref.lat) / (ter.lat1 - ter.lat0)) * (n - 1));
    const cj = Math.round(((ref.lon - ter.lon0) / (ter.lon1 - ter.lon0)) * (n - 1));
    const postM = ((ter.lat1 - ter.lat0) / (n - 1)) * 111000;
    const R = Math.max(2, Math.round(700 / postM));
    let peakM = -Infinity;
    for (let a = -R; a <= R; a++) {
      for (let b = -R; b <= R; b++) {
        const ii = ci + a;
        const jj = cj + b;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        if (heights[ii * n + jj] > peakM) peakM = heights[ii * n + jj];
      }
    }
    const publishedM = ref.elevationFt * FT_TO_M;
    const pct = (Math.abs(peakM - publishedM) / publishedM) * 100;
    checks.push({
      name: `Peak DEM vs published`,
      detail: `${ref.name} DEM ${(peakM / FT_TO_M).toFixed(0)} ft vs ${ref.elevationFt} ft — ${pct.toFixed(2)}% (threshold 3%)`,
      pass: pct < 3,
      gate: true,
    });
  }

  return checks;
}

function main() {
  console.log('\n  VERIFICATION HARNESS — every point is real, and proven so\n');
  let failed = 0;
  for (const f of FLIGHTS) {
    console.log(`  ── ${f.callsign} (${f.slug}) ${'─'.repeat(Math.max(0, 46 - f.callsign.length - f.slug.length))}`);
    const checks = verifyFlight(f.slug);
    for (const c of checks) {
      const mark = c.pass ? '  ✓' : '  ✗';
      const gate = c.gate === false ? ' (info)' : '';
      console.log(`   ${mark} ${c.name.padEnd(26)} ${c.detail}${gate}`);
      if (!c.pass && c.gate !== false) failed++;
    }
    console.log('');
  }
  if (failed > 0) {
    console.error(`  ✗ ${failed} check(s) failed — a flight that fails does not ship.\n`);
    process.exit(1);
  }
  console.log('  ✓ all flights verified.\n');
}

main();

// Raw log points -> a clean 1 Hz track the renderer can fly, applying the same
// data hygiene the curated flights got (docs/HANDOFF.md §2.1):
//   - resample to a UNIFORM 1 Hz grid with Catmull-Rom (no per-sample velocity jerk)
//   - never interpolate across a gap > 60 s (split, keep the longest run)
//   - drop stale points (< 40 m moved over > 3 s while airborne)
//   - derive heading from smoothed positions (unwrapped); derive groundspeed too,
//     since a GPS log carries no broadcast gs
// Output samples match the engine's format: [lat,lon,altFt,gs,trkUnwrapped,vs,turn].
import type { Sample, TrackData } from '../types';
import { catmullRom } from '../replay/track';
import type { RawPoint } from './parse';

const R = 6371000;
const KT = 1 / 0.514444;

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface ProcessResult {
  track: TrackData;
  stats: {
    count: number;
    durationSec: number;
    lat0: number;
    lat1: number;
    lon0: number;
    lon1: number;
    altMinFt: number;
    altMaxFt: number;
    fieldElevFt: number;
    gsMaxKt: number;
    hadTime: boolean;
  };
  warnings: string[];
}

export function processLog(raw: RawPoint[]): ProcessResult {
  const warnings: string[] = [];
  const hadTime = raw.length > 0 && raw.every((p) => p.hadTime);

  // sort + dedup by time
  let pts = [...raw].sort((a, b) => a.t - b.t).filter((p, i, arr) => i === 0 || p.t !== arr[i - 1].t);
  if (pts.length < 2) throw new Error('Need at least two positions to build a flight.');

  // stale filter: identical/near-identical position rebroadcast while airborne
  const kept: RawPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = kept[kept.length - 1];
    const dt = pts[i].t - prev.t;
    const dm = haversineM(prev.lat, prev.lon, pts[i].lat, pts[i].lon);
    if (dt > 3 && dm < 40 && pts[i].altFt > (minAlt(pts) + 300)) continue;
    kept.push(pts[i]);
  }
  pts = kept;

  // split at gaps > 60 s; keep the longest contiguous run
  const runs: RawPoint[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > 60) runs.push([pts[i]]);
    else runs[runs.length - 1].push(pts[i]);
  }
  if (runs.length > 1) {
    const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
    warnings.push(
      `Log had ${runs.length - 1} gap(s) over 60 s; showing the longest continuous segment (${longest.length} of ${pts.length} points).`,
    );
    pts = longest;
  }
  if (pts.length < 4) throw new Error('Not enough continuous data to build a flight.');

  const T = pts.map((p) => p.t - pts[0].t); // relative seconds
  const duration = Math.floor(T[T.length - 1]);
  if (duration < 5) throw new Error('Track is too short (under 5 seconds).');
  if (duration > 7200) warnings.push('Long flight (> 2 h); playback may be heavy.');

  // time-parameterised Catmull-Rom sampler over the irregular points
  const at = (arr: number[], tau: number): number => {
    // find bracketing i: T[i] <= tau < T[i+1]
    let i = 0;
    while (i < T.length - 2 && T[i + 1] <= tau) i++;
    const f = Math.min(1, Math.max(0, (tau - T[i]) / Math.max(1e-6, T[i + 1] - T[i])));
    const g = (k: number) => arr[Math.min(arr.length - 1, Math.max(0, k))];
    return catmullRom(g(i - 1), g(i), g(i + 1), g(i + 2), f);
  };
  const LAT = pts.map((p) => p.lat);
  const LON = pts.map((p) => p.lon);
  const ALT = pts.map((p) => p.altFt);

  const N = duration + 1;
  const lat = new Array<number>(N);
  const lon = new Array<number>(N);
  const alt = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    lat[i] = at(LAT, i);
    lon[i] = at(LON, i);
    alt[i] = at(ALT, i);
  }

  // derive gs & heading from smoothed positions (central difference over +/-2 s)
  const W = 2;
  const gs = new Array<number>(N);
  const hdg = new Array<number>(N); // unwrapped
  let prevH = bearingDeg(lat[0], lon[0], lat[Math.min(N - 1, 1)], lon[Math.min(N - 1, 1)]);
  let acc = prevH;
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    const dt = b - a || 1;
    gs[i] = (haversineM(lat[a], lon[a], lat[b], lon[b]) / dt) * KT;
    const h = a === b ? prevH : bearingDeg(lat[a], lon[a], lat[b], lon[b]);
    let d = ((h - prevH + 540) % 360) - 180; // shortest signed delta
    acc += d;
    hdg[i] = acc;
    prevH = h;
  }

  // vs (fpm) and turn rate (deg/s), central difference + light smoothing
  const vs = new Array<number>(N);
  const turn = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    const dt = b - a || 1;
    vs[i] = ((alt[b] - alt[a]) / dt) * 60;
    turn[i] = (hdg[b] - hdg[a]) / dt;
  }
  const smooth = (arr: number[]) => arr.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    let s = 0;
    for (let k = a; k <= b; k++) s += arr[k];
    return s / (b - a + 1);
  });
  const gsS = smooth(gs);
  const turnS = smooth(turn);

  const s: Sample[] = [];
  for (let i = 0; i < N; i++) {
    s.push([lat[i], lon[i], alt[i], gsS[i], hdg[i], vs[i], turnS[i]]);
  }

  const t0 = hadTime ? ((Math.floor(pts[0].t) % 86400) + 86400) % 86400 : 0;
  const track: TrackData = { t0, hz: 1, s };

  let lat0 = 90, lat1 = -90, lon0 = 180, lon1 = -180, altMin = Infinity, altMax = -Infinity, gsMax = 0;
  for (const [la, lo, al, g] of s) {
    lat0 = Math.min(lat0, la); lat1 = Math.max(lat1, la);
    lon0 = Math.min(lon0, lo); lon1 = Math.max(lon1, lo);
    altMin = Math.min(altMin, al); altMax = Math.max(altMax, al);
    gsMax = Math.max(gsMax, g);
  }

  return {
    track,
    stats: {
      count: N,
      durationSec: duration,
      lat0, lat1, lon0, lon1,
      altMinFt: altMin, altMaxFt: altMax,
      fieldElevFt: Math.round(altMin),
      gsMaxKt: gsMax,
      hadTime,
    },
    warnings,
  };
}

function minAlt(pts: RawPoint[]): number {
  let m = Infinity;
  for (const p of pts) if (p.altFt < m) m = p.altFt;
  return m;
}

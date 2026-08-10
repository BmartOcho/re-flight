// Raw ADS-B trace -> clean 1 Hz TrackData, applying docs/HANDOFF.md §2.1:
//   - BROADCAST groundspeed (gotcha #4), DERIVED heading (gotcha #5)
//   - GEOMETRIC altitude where present (gotcha #7); 'ground' -> field elevation (#6)
//   - resample to uniform 1 Hz (#1), split at gaps > 60 s (#2), stale filter (#3)
// A day-file can hold several flight legs; we pick the longest airborne run.
import type { Sample, TrackData } from '../types';
import { catmullRom } from '../replay/track';
import { AdsbError, type RawTrace, type TracePoint } from './types';

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

export interface AdsbIngestResult {
  track: TrackData;
  stats: {
    count: number;
    durationSec: number;
    lat0: number; lat1: number; lon0: number; lon1: number;
    altMinFt: number; altMaxFt: number; fieldElevFt: number;
    gsMaxKt: number;
    altitudeType: 'geometric' | 'baro';
  };
  warnings: string[];
}

export function ingestTrace(raw: RawTrace): AdsbIngestResult {
  const warnings: string[] = [];
  let pts = [...raw.points].sort((a, b) => a.t - b.t).filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
  if (pts.length < 4) throw new AdsbError('no_coverage', 'Not enough positions to build a flight.');

  // field elevation ~ lowest observed geometric/baro altitude
  let fieldElev = Infinity;
  for (const p of pts) {
    const a = p.altGeomFt ?? p.altBaroFt;
    if (a != null && a < fieldElev) fieldElev = a;
  }
  if (!Number.isFinite(fieldElev)) fieldElev = 0;

  const geomCount = pts.filter((p) => p.altGeomFt != null).length;
  const altitudeType: 'geometric' | 'baro' = geomCount > pts.length * 0.5 ? 'geometric' : 'baro';
  const altOf = (p: TracePoint): number => (p.ground ? fieldElev : (p.altGeomFt ?? p.altBaroFt ?? fieldElev));

  // stale filter (airborne only)
  const kept: TracePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = kept[kept.length - 1];
    if (pts[i].t - prev.t > 3 && haversineM(prev.lat, prev.lon, pts[i].lat, pts[i].lon) < 40 && altOf(pts[i]) > fieldElev + 300)
      continue;
    kept.push(pts[i]);
  }
  pts = kept;

  // split at gaps > 60 s; pick the run with the most airborne samples (longest leg)
  const runs: TracePoint[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > 60) runs.push([pts[i]]);
    else runs[runs.length - 1].push(pts[i]);
  }
  const airborneCount = (run: TracePoint[]) => run.filter((p) => altOf(p) > fieldElev + 500).length;
  const leg = runs.reduce((best, r) => (airborneCount(r) > airborneCount(best) ? r : best), runs[0]);
  if (runs.length > 1) warnings.push(`Day held ${runs.length} segments; showing the longest flight (${leg.length} of ${pts.length} points).`);
  if (airborneCount(leg) < 5) throw new AdsbError('no_coverage', 'No airborne flight found in that day’s track.');

  const T = leg.map((p) => p.t - leg[0].t);
  const duration = Math.floor(T[T.length - 1]);
  if (duration < 5) throw new AdsbError('no_coverage', 'Flight segment is too short.');

  const LAT = leg.map((p) => p.lat);
  const LON = leg.map((p) => p.lon);
  const ALT = leg.map(altOf);
  const GS = leg.map((p) => p.gsKt ?? 0);
  const at = (arr: number[], tau: number): number => {
    let i = 0;
    while (i < T.length - 2 && T[i + 1] <= tau) i++;
    const f = Math.min(1, Math.max(0, (tau - T[i]) / Math.max(1e-6, T[i + 1] - T[i])));
    const g = (k: number) => arr[Math.min(arr.length - 1, Math.max(0, k))];
    return catmullRom(g(i - 1), g(i), g(i + 1), g(i + 2), f);
  };

  const N = duration + 1;
  const lat = new Array<number>(N);
  const lon = new Array<number>(N);
  const alt = new Array<number>(N);
  const gs = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    lat[i] = at(LAT, i);
    lon[i] = at(LON, i);
    alt[i] = at(ALT, i);
    gs[i] = Math.max(0, at(GS, i)); // broadcast gs, resampled
  }

  // derive heading (unwrapped), vs, turn from smoothed positions
  const W = 2;
  const hdg = new Array<number>(N);
  const vs = new Array<number>(N);
  const turn = new Array<number>(N);
  let prevH = bearingDeg(lat[0], lon[0], lat[Math.min(N - 1, 1)], lon[Math.min(N - 1, 1)]);
  let acc = prevH;
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    const h = a === b ? prevH : bearingDeg(lat[a], lon[a], lat[b], lon[b]);
    acc += ((h - prevH + 540) % 360) - 180;
    hdg[i] = acc;
    prevH = h;
    const dt = b - a || 1;
    vs[i] = ((alt[b] - alt[a]) / dt) * 60;
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    turn[i] = (hdg[b] - hdg[a]) / (b - a || 1);
  }
  const sm = (arr: number[]) => arr.map((_, i) => (arr[Math.max(0, i - 1)] + arr[i] + arr[Math.min(N - 1, i + 1)]) / 3);
  const turnS = sm(turn);

  const s: Sample[] = [];
  for (let i = 0; i < N; i++) s.push([lat[i], lon[i], alt[i], gs[i], hdg[i], vs[i], turnS[i]]);

  const t0 = ((Math.floor(leg[0].t) % 86400) + 86400) % 86400;
  const track: TrackData = { t0, hz: 1, base: Math.floor(leg[0].t) - t0, s };

  let lat0 = 90, lat1 = -90, lon0 = 180, lon1 = -180, altMin = Infinity, altMax = -Infinity, gsMax = 0;
  for (const [la, lo, al, g] of s) {
    lat0 = Math.min(lat0, la); lat1 = Math.max(lat1, la);
    lon0 = Math.min(lon0, lo); lon1 = Math.max(lon1, lo);
    altMin = Math.min(altMin, al); altMax = Math.max(altMax, al);
    gsMax = Math.max(gsMax, g);
  }
  if (altitudeType === 'baro') warnings.push('Only barometric altitude was broadcast; heights against terrain are approximate.');

  return {
    track,
    stats: { count: N, durationSec: duration, lat0, lat1, lon0, lon1, altMinFt: altMin, altMaxFt: altMax, fieldElevFt: Math.round(fieldElev), gsMaxKt: gsMax, altitudeType },
    warnings,
  };
}

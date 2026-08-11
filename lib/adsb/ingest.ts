// Raw ADS-B trace -> clean 1 Hz TrackData, applying docs/HANDOFF.md §2.1:
//   - BROADCAST groundspeed (gotcha #4), DERIVED heading (gotcha #5)
//   - GEOMETRIC altitude where present (gotcha #7); 'ground' -> field elevation (#6)
//   - resample to uniform 1 Hz (#1), split at gaps > 60 s (#2), stale filter (#3)
//   - drop teleport outliers (a single bad broadcast position)
// A day-file holds many legs, so we split the day into real FLIGHTS (takeoff ->
// landing, bounded by ground dwells) and let the caller pick one.
import type { Sample, TrackData } from '../types';
import { catmullRom } from '../replay/track';
import { AdsbError, type RawTrace, type TracePoint } from './types';

const R = 6371000;
const KT = 1 / 0.514444;
const OUTLIER_KT = 600; // a 1 s implied speed above this is a bad position, not a flight

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

export interface FlightSegment {
  points: TracePoint[];
  startT: number;
  endT: number;
  durationSec: number;
  airborneCount: number;
  maxAltFt: number;
}

const altOf = (p: TracePoint, field: number): number =>
  p.ground ? field : p.altGeomFt ?? p.altBaroFt ?? field;

/** Clean the day's points and split them into individual flights. */
export function cleanAndSegment(raw: RawTrace): { flights: FlightSegment[]; fieldElevFt: number } {
  let pts = [...raw.points].sort((a, b) => a.t - b.t).filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
  if (pts.length < 4) throw new AdsbError('no_coverage', 'Not enough positions to build a flight.');

  let field = Infinity;
  for (const p of pts) {
    const a = p.altGeomFt ?? p.altBaroFt;
    if (a != null && a < field) field = a;
  }
  if (!Number.isFinite(field)) field = 0;

  // stale + teleport-outlier filter
  const kept: TracePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = kept[kept.length - 1];
    const dt = pts[i].t - prev.t;
    const dm = haversineM(prev.lat, prev.lon, pts[i].lat, pts[i].lon);
    if (dt > 3 && dm < 40 && altOf(pts[i], field) > field + 300) continue; // stale
    if (dt > 0 && dm / dt / 0.514444 > OUTLIER_KT) continue; // teleport outlier
    kept.push(pts[i]);
  }
  pts = kept;

  // split at gaps > 60 s, then at ground dwells > 120 s (leg boundaries)
  const coarse: TracePoint[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > 60) coarse.push([pts[i]]);
    else coarse[coarse.length - 1].push(pts[i]);
  }
  const raw2: TracePoint[][] = [];
  for (const run of coarse) {
    let seg: TracePoint[] = [];
    let groundStart: number | null = null;
    let segHasAir = false;
    for (const p of run) {
      const air = altOf(p, field) > field + 500;
      if (air) {
        if (groundStart != null && segHasAir && p.t - groundStart > 120) {
          raw2.push(seg);
          seg = [];
          segHasAir = false;
        }
        groundStart = null;
        segHasAir = true;
      } else if (groundStart == null) {
        groundStart = p.t;
      }
      seg.push(p);
    }
    if (seg.length) raw2.push(seg);
  }

  // keep flights with real airborne content; trim long ground tails
  const flights: FlightSegment[] = [];
  for (const seg of raw2) {
    const airIdx: number[] = [];
    for (let i = 0; i < seg.length; i++) if (altOf(seg[i], field) > field + 500) airIdx.push(i);
    if (airIdx.length < 5) continue;
    const startT = seg[airIdx[0]].t - 30;
    const endT = seg[airIdx[airIdx.length - 1]].t + 30;
    const trimmed = seg.filter((p) => p.t >= startT && p.t <= endT);
    if (trimmed.length < 4) continue;
    let maxAlt = -Infinity;
    for (const p of trimmed) maxAlt = Math.max(maxAlt, altOf(p, field));
    flights.push({
      points: trimmed,
      startT: trimmed[0].t,
      endT: trimmed[trimmed.length - 1].t,
      durationSec: Math.floor(trimmed[trimmed.length - 1].t - trimmed[0].t),
      airborneCount: airIdx.length,
      maxAltFt: Math.round(maxAlt),
    });
  }
  if (!flights.length) throw new AdsbError('no_coverage', 'No airborne flight found in that day’s track.');
  return { flights, fieldElevFt: Math.round(field) };
}

/** Pick a sensible default flight: the longest airborne leg. */
export function defaultFlightIndex(flights: FlightSegment[]): number {
  let best = 0;
  for (let i = 1; i < flights.length; i++) if (flights[i].durationSec > flights[best].durationSec) best = i;
  return best;
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

/** Resample one flight segment to a clean 1 Hz track. */
export function ingestSegment(seg: FlightSegment, fieldElevFt: number): AdsbIngestResult {
  const warnings: string[] = [];
  const leg = seg.points;
  const duration = seg.durationSec;
  if (duration < 5) throw new AdsbError('no_coverage', 'Flight segment is too short.');

  const geomCount = leg.filter((p) => p.altGeomFt != null).length;
  const altitudeType: 'geometric' | 'baro' = geomCount > leg.length * 0.5 ? 'geometric' : 'baro';

  const T = leg.map((p) => p.t - leg[0].t);
  const LAT = leg.map((p) => p.lat);
  const LON = leg.map((p) => p.lon);
  const ALT = leg.map((p) => altOf(p, fieldElevFt));
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
    vs[i] = ((alt[b] - alt[a]) / (b - a || 1)) * 60;
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(N - 1, i + W);
    turn[i] = (hdg[b] - hdg[a]) / (b - a || 1);
  }
  const turnS = turn.map((_, i) => (turn[Math.max(0, i - 1)] + turn[i] + turn[Math.min(N - 1, i + 1)]) / 3);

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
    stats: { count: N, durationSec: duration, lat0, lat1, lon0, lon1, altMinFt: altMin, altMaxFt: altMax, fieldElevFt, gsMaxKt: gsMax, altitudeType },
    warnings,
  };
}

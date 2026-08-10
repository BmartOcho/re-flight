// The numeric core, ported VERBATIM from the reference prototype
// (N2YV-denali-summit-flight.html). No three.js here so the verification harness
// can exercise the exact same math in Node.
//
// Every constant and formula below was validated by numeric checks in the
// original build. Do not "clean up" the coefficients — they encode real fixes
// (see docs/HANDOFF.md §2). In particular:
//   - speed is BROADCAST groundspeed, heading is DERIVED (opposite sources, on purpose)
//   - bank = atan(omega*V / g), NOT turn*k  (gotcha #8)
//   - track is interpolated UNWRAPPED then reduced mod 360 (no 359->0 jump)

import type { Sample, TrackData, TerrainMeta } from '../types';

/** Scene units per metre. Denali's 20,310 ft summit is ~137 units tall at this scale. */
export const M = 1 / 45;
export const FT_TO_M = 0.3048;
export const KT_TO_MS = 0.514444;
export const FPM_TO_MS = 0.00508;
export const G = 9.81;

export interface FlightState {
  lat: number;
  lon: number;
  alt: number; // ft MSL
  gs: number; // kt (broadcast)
  trk: number; // deg 0..360 (derived, wrapped)
  vs: number; // fpm
  turn: number; // deg/sec
}

/** Uniform Catmull-Rom basis. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Build a smooth state sampler over a 1 Hz track. `t` is absolute seconds-of-day (Z). */
export function makeStateAt(track: TrackData) {
  const S = track.s;
  const T0 = track.t0;
  const n = S.length;
  return function stateAt(t: number): FlightState {
    const x = Math.min(n - 1, Math.max(0, t - T0));
    const i = Math.floor(x);
    const f = x - i;
    const g = (k: number): Sample => S[Math.min(n - 1, Math.max(0, k))];
    const a = g(i - 1);
    const b = g(i);
    const c = g(i + 1);
    const d = g(i + 2);
    const v = (j: number) => catmullRom(a[j], b[j], c[j], d[j], f);
    return {
      lat: v(0),
      lon: v(1),
      alt: Math.max(0, v(2)),
      gs: v(3),
      trk: ((v(4) % 360) + 360) % 360,
      vs: v(5),
      turn: v(6),
    };
  };
}

/** Equirectangular geo -> scene X/Z about an origin, in scene units. */
export function makeToXZ(origin: { lat: number; lon: number }) {
  const R = 6371000;
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return function toXZ(lat: number, lon: number): { x: number; z: number } {
    const dLat = ((lat - origin.lat) * Math.PI) / 180;
    const dLon = ((lon - origin.lon) * Math.PI) / 180;
    return { x: R * dLon * cosLat * M, z: -R * dLat * M };
  };
}

/** Altitude (ft MSL) -> scene Y, offset by the scene datum (field elevation). No exaggeration. */
export function makeAltY(datum: number) {
  return (ft: number) => (ft - datum) * FT_TO_M * M;
}

/** Lat/lon bounding box of a track's samples. */
export function trackExtent(track: TrackData) {
  let lat0 = 90;
  let lat1 = -90;
  let lon0 = 180;
  let lon1 = -180;
  for (const s of track.s) {
    lat0 = Math.min(lat0, s[0]);
    lat1 = Math.max(lat1, s[0]);
    lon0 = Math.min(lon0, s[1]);
    lon1 = Math.max(lon1, s[1]);
  }
  return { lat0, lat1, lon0, lon1 };
}

/** Haversine great-circle distance in km. */
export function distKm(lat: number, lon: number, refLat: number, refLon: number): number {
  const R = 6371;
  const p1 = (lat * Math.PI) / 180;
  const p2 = (refLat * Math.PI) / 180;
  const dp = ((refLat - lat) * Math.PI) / 180;
  const dl = ((refLon - lon) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Derived bank angle, radians. omega in rad/s, V in m/s, coordinated-turn model.
 * Clamped to +/- 35deg. If most samples sit at the clamp, the INPUT is wrong,
 * not this formula (that was the original bank = turn*9 bug).
 */
export function bankRad(turnDegPerSec: number, gsKt: number): number {
  const omega = (turnDegPerSec * Math.PI) / 180;
  const V = Math.max(gsKt * KT_TO_MS, 20);
  const b = -Math.atan2(omega * V, G);
  return Math.max(-0.61, Math.min(0.61, b));
}

/** Derived pitch, radians: flight-path angle from V/S and groundspeed + small AoA offset. */
export function pitchRad(vsFpm: number, gsKt: number): number {
  const V = Math.max(gsKt * KT_TO_MS, 20);
  const p = Math.atan2(vsFpm * FPM_TO_MS, V) * 1.25 + 0.04;
  return Math.max(-0.3, Math.min(0.3, p));
}

// ---- DEM ----------------------------------------------------------------

/** Decode a base64 Int16 heightmap (browser). */
export function decodeHeightsB64(b64: string): Int16Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

/** Bilinear DEM lookup in metres MSL. Returns 0 outside the box. */
export function demAt(ter: TerrainMeta, heights: Int16Array, lat: number, lon: number): number {
  const NT = ter.n;
  const fi = ((ter.lat1 - lat) / (ter.lat1 - ter.lat0)) * (NT - 1);
  const fj = ((lon - ter.lon0) / (ter.lon1 - ter.lon0)) * (NT - 1);
  if (fi < 0 || fj < 0 || fi > NT - 1 || fj > NT - 1) return 0;
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const di = fi - i0;
  const dj = fj - j0;
  const i1 = Math.min(i0 + 1, NT - 1);
  const j1 = Math.min(j0 + 1, NT - 1);
  return (
    heights[i0 * NT + j0] * (1 - di) * (1 - dj) +
    heights[i0 * NT + j1] * (1 - di) * dj +
    heights[i1 * NT + j0] * di * (1 - dj) +
    heights[i1 * NT + j1] * di * dj
  );
}

// Build-time helpers to read the generated flight metadata. Used by server
// components and generateStaticParams. Node fs — never bundled to the client.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FlightMeta, TrackData } from './types';

const FLIGHTS_DIR = join(process.cwd(), 'public', 'flights');

export function getFlightSlugs(): string[] {
  if (!existsSync(FLIGHTS_DIR)) return [];
  return readdirSync(FLIGHTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(FLIGHTS_DIR, d.name, 'meta.json')))
    .map((d) => d.name);
}

export function getFlightMeta(slug: string): FlightMeta {
  return JSON.parse(readFileSync(join(FLIGHTS_DIR, slug, 'meta.json'), 'utf8')) as FlightMeta;
}

/**
 * The REAL flight path as an SVG `d` string fitted into `w`x`h`. Used on gallery
 * cards so each card shows the actual track shape, not a decorative squiggle.
 */
export function getFlightPathD(slug: string, w = 320, h = 210, pad = 30): string {
  const track = JSON.parse(readFileSync(join(FLIGHTS_DIR, slug, 'track.json'), 'utf8')) as TrackData;
  const S = track.s;
  const step = Math.max(1, Math.floor(S.length / 200));
  const midLat = S[Math.floor(S.length / 2)][0];
  const cos = Math.cos((midLat * Math.PI) / 180);
  const pts: [number, number][] = [];
  for (let i = 0; i < S.length; i += step) pts.push([S[i][1] * cos, S[i][0]]); // x=lon*cos, y=lat
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  return pts
    .map(([x, y], i) => {
      const px = ox + (x - minX) * scale;
      const py = h - (oy + (y - minY) * scale); // flip so north is up
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

// Gallery order: the hero (Denali) first, then most-recently-flown.
const ORDER = ['denali', 'jackson-hole', 'alaska-1282'];

export function getAllFlightMeta(): FlightMeta[] {
  const metas = getFlightSlugs().map(getFlightMeta);
  return metas.sort((a, b) => {
    const ia = ORDER.indexOf(a.slug);
    const ib = ORDER.indexOf(b.slug);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return b.dateISO.localeCompare(a.dateISO);
  });
}

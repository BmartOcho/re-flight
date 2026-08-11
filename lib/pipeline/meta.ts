// Synthesize a FlightMeta for an uploaded flight from its processed stats + the
// pilot's choices. Honest by construction: dataSource 'gps', attitude disclosed
// as derived, terrain source noted when present.
import type { FlightMeta, SceneTheme, TerrainMeta } from '../types';
import type { ProcessResult } from './process';
import { resolveSpec } from '../aircraft/registry';

export interface UploadOptions {
  title: string;
  /** ICAO type designator ("C172", "SR22", "PC12", …) — any registry type. */
  icao: string;
  hasTerrain: boolean;
}

/** Sensible size-toggle steps for the aircraft's real span (small = bigger boost). */
export function scaleMultipliersFor(wingspanM: number): number[] {
  return wingspanM < 24 ? [25, 8, 1] : [8, 3, 1];
}

export function synthMeta(
  stats: ProcessResult['stats'],
  opts: UploadOptions,
  terrain: TerrainMeta | null,
): FlightMeta {
  const spec = resolveSpec(opts.icao);
  const centerLon = (stats.lon0 + stats.lon1) / 2;
  const centerLat = (stats.lat0 + stats.lat1) / 2;
  const relief = stats.altMaxFt - stats.altMinFt;
  const theme: SceneTheme = terrain && relief > 6000 ? 'alpine' : 'day';

  const notes = [
    'Attitude (pitch/roll) and groundspeed are DERIVED from your GPS positions — not recorded.',
    terrain ? 'Terrain built on demand from Terrarium elevation tiles.' : 'No terrain rendered for this flight.',
  ];
  if (!stats.hadTime) notes.push('Your log had no timestamps; the clock shows elapsed time and speeds are approximate.');

  return {
    slug: 'upload',
    callsign: 'YOUR FLIGHT',
    title: opts.title || 'Uploaded flight',
    blurb: `${stats.count.toLocaleString()} real GPS positions · ${fmtDur(stats.durationSec)} · ${Math.round(stats.altMaxFt).toLocaleString()} ft max`,
    aircraft: {
      icao: opts.icao,
      model: spec.name,
      wingspanM: spec.wingspanM,
    },
    dateISO: '',
    dateLabel: 'Your log',
    theme,
    timezone: { label: 'LOCAL', offsetHours: Math.round(centerLon / 15) },
    origin: { lat: centerLat, lon: centerLon },
    datum: stats.fieldElevFt,
    altitudeType: 'geometric',
    dataSource: 'gps',
    altCorrectionFt: 0,
    trackAttribution: 'Your uploaded GPS log',
    terrain,
    reference: null,
    peaks: [],
    events: [],
    phases: phasesFor(stats),
    scaleMultipliers: scaleMultipliersFor(spec.wingspanM),
    camera: 'chase',
    notes,
    track: { t0: 0, hz: 1, count: stats.count }, // t0 overwritten by the real track on load
  };
}

function phasesFor(stats: ProcessResult['stats']) {
  if (stats.altMaxFt - stats.altMinFt < 500) return [{ untilT: null, label: 'IN FLIGHT' }];
  const climbEnd = Math.round(stats.durationSec * 0.25);
  const descentStart = Math.round(stats.durationSec * 0.7);
  return [
    { untilT: climbEnd, label: 'DEPARTURE · CLIMB' },
    { untilT: descentStart, label: 'EN ROUTE' },
    { untilT: null, label: 'ARRIVAL · DESCENT' },
  ];
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

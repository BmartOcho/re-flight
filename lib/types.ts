// Shared data contracts for a flight "story".
//
// A flight is three static files under /public/flights/<slug>/:
//   track.json   — the smoothed 1 Hz ADS-B track (or radar-derived, for archival flights)
//   terrain.bin  — Int16 little-endian DEM heightmap, n*n metres MSL (optional)
//   meta.json    — everything the renderer needs to stage the scene (this file's `FlightMeta`)
//
// Every rendered position is an actual broadcast/observed position. Nothing here
// fabricates a path; gaps are shown as gaps.

/** One resampled 1 Hz sample: [lat, lon, altFt, gsKt, trkDegUnwrapped, vsFpm, turnDegPerSec]. */
export type Sample = [number, number, number, number, number, number, number];

export const SAMPLE = {
  lat: 0,
  lon: 1,
  alt: 2, // feet, MSL — geometric (GPS) where terrain is rendered
  gs: 3, // knots, BROADCAST groundspeed (survives stale positions)
  trk: 4, // degrees, unwrapped, derived from smoothed positions
  vs: 5, // feet/min, vertical rate
  turn: 6, // degrees/sec, turn rate — drives derived bank
} as const;

export interface TrackData {
  /** Seconds-of-day (Z) of the first sample; also the sim clock origin. */
  t0: number;
  /** Sample rate; always 1 for these fixtures. */
  hz?: number;
  /** Unix epoch (s) of 00:00:00Z on the flight day, for local-time display. Optional. */
  base?: number;
  /** The 1 Hz samples. */
  s: Sample[];
}

/** DEM bounding box + grid size. The heights live in the sibling terrain.bin. */
export interface TerrainMeta {
  lat0: number; // south edge
  lat1: number; // north edge
  lon0: number; // west edge
  lon1: number; // east edge
  n: number; // grid is n x n
  /** Human label for the source, shown in the disclosure footer. */
  source: string;
  /**
   * Optional satellite texture draped over the DEM (curated flights: a baked
   * static file next to terrain.bin, e.g. "/flights/<slug>/imagery.jpg"; on-
   * demand flights pass a data: URL at runtime instead). Row 0 = north, same
   * box as the DEM. Absent -> procedural palette.
   */
  imageryUrl?: string;
  /** Attribution for the imagery, shown in the disclosure footer. */
  imagerySource?: string;
}

export interface NamedPeak {
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
}

export interface FlightEvent {
  /** Absolute time (seconds-of-day Z), matching track t0 space. */
  t: number;
  tag: string;
  msg: string;
  /** Seconds the toast stays up. */
  dur: number;
  /** Visual tone: 'alert' flashes red (emergencies), 'calm' is the accent color. */
  tone?: 'alert' | 'calm';
}

export interface PhaseMarker {
  /** Show this label until this absolute time; the last phase uses null. */
  untilT: number | null;
  label: string;
}

/** A polyline of [lat, lon] points, drawn as a thin water ribbon (night scenes). */
export type RiverPath = [number, number][];

export interface ClusterLights {
  lat: number;
  lon: number;
  /** Approximate cluster radius, degrees. */
  radius: number;
  /** Point count. */
  count: number;
}

export interface RunwayStripe {
  lat: number;
  lon: number;
  /** True bearing of the runway centreline, degrees. */
  bearing: number;
  lengthM: number;
  widthM: number;
}

export type SceneTheme = 'day' | 'night' | 'alpine';

export interface FlightMeta {
  slug: string;
  /** Short identifier shown big: "N2YV", "ALASKA 1282". */
  callsign: string;
  /** Headline under the callsign. */
  title: string;
  /** One or two line subtitle. */
  blurb: string;
  aircraft: {
    /**
     * ICAO type designator (B39M, C172, PC12, …). Drives the parametric model:
     * the registry (lib/aircraft/registry.ts) maps it to real dimensions and
     * configuration, so the rendered silhouette matches what actually flew.
     */
    icao: string;
    model: string; // human readable
    registration?: string;
    operator?: string;
    /** Real wingspan, metres — camera distances and true-scale derive from this. */
    wingspanM: number;
    /**
     * Bespoke liveried model key ('talkeetna-otter', 'alaska-max9',
     * 'american-a319') for the curated flights. Absent -> parametric model
     * with a neutral stylised livery.
     */
    livery?: string;
  };
  dateISO: string; // "2026-08-07"
  dateLabel: string; // "Aug 7 2026"
  theme: SceneTheme;
  timezone: { label: string; offsetHours: number }; // e.g. AKDT, -8
  /** Scene origin in geo. */
  origin: { lat: number; lon: number };
  /** Field elevation (ft) subtracted so scene y=0 is local ground. 0 = MSL datum. */
  datum: number;
  /** Which altitude the track carries where terrain is present. */
  altitudeType: 'geometric' | 'baro';
  /**
   * QNH/datum correction (ft) already applied to the track's altitude column so
   * touchdown equals field elevation (gotcha #7). 0 for geometric-altitude flights.
   * Disclosed in the UI when non-zero.
   */
  altCorrectionFt: number;
  /** Data provenance tier — ADS-B is the primary claim; radar is the archival tier; gps is an uploaded pilot log. */
  dataSource: 'adsb' | 'radar' | 'gps';
  /** Attribution string for the track source. */
  trackAttribution: string;
  /** Terrain box + source, or null if this flight renders without a DEM. */
  terrain: TerrainMeta | null;
  /** Reference summit for the "vs X" readout and marker ring. */
  reference: NamedPeak | null;
  peaks: NamedPeak[];
  events: FlightEvent[];
  phases: PhaseMarker[];
  /** Aircraft size toggle. Multipliers over true scale; first is the default. */
  scaleMultipliers: number[];
  /** Starting camera. */
  camera: 'chase' | 'orbit';
  /**
   * Initial playhead (absolute seconds-of-day Z). The full track stays scrubbable;
   * this just opens autoplay on the interesting part (Jackson skips the high cruise
   * in from the east). Defaults to the track start.
   */
  startAtT?: number;
  /** Optional night-scene decorations. */
  decorations?: {
    rivers?: RiverPath[];
    lights?: ClusterLights[];
    runways?: RunwayStripe[];
  };
  /** Extra disclosure lines specific to this flight. */
  notes?: string[];
  /** Track metadata, copied from track.json for convenience. */
  track: { t0: number; hz: number; count: number; base?: number };
}

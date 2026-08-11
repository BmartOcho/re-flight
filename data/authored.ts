// Authored per-flight configuration — the human-written half of each meta.json.
// The ingest pipeline (scripts/ingest.ts) merges this with the real track/terrain
// extracted from the reference prototypes to emit /public/flights/<slug>/meta.json.
//
// Events use ABSOLUTE seconds-of-day (Z), matching each track's t0 space.
import type { FlightMeta } from '@/lib/types';

export interface AuthoredFlight extends Omit<FlightMeta, 'track' | 'terrain' | 'altCorrectionFt'> {
  /** Reference prototype this flight's data is extracted from. */
  sourceHtml: string;
  /** True for Denali, whose DEM is embedded in the prototype. Others build a DEM via scripts/terrain.ts. */
  embeddedTerrain: boolean;
  /** Source string for the terrain, written into meta.terrain once the DEM exists. */
  terrainSource: string;
  /**
   * Explicit DEM box override. When absent, scripts/terrain.ts uses the track
   * extent + ~10 km margin. Jackson sets one because its 170 km east-west track
   * would otherwise make the grid too coarse to resolve the Grand Teton.
   */
  terrainBox?: { lat0: number; lat1: number; lon0: number; lon1: number };
  /** DEM grid size for the built (non-embedded) flights. Default 384. */
  terrainN?: number;
  /** Field elevation (ft MSL) for the touchdown check, if the flight lands. */
  fieldElevationFt?: number;
  /** QNH/datum correction (ft) to add to every altitude sample at ingest. */
  altCorrectionFt?: number;
}

export const FLIGHTS: AuthoredFlight[] = [
  // ------------------------------------------------------------------ Denali
  {
    slug: 'denali',
    callsign: 'N2YV',
    title: 'Over the Summit of Denali',
    blurb:
      'A single-engine bushplane circles the highest peak in North America — 660 metres from the summit at 20,432 ft.',
    aircraft: {
      icao: 'DHC3',
      model: 'DHC-3 Turbo Otter',
      registration: 'N2YV',
      operator: 'Talkeetna Air Taxi',
      wingspanM: 17.7,
      livery: 'talkeetna-otter',
    },
    dateISO: '2026-08-07',
    dateLabel: 'Aug 7 2026',
    theme: 'alpine',
    timezone: { label: 'AKDT', offsetHours: -8 },
    origin: { lat: 63.0692, lon: -151.007 },
    datum: 0,
    altitudeType: 'geometric',
    dataSource: 'adsb',
    trackAttribution: 'ADS-B Exchange',
    sourceHtml: 'N2YV-denali-summit-flight.html',
    embeddedTerrain: true,
    terrainSource: 'Terrarium z12 (~17 m source) · 288 grid · no vertical exaggeration',
    reference: { name: 'DENALI', lat: 63.0692, lon: -151.007, elevationFt: 20310 },
    peaks: [
      { name: 'DENALI', lat: 63.0692, lon: -151.007, elevationFt: 20310 },
      { name: 'MOUNT FORAKER', lat: 62.9604, lon: -151.3997, elevationFt: 17400 },
      { name: 'MOUNT HUNTER', lat: 62.9506, lon: -151.0872, elevationFt: 14573 },
      { name: 'MOUNT SILVERTHRONE', lat: 63.1656, lon: -150.7397, elevationFt: 13220 },
      { name: 'KAHILTNA DOME', lat: 63.0203, lon: -151.2394, elevationFt: 12525 },
      { name: 'MOUNT CROSSON', lat: 63.0186, lon: -151.1897, elevationFt: 12352 },
      { name: 'MOUNT HUNTINGTON', lat: 62.945, lon: -150.8156, elevationFt: 12240 },
      { name: "MOOSE'S TOOTH", lat: 62.9694, lon: -150.6039, elevationFt: 10335 },
    ],
    events: [
      { t: 541, tag: '00:09 Z', msg: 'ENTERING THE ALASKA RANGE', dur: 16 },
      { t: 905, tag: '00:15 Z', msg: '10 KM OUT · STILL 6,250 FT BELOW THE SUMMIT', dur: 18 },
      { t: 1242, tag: '00:20 Z', msg: '17,400 FT · CLIMBING PAST MOUNT FORAKER', dur: 16 },
      { t: 1727, tag: '00:28:47 Z', msg: '20,725 FT — OVER THE TOP OF DENALI', dur: 22 },
      { t: 1902, tag: '00:31:42 Z', msg: 'CLOSEST PASS — 660 METRES FROM THE SUMMIT', dur: 24 },
      { t: 2152, tag: '00:35 Z', msg: 'LETTING DOWN TOWARD TALKEETNA', dur: 16 },
    ],
    phases: [
      { untilT: 541, label: 'INBOUND FROM TALKEETNA' },
      { untilT: 1242, label: 'INTO THE ALASKA RANGE' },
      { untilT: 1702, label: 'CLIMBING · 17,000 → 20,000' },
      { untilT: 2102, label: 'THE SUMMIT CIRCUIT' },
      { untilT: null, label: 'OUTBOUND · DESCENDING' },
    ],
    scaleMultipliers: [25, 8, 1],
    camera: 'chase',
    notes: [
      'Altitude is broadcast GEOMETRIC (GPS) — the only altitude valid against terrain.',
      'Aircraft drawn oversize to stay visible; press the scale button for life size.',
    ],
  },

  // ------------------------------------------------------------- Jackson Hole
  {
    slug: 'jackson-hole',
    callsign: 'AMERICAN 3229',
    title: 'The Teton Approach into Jackson Hole',
    blurb:
      'JFK to Jackson Hole — an A319 threads the valley past the Grand Teton, 5,408 ft below the summit, to a mountain runway.',
    aircraft: {
      icao: 'A319',
      model: 'Airbus A319-115SL',
      registration: 'N9023N',
      operator: 'American Airlines',
      wingspanM: 34.1,
      livery: 'american-a319',
    },
    dateISO: '2026-08-09',
    dateLabel: 'Aug 9 2026',
    theme: 'day',
    timezone: { label: 'MDT', offsetHours: -6 },
    origin: { lat: 43.6073, lon: -110.7377 },
    datum: 6451,
    altitudeType: 'geometric',
    dataSource: 'adsb',
    trackAttribution: 'ADS-B Exchange',
    sourceHtml: 'AAL3229-jackson-hole-teton-approach.html',
    embeddedTerrain: false,
    terrainSource: 'Terrarium z12 (~28 m source) · 384 grid · no vertical exaggeration',
    terrainBox: { lat0: 43.45, lat1: 43.92, lon0: -111.0, lon1: -109.9 },
    terrainN: 384,
    reference: { name: 'GRAND TETON', lat: 43.7412, lon: -110.8024, elevationFt: 13775 },
    peaks: [
      { name: 'GRAND TETON', lat: 43.7412, lon: -110.8024, elevationFt: 13775 },
      { name: 'MOUNT OWEN', lat: 43.7539, lon: -110.8036, elevationFt: 12928 },
      { name: 'TEEWINOT', lat: 43.7561, lon: -110.7936, elevationFt: 12325 },
      { name: 'MIDDLE TETON', lat: 43.7325, lon: -110.8092, elevationFt: 12804 },
      { name: 'SOUTH TETON', lat: 43.7247, lon: -110.8156, elevationFt: 12514 },
      { name: 'MOUNT MORAN', lat: 43.8353, lon: -110.7772, elevationFt: 12605 },
      { name: 'BUCK MOUNTAIN', lat: 43.7017, lon: -110.8206, elevationFt: 11938 },
      { name: 'SLEEPING INDIAN', lat: 43.5083, lon: -110.6167, elevationFt: 11239 },
      { name: 'RENDEZVOUS MTN', lat: 43.5947, lon: -110.8703, elevationFt: 10450 },
      { name: 'JACKSON PEAK', lat: 43.5386, lon: -110.6486, elevationFt: 10741 },
    ],
    events: [
      { t: 66931, tag: '18:35 Z · FL240', msg: 'DESCENDING INTO THE VALLEY · FL240', dur: 16 },
      { t: 67923, tag: '18:52 Z', msg: 'TETON RANGE OFF THE RIGHT WING', dur: 18 },
      { t: 68116, tag: '18:55:16 Z', msg: 'ABEAM GRAND TETON — 5,408 FT BELOW THE SUMMIT', dur: 24 },
      { t: 68173, tag: 'FINAL', msg: 'RUNWAY 19 — JACKSON HOLE', dur: 16 },
      { t: 68268, tag: '18:57:48 Z', msg: 'TOUCHDOWN — FIELD ELEVATION 6,451 FT', dur: 22 },
    ],
    phases: [
      { untilT: 67923, label: 'INBOUND · DESCENDING' },
      { untilT: 68116, label: 'ALONG THE TETON RANGE' },
      { untilT: 68245, label: 'FINAL · RWY 19' },
      { untilT: null, label: 'ON THE GROUND · KJAC' },
    ],
    scaleMultipliers: [8, 3, 1],
    camera: 'chase',
    // Open on the descent into the valley; the 130 km cruise in from the east
    // (real, and scrubbable) is high above terrain and not the story.
    startAtT: 67573,
    fieldElevationFt: 6451,
    decorations: {
      rivers: [
        [
          [43.87, -110.58],
          [43.8, -110.62],
          [43.72, -110.67],
          [43.65, -110.7],
          [43.58, -110.73],
          [43.5, -110.75],
          [43.43, -110.79],
        ],
      ],
      runways: [{ lat: 43.6073, lon: -110.7377, bearing: 199.5, lengthM: 1890, widthM: 45 }],
    },
    notes: ['Scene datum is Jackson Hole field elevation (6,451 ft), so altitudes read against the valley floor.'],
  },

  // -------------------------------------------------------------- Alaska 1282
  {
    slug: 'alaska-1282',
    callsign: 'ALASKA 1282',
    title: 'The Door-Plug Flight, As Actually Flown',
    blurb:
      'Nineteen minutes over Portland at night — a 737 MAX 9 loses its door plug at 16,000 ft and returns. All 177 aboard survive.',
    aircraft: {
      icao: 'B39M',
      model: 'Boeing 737 MAX 9',
      registration: 'N704AL',
      operator: 'Alaska Airlines',
      wingspanM: 35.9,
      livery: 'alaska-max9',
    },
    dateISO: '2024-01-05',
    dateLabel: 'Jan 5 2024',
    theme: 'night',
    timezone: { label: 'PST', offsetHours: -8 },
    origin: { lat: 45.5887, lon: -122.5975 },
    datum: 0,
    altitudeType: 'baro',
    altCorrectionFt: 31,
    dataSource: 'adsb',
    trackAttribution: 'ADS-B Exchange',
    sourceHtml: 'AS1282-door-plug-flight-replay.html',
    embeddedTerrain: false,
    terrainSource: 'Terrarium z12 (~28 m source) · 384 grid · no vertical exaggeration',
    terrainN: 384,
    reference: null,
    peaks: [],
    events: [
      { t: 4035, tag: '01:07:20 Z', msg: 'AIRBORNE — RWY 28L, CLIMBING INTO NIGHT', dur: 14, tone: 'calm' },
      { t: 4413, tag: '01:13:33 Z · FL161', msg: 'DOOR PLUG SEPARATES — RAPID DEPRESSURIZATION', dur: 26, tone: 'alert' },
      { t: 4520, tag: 'MAYDAY DECLARED', msg: 'EMERGENCY RETURN TO PORTLAND', dur: 18, tone: 'alert' },
      { t: 5145, tag: '01:26:45 Z', msg: 'LANDED SAFELY — ALL 177 ABOARD SURVIVE', dur: 20, tone: 'calm' },
    ],
    phases: [
      { untilT: 4035, label: 'DEPARTURE · RWY 28L' },
      { untilT: 4413, label: 'CLIMB · INTO THE NIGHT' },
      { untilT: 4520, label: 'DEPRESSURIZATION · FL160' },
      { untilT: 5145, label: 'EMERGENCY RETURN' },
      { untilT: null, label: 'ON THE GROUND · PDX' },
    ],
    scaleMultipliers: [8, 3, 1],
    camera: 'chase',
    fieldElevationFt: 31,
    decorations: {
      rivers: [
        [
          [45.63, -122.95],
          [45.61, -122.78],
          [45.605, -122.65],
          [45.58, -122.4],
          [45.56, -122.1],
          [45.6, -121.9],
        ],
        [
          [45.35, -122.66],
          [45.47, -122.67],
          [45.52, -122.67],
          [45.58, -122.72],
          [45.65, -122.76],
        ],
      ],
      lights: [
        { lat: 45.515, lon: -122.678, radius: 0.09, count: 700 },
        { lat: 45.63, lon: -122.66, radius: 0.07, count: 380 },
        { lat: 45.52, lon: -122.55, radius: 0.07, count: 320 },
      ],
      runways: [{ lat: 45.5887, lon: -122.5975, bearing: 280, lengthM: 3353, widthM: 46 }],
    },
    notes: [
      'Altitude is barometric, corrected so touchdown equals PDX field elevation (31 ft).',
      'A night scene: city lights and rivers are placed at their true coordinates.',
    ],
  },
];

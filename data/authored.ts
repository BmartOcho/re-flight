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

  // --------------------------------------------------------------- Innsbruck
  // AUA676 Warsaw -> Innsbruck, Sat 14 Feb 2026. Discovered via api.adsb.lol
  // (coverage smoke-test), identity confirmed against hexdb.io/api/v1/aircraft/44001c,
  // track from ADSBx globe_history. Window is the Inn-valley arrival only
  // (12:12:39Z -> 12:18:27Z); the WAW cruise is not part of the story.
  {
    slug: 'innsbruck',
    callsign: 'AUSTRIAN 676',
    title: 'The Inn Valley Approach into Innsbruck',
    blurb:
      'An A320 threads the Inn valley to Innsbruck — the Karwendel wall to the north, Patscherkofel to the south — turning onto final for a 1,907 ft runway ringed by mountains.',
    aircraft: {
      icao: 'A320',
      model: 'Airbus A320-214',
      registration: 'OE-LBP',
      operator: 'Austrian Airlines',
      // Registry span for the A320 (sharkleted reference dimension), which is what
      // the parametric model renders. Leave livery unset: the bespoke liveried
      // models belong to the three original flights.
      wingspanM: 35.8,
    },
    dateISO: '2026-02-14',
    dateLabel: 'Feb 14 2026',
    theme: 'alpine',
    timezone: { label: 'CET', offsetHours: 1 }, // February — standard time, not CEST
    origin: { lat: 47.2602, lon: 11.3439 },
    // Scene datum = LOWI field elevation, so altitudes read against the valley floor.
    datum: 1907,
    // The trace carries alt_geom on 489/490 approach rows — the only altitude valid
    // against a DEM (gotcha #7). No QNH correction needed.
    altitudeType: 'geometric',
    dataSource: 'adsb',
    trackAttribution: 'ADS-B Exchange',
    sourceHtml: 'innsbruck-lowi-approach.html',
    embeddedTerrain: false,
    terrainSource: 'Terrarium z12 (~26 m source) · 384 grid · no vertical exaggeration',
    terrainBox: { lat0: 47.1, lat1: 47.4, lon0: 11.18, lon1: 11.75 },
    terrainN: 384,
    // Coordinates + heights are OSM `natural=peak` nodes (name/ele), cross-checked
    // against the built DEM. The candidate draft's coordinates were approximate and
    // three were badly wrong — Grosser Bettelwurf sat ~6 km off, which read 19% low
    // against the DEM.
    reference: { name: 'PATSCHERKOFEL', lat: 47.2088, lon: 11.4606, elevationFt: 7369 },
    peaks: [
      { name: 'HAFELEKARSPITZE', lat: 47.3128, lon: 11.3863, elevationFt: 7657 },
      { name: 'RUMER SPITZE', lat: 47.3205, lon: 11.4261, elevationFt: 8051 },
      { name: 'GROSSER BETTELWURF', lat: 47.3442, lon: 11.5199, elevationFt: 8940 },
      { name: 'PATSCHERKOFEL', lat: 47.2088, lon: 11.4606, elevationFt: 7369 },
      { name: 'GLUNGEZER', lat: 47.2076, lon: 11.5284, elevationFt: 8783 },
      { name: 'SERLES', lat: 47.124, lon: 11.3813, elevationFt: 8914 },
      { name: 'NOCKSPITZE (SAILE)', lat: 47.1921, lon: 11.3247, elevationFt: 7887 },
    ],
    // Absolute seconds-of-day (Z), re-timed against the real track: t0 = 43959
    // (12:12:39Z), touchdown at 44307 (12:18:27Z).
    events: [
      { t: 43959, tag: '12:12:39 Z', msg: 'DOWN THE INN VALLEY · 26 KM TO RUN', dur: 16, tone: 'calm' },
      { t: 44059, tag: '12:14:19 Z', msg: 'THROUGH 5,400 FT · THE KARWENDEL WALL TO THE NORTH', dur: 16 },
      { t: 44174, tag: '12:16:14 Z', msg: 'TURNING ONTO FINAL · RUNWAY 26', dur: 15 },
      { t: 44196, tag: '12:16:36 Z', msg: 'ABEAM PATSCHERKOFEL · 7,369 FT TO THE SOUTH', dur: 14 },
      { t: 44231, tag: '12:17:11 Z', msg: 'UNDER THE NORDKETTE · HAFELEKARSPITZE 7,657 FT ABOVE', dur: 16 },
      { t: 44271, tag: 'FINAL', msg: 'SHORT FINAL — RUNWAY 26, INNSBRUCK', dur: 14 },
      { t: 44307, tag: '12:18:27 Z', msg: 'TOUCHDOWN — FIELD ELEVATION 1,907 FT', dur: 20, tone: 'calm' },
    ],
    phases: [
      { untilT: 44174, label: 'INBOUND · DOWN THE INN VALLEY' },
      { untilT: 44271, label: 'CURVING ONTO FINAL · RWY 26' },
      { untilT: 44307, label: 'SHORT FINAL · RWY 26' },
      { untilT: null, label: 'ON THE GROUND · INNSBRUCK' },
    ],
    scaleMultipliers: [8, 3, 1],
    camera: 'chase',
    startAtT: 43959,
    fieldElevationFt: 1907,
    decorations: {
      // No river polyline. The candidate draft carried a rough Inn centreline that
      // passed 26 m from the aerodrome reference point — i.e. it drew the river
      // straight down the runway, ~1.3 km south of where the Inn actually runs.
      // A day scene with the satellite drape already shows the real river, so the
      // decorative one is dropped rather than re-guessed.
      //
      // RWY 08/26, 2,000 m x 45 m. Centre and bearing are the published
      // threshold-to-threshold axis (252.2° true), not the aerodrome reference
      // point — the rollout tracks this centreline to within 9 m.
      runways: [{ lat: 47.2606, lon: 11.3427, bearing: 252, lengthM: 2000, widthM: 45 }],
    },
    notes: [
      'Scene datum is Innsbruck field elevation (1,907 ft), so altitudes read against the valley floor.',
      'Altitude is broadcast GEOMETRIC (GPS) — the only altitude valid against terrain.',
      'The replay ends at the first on-ground sample. The valley walls shadow LOWI from ground receivers, so the touchdown itself falls in a 34 s coverage hole; it is interpolated across (well inside the 60 s no-bridge rule), and the rollout beyond it is not shown.',
      'Rendered with the parametric A320 model in the neutral stylised livery.',
    ],
  },

  // ----------------------------------------------------------------- Madeira
  // TAP1685 (CS-TVA) into LPMA, Sun 9 Aug 2026 — the curved visual approach to
  // RWY 05: down the south coast past the field, then a continuous 189° right
  // turn back onto the runway. Coverage here is excellent: 8.8 s worst gap and
  // the touchdown and rollout are both fully captured, unlike Innsbruck.
  {
    slug: 'madeira',
    callsign: 'TAP 1685',
    title: 'The Curved Approach into Madeira',
    blurb:
      'An A320neo runs down Madeira’s south coast, then turns 180° back over the Atlantic to line up on a runway built out on pillars above the sea.',
    aircraft: {
      icao: 'A20N',
      model: 'Airbus A320neo',
      registration: 'CS-TVA',
      operator: 'TAP Air Portugal',
      wingspanM: 35.8,
    },
    dateISO: '2026-08-09',
    dateLabel: 'Aug 9 2026',
    theme: 'day',
    timezone: { label: 'WEST', offsetHours: 1 },
    origin: { lat: 32.6979, lon: -16.7745 },
    // Sea level: the whole approach is flown over the Atlantic, so altitudes read
    // above the water rather than against a valley floor.
    datum: 0,
    // Broadcast geometric altitude — but see altCorrectionFt. On this trace
    // alt_geom is height above the WGS84 ELLIPSOID, not MSL: it reads ~350 ft
    // while the aircraft sits on a 192 ft runway. Madeira has a ~+50 m geoid
    // separation, and all four LPMA arrivals sampled showed the same 158–208 ft
    // bias. Uncorrected, the aircraft floats ~50 m above the DEM.
    altitudeType: 'geometric',
    altCorrectionFt: -158,
    dataSource: 'adsb',
    trackAttribution: 'ADS-B Exchange',
    sourceHtml: 'madeira-lpma-approach.html',
    embeddedTerrain: false,
    terrainSource: 'Terrarium z12 (~24 m source) · 384 grid · no vertical exaggeration',
    terrainBox: { lat0: 32.58, lat1: 32.87, lon0: -16.99, lon1: -16.58 },
    terrainN: 384,
    // OSM natural=peak nodes, cross-checked against the built DEM.
    reference: { name: 'PICO RUIVO', lat: 32.7589, lon: -16.9428, elevationFt: 6109 },
    peaks: [
      { name: 'PICO RUIVO', lat: 32.7589, lon: -16.9428, elevationFt: 6109 },
      { name: 'PICO DAS TORRES', lat: 32.7489, lon: -16.9354, elevationFt: 6073 },
      { name: 'PICO DO ARIEIRO', lat: 32.7356, lon: -16.9287, elevationFt: 5965 },
      { name: 'PICO GRANDE', lat: 32.7371, lon: -16.9879, elevationFt: 5427 },
      // Achada do Teixeira (1,592 m) was dropped: it is a plateau shoulder rather
      // than a distinct summit, and the DEM finds higher ground within 700 m of it
      // (reads 5.5% high). The four above all verify inside 3%.
    ],
    // Absolute seconds-of-day (Z), re-timed against the real track: t0 = 26403
    // (07:20:03Z), first on-ground sample 26876 (07:27:56Z).
    events: [
      { t: 26403, tag: '07:20:03 Z', msg: 'INBOUND · 20 KM TO RUN, THROUGH 5,000 FT', dur: 16, tone: 'calm' },
      { t: 26543, tag: '07:22:23 Z', msg: 'DOWN THE SOUTH COAST · PAST THE FIELD ON ITS PILLARS', dur: 16 },
      { t: 26613, tag: '07:23:33 Z', msg: 'THE TURN · 180 DEGREES BACK TOWARD RUNWAY 05', dur: 16 },
      { t: 26683, tag: '07:24:43 Z', msg: 'HALFWAY ROUND · POINTING WEST AT 2,100 FT', dur: 14 },
      { t: 26753, tag: '07:25:53 Z', msg: 'ROLLING OUT TO THE NORTH · 1,500 FT', dur: 14 },
      { t: 26823, tag: 'FINAL', msg: 'LINED UP ON RUNWAY 05 · 3.6 KM TO GO', dur: 14 },
      { t: 26876, tag: '07:27:56 Z', msg: 'TOUCHDOWN — RUNWAY 05, FIELD ELEVATION 192 FT', dur: 18, tone: 'calm' },
    ],
    phases: [
      { untilT: 26613, label: 'INBOUND · DOWN THE SOUTH COAST' },
      { untilT: 26823, label: 'THE CURVED APPROACH · TURNING TO RWY 05' },
      { untilT: 26876, label: 'FINAL · RWY 05' },
      { untilT: null, label: 'ON THE GROUND · MADEIRA' },
    ],
    scaleMultipliers: [8, 3, 1],
    camera: 'chase',
    startAtT: 26403,
    fieldElevationFt: 192,
    decorations: {
      // RWY 05/23, 2,781 m x 45 m — the runway extended on concrete pillars over
      // the sea. Bearing is the rollout's own measured track (44.4° true).
      runways: [{ lat: 32.6979, lon: -16.7745, bearing: 44, lengthM: 2781, widthM: 45 }],
    },
    notes: [
      'Scene datum is sea level — the approach is flown over the Atlantic.',
      'Altitude is broadcast GEOMETRIC (GPS), corrected by −158 ft: on this trace alt_geom is height above the WGS84 ellipsoid, and Madeira sits on a ~+50 m geoid high, so the raw values read ~158 ft above MSL. The correction is derived from the geometric altitude reported at touchdown on the 192 ft runway.',
      'The full curved approach is real broadcast positions throughout — worst sampling gap 8.8 s, with the touchdown and rollout both captured.',
      'Rendered with the parametric A320neo model in the neutral stylised livery.',
    ],
  },
];

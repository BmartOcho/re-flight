// ============================================================================
// DRAFT — real track not yet fetched (this sandbox's egress blocks the ADS-B
// hosts: api.adsb.lol, hexdb.io, and globe.adsbexchange.com all return HTTP 403
// policy denials). Everything here is the prep that does NOT need the track.
//
// To finish: fetch + process the real track on a machine where those hosts are
// reachable, following docs/ADDING-FLIGHTS.md, then MOVE this object into
// data/authored.ts's FLIGHTS array (this file under data/candidates/ is never
// ingested by the build — scripts only read data/authored.ts).
//
// Before it can ship, the following MUST be filled in from the real flight:
//   1. callsign / aircraft.registration / aircraft.operator / aircraft.wingspanM
//      — from the ADSBx trace callsign + hexdb.io/api/v1/aircraft/{hex}.
//   2. dateISO / dateLabel — the actual flight day (must match the globe_history
//      URL date you fetched).
//   3. events[].t and phases[].untilT — currently RELATIVE offsets built from the
//      `T0` placeholder below. Set `T0` to the real track's t0 (seconds-of-day Z
//      of the first sample) so every absolute `t` resolves; then RE-TIME each beat
//      against the actual track (confirm the aircraft really is abeam each peak /
//      on final at that moment). The relative spacing here is illustrative only.
//   4. altitudeType — 'geometric' if the trace carries alt_geom (index 10),
//      else 'baro' + an altCorrectionFt so touchdown == fieldElevationFt (1907).
//
// Peak elevations below are rounded from published metric heights (general
// knowledge); coordinates are APPROXIMATE. Verify against an authoritative source
// (Austrian BEV / OpenTopoMap / OpenStreetMap) and against the built DEM before
// shipping. scripts/verify.ts cross-checks the `reference` peak against the DEM
// to within 3%.
// ============================================================================

import type { AuthoredFlight } from '@/data/authored';

// PLACEHOLDER time origin. `0` keeps this a valid, compiling module. Set it to the
// real track t0 (seconds-of-day Z) once the track is fetched; every event/phase
// time below is expressed as `T0 + <relative seconds from window start>`.
const T0 = 0;

export const innsbruck: AuthoredFlight = {
  slug: 'innsbruck',

  // callsign / registration / operator are PLACEHOLDERS — no real ADS-B identity
  // is fabricated here. Fill from the chosen flight: the ATC callsign is in the
  // ADSBx trace ("flight" / desc), and registration + type + operator come from
  // hexdb.io/api/v1/aircraft/{hex}. Scheduled/seasonal LOWI arrivals commonly use
  // callsign prefixes BAW (British Airways), EZY/EJU (easyJet), AUA (Austrian).
  callsign: 'LOWI ARRIVAL',
  title: 'The Inn Valley Approach into Innsbruck',
  blurb:
    'A jet threads the Inn valley on the curved RNP to Innsbruck — the Nordkette wall to the north, the Stubai and Tux Alps to the south — down to a 1,907 ft runway ringed by mountains.',

  aircraft: {
    // Real LOWI arrivals are typically A319 / A320 (BA, easyJet, Austrian), with
    // 737s and Q400s seasonal. Mapped to the A319 procedural model per the roster
    // rule (A320 -> A319; there is no separate A320/A321/737-800 model). If the
    // real airframe is a 737, switch icao to 'B39M' instead.
    icao: 'A319',
    model: 'Airbus A319 (rendered model) — set to the real type once known',
    // registration: 'TBD',   // <- from hexdb.io/api/v1/aircraft/{hex}
    // operator: 'TBD',       // <- from hexdb.io RegisteredOwner
    // A319/A320 with wingtip fences ~= 34.1 m; with sharklets ~= 35.8 m. Matches
    // the repo's A319 model span. Set to the real airframe's actual span.
    wingspanM: 34.1,
  },

  // PLACEHOLDER date — replace with the real flight day (Z). A winter Saturday is
  // representative (peak ski-charter changeover traffic into LOWI); must match the
  // date in the globe_history trace URL you fetch.
  dateISO: '2026-02-14',
  dateLabel: 'Feb 14 2026',

  theme: 'alpine',
  timezone: { label: 'CEST', offsetHours: 2 }, // summer time; use CET/+1 for a winter date

  // LOWI aerodrome reference point.
  origin: { lat: 47.2602, lon: 11.3439 },
  // Scene datum = LOWI field elevation (1,907 ft), so altitudes read against the
  // valley floor (same convention as Jackson Hole).
  datum: 1907,

  // Prefer broadcast GEOMETRIC (GPS) altitude where terrain is rendered (gotcha
  // #7). If the chosen trace has no alt_geom, set this to 'baro' and add an
  // altCorrectionFt (below) so touchdown == fieldElevationFt.
  altitudeType: 'geometric',
  // altCorrectionFt: 0,   // <- only if altitudeType is 'baro'

  dataSource: 'adsb',
  trackAttribution: 'ADS-B Exchange',

  // No prototype HTML exists for a net-new flight. The runbook produces the 1 Hz
  // track and wraps it in reference/prototypes/innsbruck-lowi-approach.html as a
  // <script id="flightdata"> block so the existing ingest (`npm run data`) emits
  // track.json + meta.json unchanged. See docs/ADDING-FLIGHTS.md step 4.
  sourceHtml: 'innsbruck-lowi-approach.html',
  embeddedTerrain: false,
  terrainSource: 'Terrarium z12 (~26 m source) · 384 grid · no vertical exaggeration',

  // DEM box: tight around LOWI + the Inn-valley approach corridor + the peaks that
  // frame it — the Nordkette/Karwendel to the north, Patscherkofel/Glungezer/Serles
  // to the south, out to the valley mouth toward Hall/Wattens in the east and
  // Zirl/Oberperfuss in the west. Refine to the real track's extent (+~10 km) once
  // fetched; tightening the box sharpens the DEM (gotcha #20), and it may need to
  // grow east if the arrival begins farther down-valley.
  terrainBox: { lat0: 47.1, lat1: 47.38, lon0: 11.15, lon1: 11.6 },
  terrainN: 384,

  // Reference summit for the "vs X" readout + marker ring: the Nordkette wall
  // directly above the field — the signature backdrop of the LOWI approach.
  reference: { name: 'HAFELEKARSPITZE', lat: 47.3126, lon: 11.3849, elevationFt: 7657 }, // 2334 m

  // Surrounding summits. elevationFt rounded from published metric heights (in the
  // trailing comments); coordinates approximate — verify before shipping.
  peaks: [
    // --- Nordkette / Karwendel (north of the valley) ---
    { name: 'HAFELEKARSPITZE', lat: 47.3126, lon: 11.3849, elevationFt: 7657 }, // 2334 m — Nordkette, above Innsbruck
    { name: 'RUMER SPITZE', lat: 47.3256, lon: 11.4183, elevationFt: 8051 }, // 2454 m — coords approx
    { name: 'GROSSER BETTELWURF', lat: 47.3631, lon: 11.4636, elevationFt: 8945 }, // 2726 m — high Karwendel, coords approx; near N edge of box
    // --- Tux / Stubai Alps (south of the valley) ---
    { name: 'PATSCHERKOFEL', lat: 47.2078, lon: 11.4611, elevationFt: 7369 }, // 2246 m — the summit with the transmitter tower
    { name: 'GLUNGEZER', lat: 47.1961, lon: 11.505, elevationFt: 8783 }, // 2677 m — SE of Patscherkofel, coords approx
    { name: 'SERLES', lat: 47.1297, lon: 11.3917, elevationFt: 8915 }, // 2717 m — Wipptal, near S edge of box
    { name: 'NOCKSPITZE (SAILE)', lat: 47.2006, lon: 11.3006, elevationFt: 7887 }, // 2404 m — above Axamer Lizum
    { name: 'RANGGER KOEPFL', lat: 47.2528, lon: 11.1978, elevationFt: 6362 }, // ~1939 m — near Oberperfuss; elevation/coords LOW-CONFIDENCE, verify (the higher Rosskogel above it is ~2282 m)
  ],

  // ---- ILLUSTRATIVE timeline (RELATIVE to window start via T0). Re-time against
  // the real track. Absolute `t` = T0(real seconds-of-day Z) + offset. Compass
  // directions are used instead of left/right because the final heading / landing
  // runway (08 vs 26) is not known until the track is fetched. ----
  events: [
    { t: T0 + 0, tag: 'T+00:00', msg: 'INBOUND · TOP OF DESCENT INTO THE INN VALLEY', dur: 16, tone: 'calm' },
    { t: T0 + 180, tag: 'T+03:00', msg: 'DOWN THE VALLEY · THE NORDKETTE WALL TO THE NORTH', dur: 18 },
    { t: T0 + 360, tag: 'T+06:00', msg: 'CURVING RNP · TURNING TOWARD RUNWAY 26', dur: 18 },
    { t: T0 + 480, tag: 'T+08:00', msg: 'ABEAM PATSCHERKOFEL · 7,369 FT TO THE SOUTH', dur: 18 },
    { t: T0 + 560, tag: 'FINAL', msg: 'SHORT FINAL — RUNWAY 26, INNSBRUCK', dur: 16 },
    { t: T0 + 600, tag: 'T+10:00', msg: 'TOUCHDOWN — FIELD ELEVATION 1,907 FT', dur: 22, tone: 'calm' },
  ],
  phases: [
    { untilT: T0 + 180, label: 'INBOUND · DESCENDING' },
    { untilT: T0 + 360, label: 'DOWN THE INN VALLEY' },
    { untilT: T0 + 560, label: 'RNP · CURVING TO RWY 26' },
    { untilT: T0 + 600, label: 'FINAL · RWY 26' },
    { untilT: null, label: 'ON THE GROUND · LOWI' },
  ],

  scaleMultipliers: [8, 3, 1],
  camera: 'chase',
  // Open autoplay at the descent into the valley. If the fetched window includes a
  // long high cruise-in, bump this forward (T0 + <seconds to top of descent>).
  startAtT: T0,

  fieldElevationFt: 1907,

  decorations: {
    // Approximate Inn-valley centreline (west -> east through Innsbruck). ROUGH —
    // refine or drop; rivers mainly decorate night scenes.
    rivers: [
      [
        [47.27, 11.2],
        [47.265, 11.28],
        [47.26, 11.35],
        [47.27, 11.42],
        [47.29, 11.5],
      ],
    ],
    // RWY 08/26, ~2,000 m x 45 m. Bearing shown for RWY 26 (landing westbound, the
    // classic down-valley scenic approach). CONFIRM the actual landing runway and
    // touchdown heading from the real track.
    runways: [{ lat: 47.2602, lon: 11.3439, bearing: 256, lengthM: 2000, widthM: 45 }],
  },

  notes: [
    'DRAFT: track not yet fetched. Aircraft identity, flight date, and all event/phase times are placeholders — see the file header and docs/ADDING-FLIGHTS.md.',
    'Scene datum is Innsbruck field elevation (1,907 ft), so altitudes read against the valley floor.',
    'Altitude target is broadcast GEOMETRIC (GPS) where terrain is rendered; if the trace lacks alt_geom, fall back to barometric with a QNH correction so touchdown equals 1,907 ft, and disclose it.',
    'Rendered with the A319 procedural model; the real type (A319/A320, seasonally 737/Q400) is mapped to the closest available model.',
  ],
};

export default innsbruck;

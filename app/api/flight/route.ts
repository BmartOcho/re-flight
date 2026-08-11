// Tail number + date -> a real, verified historical replay. Orchestrates:
//   resolve reg->hex -> fetch ADS-B trace -> ingest (gotchas) -> build terrain ->
//   verify -> synthesize meta. Returns everything the client needs to render.
//
// The data hosts (adsbdb, ADS-B Exchange) are reachable from a server but not from
// the browser, so this must be server-side. Responses cache hard (a given tail+date
// is deterministic) — that also keeps us light on the free archive.
import { NextResponse } from 'next/server';
import { resolveAircraft } from '@/lib/adsb/resolve';
import { fetchTrace } from '@/lib/adsb/trace';
import { cleanAndSegment, ingestSegment, defaultFlightIndex } from '@/lib/adsb/ingest';
import { AdsbError } from '@/lib/adsb/types';
import { buildDEM } from '@/lib/terrain/build';
import { verifyTrack } from '@/lib/pipeline/verify-client';
import type { FlightMeta, SceneTheme } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function mapAircraft(type: string): { icao: 'DHC3' | 'A319' | 'B39M'; wingspanM: number; model: string } {
  const t = type.toUpperCase();
  if (/^A3(1|2|3)/.test(t)) return { icao: 'A319', wingspanM: 34.1, model: `Airbus ${type}` };
  if (/^B7(3|8)|^B3[89]/.test(t)) return { icao: 'B39M', wingspanM: 35.9, model: `Boeing ${type}` };
  return { icao: 'DHC3', wingspanM: 17.7, model: type || 'Light aircraft' };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const reg = (q.get('reg') || '').trim();
  const date = (q.get('date') || '').trim();
  const wantTerrain = q.get('terrain') !== '0';
  if (!reg || !date) return NextResponse.json({ error: 'Provide reg (tail number) and date (YYYY-MM-DD).' }, { status: 400 });

  try {
    const ac = await resolveAircraft(reg);
    const raw = await fetchTrace(ac.hex, date);
    const { flights, fieldElevFt } = cleanAndSegment(raw);
    const flightParam = q.get('flight');
    const idx =
      flightParam != null && Number.isFinite(Number(flightParam))
        ? Math.max(0, Math.min(flights.length - 1, Math.floor(Number(flightParam))))
        : defaultFlightIndex(flights);
    const { track, stats, warnings } = ingestSegment(flights[idx], fieldElevFt);
    const flightList = flights.map((f, i) => ({
      index: i,
      startZ: ((Math.floor(f.startT) % 86400) + 86400) % 86400,
      durationSec: f.durationSec,
      maxAltFt: f.maxAltFt,
    }));

    let terrain: FlightMeta['terrain'] = null;
    let heightsB64: string | null = null;
    if (wantTerrain) {
      const mLat = 8 / 111;
      const mLon = 8 / (111 * Math.cos(((stats.lat0 + stats.lat1) / 2) * (Math.PI / 180)));
      const box = {
        lat0: Math.max(-85, stats.lat0 - mLat),
        lat1: Math.min(85, stats.lat1 + mLat),
        lon0: Math.max(-179, stats.lon0 - mLon),
        lon1: Math.min(179, stats.lon1 + mLon),
      };
      if (box.lat1 - box.lat0 < 3 && box.lon1 - box.lon0 < 3) {
        try {
          const dem = await buildDEM(box, 288, { maxTiles: 160 });
          const buf = Buffer.from(dem.heights.buffer, dem.heights.byteOffset, dem.heights.byteLength);
          heightsB64 = buf.toString('base64');
          terrain = { ...dem.box, n: dem.n, source: `Terrarium z${dem.z} (on demand) · ${dem.n} grid` };
        } catch {
          warnings.push('Terrain could not be built for this flight; rendering without it.');
        }
      } else {
        warnings.push('Flight too large in extent for on-demand terrain; rendering without it.');
      }
    }

    const { checks, pass } = verifyTrack(track, stats);
    const map = mapAircraft(ac.type || raw.type);
    const relief = stats.altMaxFt - stats.altMinFt;
    const theme: SceneTheme = terrain && relief > 6000 ? 'alpine' : 'day';
    const regUp = (ac.registration || raw.registration || reg).toUpperCase();
    const modelNote = map.model !== (ac.type || raw.type) ? `${map.model} (shown as ${map.icao})` : map.model;

    const meta: FlightMeta = {
      slug: 'lookup',
      callsign: regUp,
      title: `${ac.type || raw.type || 'Flight'} · ${date}`,
      blurb: `${(ac.operator ? ac.operator + ' · ' : '')}${stats.count.toLocaleString()} broadcast positions · ${Math.round(stats.altMaxFt).toLocaleString()} ft max`,
      aircraft: { icao: map.icao, model: modelNote, registration: regUp, operator: ac.operator, wingspanM: map.wingspanM },
      dateISO: date,
      dateLabel: date,
      theme,
      timezone: { label: 'LOCAL', offsetHours: Math.round((stats.lon0 + stats.lon1) / 2 / 15) },
      origin: { lat: (stats.lat0 + stats.lat1) / 2, lon: (stats.lon0 + stats.lon1) / 2 },
      datum: stats.fieldElevFt,
      altitudeType: stats.altitudeType,
      dataSource: 'adsb',
      altCorrectionFt: 0,
      trackAttribution: 'ADS-B Exchange',
      terrain,
      reference: null,
      peaks: [],
      events: [],
      phases:
        relief < 500
          ? [{ untilT: null, label: 'IN FLIGHT' }]
          : [
              { untilT: Math.round(stats.durationSec * 0.25), label: 'DEPARTURE · CLIMB' },
              { untilT: Math.round(stats.durationSec * 0.7), label: 'EN ROUTE' },
              { untilT: null, label: 'ARRIVAL · DESCENT' },
            ],
      scaleMultipliers: map.icao === 'DHC3' ? [25, 8, 1] : [8, 3, 1],
      camera: 'chase',
      notes: [
        'Attitude (pitch/roll) is derived from turn & climb rates — not broadcast.',
        `Aircraft model is stylised (${map.icao}); livery stylised.`,
      ],
      track: { t0: track.t0, hz: 1, count: track.s.length, base: track.base },
    };

    return NextResponse.json(
      { meta, track, heightsB64, aircraft: ac, checks, pass, warnings, flights: flightList, chosen: idx },
      { headers: { 'Cache-Control': 'public, s-maxage=31536000, max-age=3600' } },
    );
  } catch (e) {
    if (e instanceof AdsbError) {
      const status = e.code === 'not_found' || e.code === 'no_coverage' ? 404 : e.code === 'bad_input' ? 400 : 502;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'lookup failed' }, { status: 500 });
  }
}

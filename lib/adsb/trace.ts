// Fetch a day's historical trace for an aircraft. Provider-swappable: the default
// is ADS-B Exchange's free globe_history archive (Referer header required, ~2016+,
// coverage varies). To use a paid feed, implement another branch keyed on
// ADSB_PROVIDER / an API key — the route and ingest don't care where the RawTrace
// came from.
//
// Be a good citizen of the free archive: responses are cached hard at the API
// layer so a given tail+date is fetched at most once.
import { AdsbError, type RawTrace, type TracePoint } from './types';

const UA = 're-flight/1.0 (+https://re-flight.vercel.app)';

export function traceProvider(): string {
  return process.env.ADSB_PROVIDER || 'adsbx-history';
}

export async function fetchTrace(hex: string, dateISO: string): Promise<RawTrace> {
  const provider = traceProvider();
  if (provider === 'adsbx-history') return fetchAdsbxHistory(hex, dateISO);
  throw new AdsbError('provider', `ADS-B provider “${provider}” is not implemented. Set ADSB_PROVIDER=adsbx-history or add an adapter.`);
}

async function fetchAdsbxHistory(hex: string, dateISO: string): Promise<RawTrace> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) throw new AdsbError('bad_input', 'Date must be YYYY-MM-DD.');
  const [, Y, M, D] = m;
  const h = hex.toLowerCase();
  const url = `https://globe.adsbexchange.com/globe_history/${Y}/${M}/${D}/traces/${h.slice(-2)}/trace_full_${h}.json`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Referer: 'https://globe.adsbexchange.com/', 'User-Agent': UA } });
  } catch (e) {
    throw new AdsbError('blocked', `Could not reach the ADS-B archive (${e instanceof Error ? e.message : 'network'}).`);
  }
  if (res.status === 404) {
    throw new AdsbError('no_coverage', `No archived track for ${hex} on ${dateISO}. The archive covers ~2016 onward, and coverage is thin in some regions.`);
  }
  if (res.status === 403) {
    throw new AdsbError('blocked', 'The ADS-B archive refused the request (403). It may be rate-limiting or blocking server requests; a paid ADS-B API is the reliable path.');
  }
  if (!res.ok) throw new AdsbError('provider', `ADS-B archive returned ${res.status}.`);

  let j: any;
  try {
    j = await res.json();
  } catch {
    throw new AdsbError('provider', 'ADS-B archive returned a non-JSON response.');
  }
  const rows: any[] = j?.trace;
  const timestamp: number = j?.timestamp;
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(timestamp)) {
    throw new AdsbError('no_coverage', `The archive had no usable trace for ${hex} on ${dateISO}.`);
  }

  const points: TracePoint[] = [];
  for (const r of rows) {
    const lat = r[1];
    const lon = r[2];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const baro = r[3];
    const ground = baro === 'ground';
    points.push({
      t: timestamp + (r[0] || 0),
      lat,
      lon,
      altBaroFt: ground ? null : Number.isFinite(baro) ? baro : null,
      ground,
      gsKt: Number.isFinite(r[4]) ? r[4] : null,
      vrateFpm: Number.isFinite(r[7]) ? r[7] : null,
      altGeomFt: Number.isFinite(r[10]) ? r[10] : null,
    });
  }
  if (points.length < 4) throw new AdsbError('no_coverage', `Too few positions in the archive for ${hex} on ${dateISO}.`);

  return { hex: h, registration: j.r || '', type: j.t || '', timestamp, points };
}

// Registration -> ICAO24 hex + type + operator. A tail number (e.g. N704AL) is
// what a person knows; everything downstream keys off the hex. Uses adsbdb.com
// (free, no key) with hexdb.io as a fallback / for direct-hex confirmation.
import { AdsbError, type AircraftInfo } from './types';

const UA = 're-flight/1.0 (+https://re-flight.vercel.app)';

const isHex = (s: string) => /^[0-9a-fA-F]{6}$/.test(s.trim());

export async function resolveAircraft(input: string): Promise<AircraftInfo> {
  const q = input.trim();
  if (!q) throw new AdsbError('bad_input', 'Enter a tail number (registration) or 6-character ICAO hex.');

  // direct hex
  if (isHex(q)) {
    const info = await hexdb(q.toLowerCase());
    return info ?? { hex: q.toLowerCase(), registration: q.toUpperCase(), type: '' };
  }

  // registration -> hex via adsbdb
  const reg = q.toUpperCase();
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(reg)}`, {
      headers: { 'User-Agent': UA },
    });
    if (res.status === 404) throw new AdsbError('not_found', `No aircraft found for “${reg}”. Check the tail number.`);
    if (!res.ok) throw new AdsbError('provider', `Aircraft lookup failed (adsbdb ${res.status}).`);
    const j = await res.json();
    const a = j?.response?.aircraft;
    if (!a?.mode_s) throw new AdsbError('not_found', `No ICAO hex on record for “${reg}”.`);
    return {
      hex: String(a.mode_s).toLowerCase(),
      registration: a.registration || reg,
      type: a.icao_type || a.type || '',
      typeLong: a.type,
      operator: a.registered_owner || undefined,
    };
  } catch (e) {
    if (e instanceof AdsbError) throw e;
    throw new AdsbError('blocked', `Could not reach the aircraft registry (${e instanceof Error ? e.message : 'network'}).`);
  }
}

async function hexdb(hex: string): Promise<AircraftInfo | null> {
  try {
    const res = await fetch(`https://hexdb.io/api/v1/aircraft/${hex}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.Registration) return null;
    return {
      hex,
      registration: j.Registration,
      type: j.ICAOTypeCode || '',
      typeLong: j.Type,
      operator: j.RegisteredOwner || undefined,
    };
  } catch {
    return null;
  }
}

// Parse a pilot's track log into raw points. Runs in the browser (DOMParser for
// GPX/KML). Tolerant of the common exports: ForeFlight / Garmin GPX, gx:Track
// KML, and generic CSVs (lat/lon/alt/time under many column names).

export interface RawPoint {
  t: number; // epoch seconds (or a synthetic uniform clock if the log had no time)
  lat: number;
  lon: number;
  altFt: number; // feet MSL
  hadTime: boolean;
}

export interface ParsedLog {
  points: RawPoint[];
  format: 'gpx' | 'kml' | 'csv';
  warnings: string[];
}

const M_TO_FT = 1 / 0.3048;

export function parseLog(filename: string, text: string): ParsedLog {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const head = text.slice(0, 400).toLowerCase();
  if (ext === 'gpx' || head.includes('<gpx')) return parseGpx(text);
  if (ext === 'kml' || ext === 'kmz' || head.includes('<kml')) return parseKml(text);
  return parseCsv(text);
}

function parseGpx(text: string): ParsedLog {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const pts = Array.from(doc.getElementsByTagName('trkpt'));
  const src = pts.length ? pts : Array.from(doc.getElementsByTagName('rtept'));
  const points: RawPoint[] = [];
  let synthetic = 0;
  for (const el of src) {
    const lat = Number(el.getAttribute('lat'));
    const lon = Number(el.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleEl = el.getElementsByTagName('ele')[0];
    const timeEl = el.getElementsByTagName('time')[0];
    const ele = eleEl ? Number(eleEl.textContent) : NaN; // GPX ele is metres
    const time = timeEl ? Date.parse(timeEl.textContent ?? '') : NaN;
    const hadTime = Number.isFinite(time);
    points.push({
      t: hadTime ? time / 1000 : synthetic++,
      lat,
      lon,
      altFt: Number.isFinite(ele) ? ele * M_TO_FT : 0,
      hadTime,
    });
  }
  if (!points.length) warnings.push('No <trkpt> points found in the GPX.');
  if (points.some((p) => !p.hadTime)) warnings.push('Some points had no <time>; used a uniform 1 Hz clock.');
  if (points.every((p) => p.altFt === 0)) warnings.push('No <ele> altitude in the GPX — the flight will render flat.');
  return { points, format: 'gpx', warnings };
}

function parseKml(text: string): ParsedLog {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const points: RawPoint[] = [];
  // gx:Track: paired <when> and <gx:coord>lon lat alt</gx:coord>
  const whens = Array.from(doc.getElementsByTagName('when'));
  const coords = Array.from(doc.getElementsByTagName('gx:coord'));
  if (coords.length) {
    for (let i = 0; i < coords.length; i++) {
      const parts = (coords[i].textContent ?? '').trim().split(/\s+/).map(Number);
      if (parts.length < 2) continue;
      const [lon, lat, altM] = parts;
      const time = whens[i] ? Date.parse(whens[i].textContent ?? '') : NaN;
      const hadTime = Number.isFinite(time);
      points.push({ t: hadTime ? time / 1000 : i, lat, lon, altFt: (altM || 0) * M_TO_FT, hadTime });
    }
  } else {
    // LineString fallback: coordinates "lon,lat,alt lon,lat,alt ..." (no time)
    const ls = doc.getElementsByTagName('coordinates')[0];
    if (ls) {
      const tuples = (ls.textContent ?? '').trim().split(/\s+/);
      tuples.forEach((tp, i) => {
        const [lon, lat, altM] = tp.split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          points.push({ t: i, lat, lon, altFt: (altM || 0) * M_TO_FT, hadTime: false });
        }
      });
      warnings.push('KML had no timestamps; used a uniform 1 Hz clock (speeds are approximate).');
    }
  }
  if (!points.length) warnings.push('No track points found in the KML (expected gx:Track or a LineString).');
  return { points, format: 'kml', warnings };
}

function parseCsv(text: string): ParsedLog {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  // find the header row (first row containing "lat")
  let hi = lines.findIndex((l) => /lat/i.test(l));
  if (hi < 0) hi = 0;
  const delim = (lines[hi].match(/\t/g)?.length ?? 0) > (lines[hi].match(/,/g)?.length ?? 0) ? '\t' : ',';
  const headers = lines[hi].split(delim).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const find = (...names: string[]) => headers.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iLat = find('latitude', 'lat');
  const iLon = find('longitude', 'lon', 'lng', 'long');
  const iAlt = find('altitude', 'alt', 'gps alt', 'ele', 'elevation', 'baro');
  const iTime = find('timestamp', 'time', 'utc', 'date/time', 'lcl time', 'gps time');
  if (iLat < 0 || iLon < 0) {
    warnings.push('CSV had no recognisable latitude/longitude columns.');
    return { points: [], format: 'csv', warnings };
  }
  // Altitude units: assume feet (aviation) unless the header says metres.
  const altHeader = iAlt >= 0 ? headers[iAlt] : '';
  const altInMetres = /\bm\b|metre|meter|\(m\)/.test(altHeader);
  const points: RawPoint[] = [];
  let synthetic = 0;
  for (let r = hi + 1; r < lines.length; r++) {
    const cols = lines[r].split(delim);
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const altRaw = iAlt >= 0 ? Number(cols[iAlt]) : NaN;
    const altFt = Number.isFinite(altRaw) ? (altInMetres ? altRaw * M_TO_FT : altRaw) : 0;
    let t = synthetic++;
    let hadTime = false;
    if (iTime >= 0) {
      const raw = cols[iTime]?.trim();
      const parsed = raw ? Date.parse(raw) : NaN;
      if (Number.isFinite(parsed)) {
        t = parsed / 1000;
        hadTime = true;
      } else if (raw && /^\d+(\.\d+)?$/.test(raw)) {
        t = Number(raw); // seconds
        hadTime = true;
      }
    }
    points.push({ t, lat, lon, altFt, hadTime });
  }
  if (!points.length) warnings.push('CSV had no parseable data rows.');
  if (iAlt < 0) warnings.push('No altitude column found — the flight will render flat.');
  else if (!altInMetres) warnings.push('Assumed altitude is in feet; toggle if your log is in metres.');
  return { points, format: 'csv', warnings };
}

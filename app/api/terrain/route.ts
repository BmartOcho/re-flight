// On-demand terrain for uploaded flights. The browser can't fetch the elevation
// tiles directly (no CORS on the bucket), so this same-origin endpoint builds the
// DEM server-side and returns an Int16 heightmap as base64. Responses are
// deterministic for a given box, so they cache hard on the CDN.
import { NextResponse } from 'next/server';
import { buildDEM, type Box } from '@/lib/terrain/build';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SPAN_DEG = 3.0; // guard against someone requesting a continent
const MAX_N = 384;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const num = (k: string) => Number(q.get(k));
  const box: Box = { lat0: num('lat0'), lat1: num('lat1'), lon0: num('lon0'), lon1: num('lon1') };
  const n = Math.min(MAX_N, Math.max(64, Math.round(num('n') || 288)));

  for (const v of [box.lat0, box.lat1, box.lon0, box.lon1]) {
    if (!Number.isFinite(v)) return NextResponse.json({ error: 'bad box' }, { status: 400 });
  }
  if (box.lat1 <= box.lat0 || box.lon1 <= box.lon0) {
    return NextResponse.json({ error: 'box must be lat0<lat1, lon0<lon1' }, { status: 400 });
  }
  if (box.lat1 - box.lat0 > MAX_SPAN_DEG || box.lon1 - box.lon0 > MAX_SPAN_DEG) {
    return NextResponse.json({ error: `box span exceeds ${MAX_SPAN_DEG}°` }, { status: 413 });
  }

  try {
    const dem = await buildDEM(box, n, { maxTiles: 160 });
    const buf = Buffer.from(dem.heights.buffer, dem.heights.byteOffset, dem.heights.byteLength);
    return NextResponse.json(
      { n: dem.n, z: dem.z, box: dem.box, min: dem.min, max: dem.max, heightsB64: buf.toString('base64') },
      { headers: { 'Cache-Control': 'public, s-maxage=31536000, max-age=86400, immutable' } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'terrain build failed' }, { status: 502 });
  }
}

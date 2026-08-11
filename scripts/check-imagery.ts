// Offline check for lib/terrain/imagery.ts: injects synthetic tiles through the
// cache hook (no network), then verifies the resampled texture's size and
// orientation — row 0 must be NORTH (the DEM grid's row order), and the
// west->east gradient must survive the mercator->lat/lon resample.
// Run: npx tsx scripts/check-imagery.ts
import * as jpeg from 'jpeg-js';
import { buildImagery } from '../lib/terrain/imagery';

function syntheticTile(z: number, x: number, y: number): Buffer {
  // encode position into color with a 64-tile ramp period (fine enough to vary
  // measurably across a small box): R tracks y (north-south), G tracks x.
  const PERIOD = 64 * 256;
  const data = Buffer.alloc(256 * 256 * 4);
  for (let p = 0; p < 256 * 256; p++) {
    const py = Math.floor(p / 256);
    const px = p % 256;
    data[p * 4] = Math.round((255 * ((y * 256 + py) % PERIOD)) / PERIOD); // R: increases southward
    data[p * 4 + 1] = Math.round((255 * ((x * 256 + px) % PERIOD)) / PERIOD); // G: increases eastward
    data[p * 4 + 2] = 128;
    data[p * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width: 256, height: 256 }, 95).data);
}

async function main() {
  const box = { lat0: 45.0, lat1: 45.7, lon0: -123.0, lon1: -122.0 };
  const img = await buildImagery(box, {
    px: 256,
    maxTiles: 64,
    zMax: 12,
    getCached: (z, x, y) => syntheticTile(z, x, y),
    putCached: () => {},
  });
  const dec = jpeg.decode(img.jpeg, { useTArray: true });
  const fails: string[] = [];
  if (dec.width !== 256 || dec.height !== 256) fails.push(`size ${dec.width}x${dec.height}`);
  const px = (i: number, j: number) => {
    const k = (i * dec.width + j) * 4;
    return [dec.data[k], dec.data[k + 1]];
  };
  const [rN] = px(2, 128);
  const [rS] = px(253, 128);
  const [, gW] = px(128, 2);
  const [, gE] = px(128, 253);
  // R increases southward in the source, so row 0 (north) must have LOWER R
  if (!(rS - rN > 2)) fails.push(`row0 is not north (R north ${rN}, south ${rS})`);
  // G increases eastward: col 0 (west, lon0) must have lower G
  if (!(gE - gW > 2)) fails.push(`col0 is not west (G west ${gW}, east ${gE})`);
  if (!img.source.includes('EOX')) fails.push('missing attribution');
  if (fails.length) {
    console.error('✗ imagery check FAILED: ' + fails.join('; '));
    process.exit(1);
  }
  console.log(`✓ imagery resample: 256px, z${img.z}, row0=north, col0=west, attribution present`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

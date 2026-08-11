// Numeric sanity gate for the parametric aircraft library (lib/aircraft): build
// every registry type and confirm the produced geometry's bounding box matches
// the published dimensions — span in x, length in z — with no NaNs, and that
// spanUnits (what the engine's TRUE_SCALE derives from) equals the spec span.
// Same philosophy as verify.ts: a model that "looks fine" can still be wrong;
// the numbers catch it. Run: npx tsx scripts/check-aircraft.ts
import * as THREE from 'three';
import { ALL_TYPE_DESIGNATORS, resolveSpec } from '../lib/aircraft/registry';
import { buildParametric } from '../lib/aircraft/parametric';

// A few family-fallback and unknown designators, to exercise the guess paths.
const EXTRAS = ['B77F', 'A21X', 'CRJ5', 'E140', 'PA20', 'ZZZZ', 'GRND'];

let fail = 0;
let pass = 0;
const rows: string[] = [];
for (const t of [...ALL_TYPE_DESIGNATORS, ...EXTRAS]) {
  const spec = resolveSpec(t);
  try {
    const built = buildParametric(spec);
    const box = new THREE.Box3().setFromObject(built.group);
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    const bad: string[] = [];
    if (![sx, sy, sz].every(Number.isFinite)) bad.push('non-finite bbox');
    if (spec.kind === 'fixed') {
      if (Math.abs(sx - spec.wingspanM) > spec.wingspanM * 0.12 + 0.6) bad.push(`span ${sx.toFixed(1)} vs ${spec.wingspanM}`);
      if (sz < spec.lengthM * 0.85 || sz > spec.lengthM * 1.45) bad.push(`length ${sz.toFixed(1)} vs ${spec.lengthM}`);
    } else if (Math.abs(sx - spec.wingspanM) > spec.wingspanM * 0.15) {
      bad.push(`rotor ${sx.toFixed(1)} vs ${spec.wingspanM}`);
    }
    if (built.spanUnits !== spec.wingspanM) bad.push(`spanUnits ${built.spanUnits} != ${spec.wingspanM}`);
    // the engine silhouette-outlines meshes under 400 verts; flag any that miss out
    let dense = 0;
    built.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.geometry?.attributes?.position?.count ?? 0) >= 400) dense++;
    });
    if (bad.length) {
      fail++;
      rows.push(`✗ ${t.padEnd(5)} ${spec.name.padEnd(36)} ${bad.join('; ')}`);
    } else {
      pass++;
      if (dense) rows.push(`~ ${t.padEnd(5)} ${spec.name.padEnd(36)} ok, but ${dense} meshes ≥400 verts (no outline)`);
    }
  } catch (e) {
    fail++;
    rows.push(`✗ ${t.padEnd(5)} BUILD THREW: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(rows.join('\n') || '(all clean)');
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

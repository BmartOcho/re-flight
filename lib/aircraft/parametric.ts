// Parametric aircraft builder: constructs a recognizable low-poly model from an
// AircraftSpec (registry.ts) — correct wingspan/length, wing position, sweep,
// engine count/type/placement, tail kind. Built in METRES with the nose along
// -Z (the bespoke models' convention), so spanUnits === wingspanM and the
// engine's TRUE_SCALE math holds unchanged. The livery is a deliberately
// neutral white/steel-blue scheme; the UI discloses that it is stylised.
//
// Geometry stays low-poly on purpose: the engine wraps sub-400-vertex meshes
// in a dark EdgesGeometry outline so the aircraft reads as a silhouette at
// distance (HANDOFF gotcha #27) — dense meshes would silently lose that.
import * as THREE from 'three';
import type { AircraftSpec } from './registry';
import type { BuiltAircraft } from './index';

const WHITE = 0xf4f6f9;
const ACCENT = 0x2f6ea8;
const DARK = 0x1b202b;
const FAN = 0x9aa4b8;
const GLASS = 0x2b3a4a;

export function buildParametric(spec: AircraftSpec): BuiltAircraft {
  return spec.kind === 'rotor' ? buildRotorcraft(spec) : buildFixedWing(spec);
}

/* ------------------------------------------------------------- fixed wing */

function buildFixedWing(spec: AircraftSpec): BuiltAircraft {
  const g = new THREE.Group();
  const L = spec.lengthM;
  const R = spec.fusRadiusM;
  const span = spec.wingspanM;
  const half = span / 2;
  const h = L / 2;
  const jet = spec.engineType === 'jet';
  const prop = !jet;

  const mBody = new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.25, roughness: 0.45 });
  const mAccent = new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: DARK, metalness: 0.5, roughness: 0.4 });
  const mFan = new THREE.MeshStandardMaterial({ color: FAN, metalness: 0.85, roughness: 0.25 });
  const mGlass = new THREE.MeshStandardMaterial({ color: GLASS, metalness: 0.5, roughness: 0.25 });

  // ---- fuselage (lathe about Y; y maps to -z after rotation, so +y = nose)
  const pts: THREE.Vector2[] = [];
  if (jet) {
    pts.push(new THREE.Vector2(0.001, -h));
    pts.push(new THREE.Vector2(R * 0.35, -h + L * 0.06));
    pts.push(new THREE.Vector2(R, -h + L * 0.24));
    pts.push(new THREE.Vector2(R, h - R * 2.4));
    pts.push(new THREE.Vector2(R * 0.92, h - R * 1.2));
    pts.push(new THREE.Vector2(R * 0.6, h - R * 0.4));
    pts.push(new THREE.Vector2(0.001, h));
  } else {
    // prop: blunt cowl forward, cabin, long tail taper
    pts.push(new THREE.Vector2(0.001, -h));
    pts.push(new THREE.Vector2(R * 0.3, -h + L * 0.1));
    pts.push(new THREE.Vector2(R * 0.95, -h + L * 0.42));
    pts.push(new THREE.Vector2(R, h - L * 0.3));
    pts.push(new THREE.Vector2(R * 0.9, h - L * 0.08));
    pts.push(new THREE.Vector2(R * 0.55, h));
  }
  const fus = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mBody);
  fus.rotation.x = -Math.PI / 2;
  g.add(fus);

  // 747 upper-deck hump
  if (spec.hump) {
    const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mBody);
    hump.scale.set(R * 0.72, R * 0.72, L * 0.14);
    hump.position.set(0, R * 0.62, -h + L * 0.26);
    g.add(hump);
  }

  // cockpit
  if (jet || spec.engineType === 'turboprop') {
    const cp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, R * 0.3, R * 0.7), mDark);
    cp.position.set(0, R * 0.38, -h + (jet ? R * 0.9 : L * 0.16));
    g.add(cp);
  } else {
    const win = new THREE.Mesh(new THREE.BoxGeometry(R * 1.9, R * 0.55, L * 0.28), mGlass);
    win.position.set(0, R * 0.55, -h + L * 0.38);
    g.add(win);
  }

  // ---- wings
  const AR = spec.kind === 'fixed' && spec.engineType === 'piston' ? 7.3 : spec.wingPos === 'high' && spec.engineType === 'turboprop' && spec.engineCount >= 2 ? 11.5 : 9;
  const meanChord = span / AR;
  const rootChord = Math.max(0.5, (2 * meanChord) / (1 + spec.taper));
  const tipChord = rootChord * spec.taper;
  const wingY = spec.wingPos === 'high' ? R * 0.85 : spec.wingPos === 'low' ? -R * 0.72 : 0;
  const wingZf = jet ? (spec.engineMount === 'aft' ? 0.04 : -0.05) : spec.wingPos === 'high' ? -0.12 : -0.08;
  const wingZ = wingZf * L; // root leading edge
  const sweep = (spec.sweepDeg * Math.PI) / 180;
  const dihedral = (spec.dihedralDeg * Math.PI) / 180;
  const thick = Math.max(0.07, rootChord * 0.1);
  const tipBack = half * Math.tan(sweep);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(half, -tipBack);
  wingShape.lineTo(half, -tipBack - tipChord);
  wingShape.lineTo(0, -rootChord);
  wingShape.closePath();

  const tipY: number[] = [];
  [1, -1].forEach((side) => {
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: thick, bevelEnabled: false }), mBody);
    w.rotation.x = -Math.PI / 2; // shape +y -> -z, so sweep goes tailward
    w.scale.x = side;
    w.rotation.z = side * dihedral;
    w.position.set(0, wingY, wingZ);
    g.add(w);
    tipY.push(wingY + half * Math.sin(dihedral));
  });
  const tipZ = wingZ + tipBack + tipChord * 0.5;

  // winglets
  if (spec.winglet !== 'none' && spec.winglet !== 'raked') {
    [1, -1].forEach((side, i) => {
      const wl = (up: number, len: number, cant: number) => {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(thick, len, tipChord * 0.9), mAccent);
        blade.position.set(side * half, tipY[i] + (up * len) / 2, tipZ);
        blade.rotation.z = side * up * -cant;
        blade.rotation.x = -0.3;
        g.add(blade);
      };
      const wh = Math.max(0.4, span * 0.05);
      if (spec.winglet === 'split') {
        wl(1, wh, 0.35);
        wl(-1, wh * 0.55, 0.35);
      } else if (spec.winglet === 'sharklet') {
        wl(1, wh, 0.45);
      } else {
        wl(1, wh, 0.2);
      }
    });
  } else if (spec.winglet === 'raked') {
    [1, -1].forEach((side, i) => {
      const ext = new THREE.Mesh(new THREE.BoxGeometry(span * 0.045, thick, tipChord * 0.8), mBody);
      ext.position.set(side * (half - span * 0.01), tipY[i], tipZ + tipChord * 0.35);
      ext.rotation.y = side * -0.5;
      ext.rotation.z = side * 0.12;
      g.add(ext);
    });
  }

  // high-wing lift struts
  if (spec.struts) {
    [1, -1].forEach((side) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * R * 3, 0.035 * R * 3, half * 0.62, 6), mBody);
      st.position.set(side * half * 0.28, wingY - (wingY + R * 0.6) / 2 + 0, wingZ + rootChord * 0.5);
      // from lower fuselage (y=-R*0.55) up to ~55% semi-span
      const y0 = -R * 0.55;
      const y1 = wingY - 0.05;
      const x1 = side * half * 0.5;
      st.position.set((x1 + side * R * 0.6) / 2, (y0 + y1) / 2, wingZ + rootChord * 0.55);
      st.rotation.z = Math.atan2(x1 - side * R * 0.6, y1 - y0);
      st.scale.y = Math.hypot(x1 - side * R * 0.6, y1 - y0) / (half * 0.62);
      g.add(st);
    });
  }

  // ---- tail
  const finH = Math.max(0.8, span * (jet ? 0.16 : spec.engineCount >= 2 && spec.wingPos === 'high' ? 0.17 : 0.13));
  const finRoot = Math.max(0.6, L * 0.16);
  const finSweep = jet ? 0.72 : 0.2; // tan(sweep)
  const finZ = h - finRoot * 1.05; // root leading edge
  const stabSpan = span * 0.34;
  const stabChord = finRoot * 0.55;
  const stabThick = Math.max(0.05, thick * 0.7);

  const centreEngine = spec.engineCount === 3;
  const finBaseY = centreEngine && spec.engineMount === 'wing' ? R * 1.5 : R * 0.5;

  if (spec.tail !== 'v') {
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(finH * finSweep, finH);
    finShape.lineTo(finH * finSweep + finRoot * 0.45, finH);
    finShape.lineTo(finRoot, 0);
    finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: Math.max(0.08, thick), bevelEnabled: false }), mAccent);
    // shape x -> +z (tailward), y -> up
    fin.rotation.y = -Math.PI / 2;
    fin.position.set(Math.max(0.08, thick) / 2, finBaseY, finZ);
    g.add(fin);

    const stabY = spec.tail === 't' ? finBaseY + finH : spec.tail === 'cruciform' ? finBaseY + finH * 0.45 : R * 0.25;
    const stabZ = spec.tail === 't' || spec.tail === 'cruciform' ? finZ + finH * finSweep : h - stabChord * 1.5;
    const stabShape = new THREE.Shape();
    const sHalf = stabSpan / 2;
    const sBack = sHalf * Math.tan(sweep * 0.9 + 0.08);
    stabShape.moveTo(0, 0);
    stabShape.lineTo(sHalf, -sBack);
    stabShape.lineTo(sHalf, -sBack - stabChord * 0.5);
    stabShape.lineTo(0, -stabChord);
    stabShape.closePath();
    [1, -1].forEach((side) => {
      const st = new THREE.Mesh(new THREE.ExtrudeGeometry(stabShape, { depth: stabThick, bevelEnabled: false }), mBody);
      st.rotation.x = -Math.PI / 2;
      st.scale.x = side;
      st.rotation.z = side * 0.06;
      st.position.set(0, stabY, stabZ);
      g.add(st);
    });
  } else {
    // V-tail (Bonanza V35, Vision Jet)
    const vSpan = span * 0.24;
    [1, -1].forEach((side) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(vSpan, stabThick, finRoot * 0.8), mAccent);
      panel.position.set(side * vSpan * 0.42, R * 0.4 + vSpan * 0.35, h - finRoot * 0.6);
      panel.rotation.z = side * 0.7;
      g.add(panel);
    });
  }

  // ---- engines
  const animateFns: ((t: number, dt: number, reduced: boolean) => void)[] = [];
  const propDisc = (r: number, x: number, y: number, z: number) => {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 24),
      new THREE.MeshBasicMaterial({ color: 0x8fa0b4, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    disc.position.set(x, y, z);
    g.add(disc);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, r * 1.96, 0.06), mDark);
    blade.position.set(x, y, z + 0.03);
    g.add(blade);
    animateFns.push((_t, dt, reduced) => {
      if (!reduced) blade.rotation.z += dt * 40;
    });
    return disc;
  };
  const jetNacelle = (r: number, len: number, x: number, y: number, z: number, pylonUp: boolean) => {
    const nac = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 14), mBody);
    cowl.rotation.x = Math.PI / 2;
    nac.add(cowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, r * 0.1, 6, 18), mDark);
    lip.position.z = -len / 2;
    nac.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 16), mFan);
    fan.position.z = -len / 2 + 0.02;
    nac.add(fan);
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(r * 0.25, r * (pylonUp ? 1.0 : 0.8), len * 0.6), mBody);
    pyl.position.set(0, (pylonUp ? 1 : -1) * r * 0.75, len * 0.1);
    nac.add(pyl);
    nac.position.set(x, y, z);
    g.add(nac);
  };

  if (spec.engineMount === 'nose') {
    const spin = new THREE.Mesh(new THREE.ConeGeometry(R * 0.4, R * 0.8, 10), mAccent);
    spin.rotation.x = -Math.PI / 2;
    spin.position.z = -h - R * 0.35;
    g.add(spin);
    propDisc(Math.min(R * 1.6, span * 0.11), 0, 0, -h - R * 0.55);
  } else if (spec.engineMount === 'wing' && prop) {
    const n = spec.engineCount >= 4 ? [0.26, 0.5] : [0.28];
    const propR = Math.min(span * 0.075, half * n[0] - R * 1.05);
    for (const f of n) {
      [1, -1].forEach((side) => {
        const x = side * half * f;
        const y = wingY + (spec.wingPos === 'high' ? -0.15 : 0.1) * R;
        const nacR = R * 0.5;
        const nacL = rootChord * 1.5;
        const nac = new THREE.Mesh(new THREE.CylinderGeometry(nacR, nacR * 0.75, nacL, 12), mBody);
        nac.rotation.x = Math.PI / 2;
        nac.position.set(x, y, wingZ + f * tipBack + rootChord * 0.15);
        g.add(nac);
        propDisc(Math.max(propR, nacR * 1.9), x, y, wingZ + f * tipBack + rootChord * 0.15 - nacL / 2 - 0.05);
      });
    }
  } else if (spec.engineMount === 'wing' && jet) {
    const fr = spec.engineCount >= 4 ? [0.38, 0.66] : [0.34];
    // Modern widebody twins carry enormous fans (a GE90 nacelle is ~2/3 of the
    // 777's fuselage radius); quads and narrowbodies proportionally smaller.
    const nacR = R * (spec.engineCount >= 4 ? 0.42 : spec.wingspanM > 45 ? 0.68 : 0.55);
    const nacL = nacR * 3.2;
    for (const f of fr) {
      [1, -1].forEach((side) => {
        const x = side * half * f;
        const y = wingY + f * half * Math.sin(dihedral) - nacR * 1.15;
        const z = wingZ + f * tipBack - nacL * 0.25;
        jetNacelle(nacR, nacL, x, y, z, true);
      });
    }
    if (centreEngine) {
      // DC-10 / MD-11 №2 in the fin root
      const nacR2 = R * 0.5;
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(nacR2, nacR2 * 0.85, finRoot * 1.3, 14), mBody);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(0, R * 0.95, finZ + finRoot * 0.4);
      g.add(eng);
      const fan2 = new THREE.Mesh(new THREE.CircleGeometry(nacR2 * 0.85, 16), mFan);
      fan2.position.set(0, R * 0.95, finZ + finRoot * 0.4 - finRoot * 0.65 - 0.02);
      g.add(fan2);
    }
  } else if (spec.engineMount === 'aft') {
    const nacR = Math.max(0.3, R * 0.45);
    const nacL = nacR * 3;
    [1, -1].forEach((side) => {
      jetNacelle(nacR, nacL, side * (R + nacR * 0.9), R * 0.32, h - L * 0.2, false);
    });
    if (centreEngine) {
      // S-duct centre engine at the fin root (727, Falcon 900)
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(nacR, nacR * 0.8, nacL * 1.1, 14), mBody);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(0, R * 0.8, h - L * 0.12);
      g.add(eng);
    }
  } else if (spec.engineMount === 'over-wing') {
    const nacR = Math.max(0.28, R * 0.5);
    if (spec.engineCount === 1) {
      jetNacelle(nacR, nacR * 3, 0, R * 1.15, L * 0.08, false);
    } else {
      [1, -1].forEach((side) => {
        jetNacelle(nacR, nacR * 3, side * half * 0.28, wingY + nacR * 1.5, wingZ + rootChord * 0.4, false);
      });
    }
  }

  // ---- fixed gear
  if (spec.gear === 'tricycle' || spec.gear === 'taildragger') {
    const legR = Math.max(0.03, R * 0.08);
    const legLen = R * 1.1;
    const wheelR = Math.max(0.12, R * 0.3);
    const mkWheel = (x: number, y: number, z: number) => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.6, 10), mDark);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, y, z);
      g.add(wh);
    };
    [1, -1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(legR, legR, legLen, 6), mDark);
      leg.position.set(side * R * 1.3, -R - legLen / 2 + R * 0.4, wingZ + rootChord * 0.6);
      leg.rotation.z = side * 0.3;
      g.add(leg);
      mkWheel(side * R * 1.5, -R - legLen + R * 0.4, wingZ + rootChord * 0.6);
    });
    if (spec.gear === 'tricycle') {
      const nleg = new THREE.Mesh(new THREE.CylinderGeometry(legR * 0.8, legR * 0.8, legLen * 0.9, 6), mDark);
      nleg.position.set(0, -R - (legLen * 0.9) / 2 + R * 0.4, -h + L * 0.12);
      g.add(nleg);
      mkWheel(0, -R - legLen * 0.9 + R * 0.4, -h + L * 0.12);
    } else {
      mkWheel(0, -R * 0.7, h - L * 0.06);
    }
  }

  // ---- lights
  const navL = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.06, span * 0.008), 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  navL.position.set(-half, tipY[1], tipZ - tipChord * 0.4);
  g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.06, span * 0.008), 6, 6), new THREE.MeshBasicMaterial({ color: 0x2ee06a }));
  navR.position.set(half, tipY[0], tipZ - tipChord * 0.4);
  g.add(navR);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.07, span * 0.009), 6, 6), beaconMat);
  beacon.position.set(0, R * 1.05, 0);
  g.add(beacon);
  animateFns.push((t, _dt, reduced) => {
    const k = reduced ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(t * 3));
    beaconMat.color.setRGB(k, k * 0.2, k * 0.15);
  });

  return {
    group: g,
    spanUnits: span,
    animate: (t, dt, reduced) => {
      for (const fn of animateFns) fn(t, dt, reduced);
    },
  };
}

/* ------------------------------------------------------------- rotorcraft */

function buildRotorcraft(spec: AircraftSpec): BuiltAircraft {
  const g = new THREE.Group();
  const rotorR = spec.wingspanM / 2;
  const L = spec.lengthM;
  const R = spec.fusRadiusM;
  const cabinL = L * 0.48;

  const mBody = new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.25, roughness: 0.45 });
  const mAccent = new THREE.MeshStandardMaterial({ color: ACCENT, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: DARK, metalness: 0.5, roughness: 0.4 });
  const mGlass = new THREE.MeshStandardMaterial({ color: GLASS, metalness: 0.5, roughness: 0.25 });

  // cabin: teardrop lathe (nose -Z)
  const pts = [
    new THREE.Vector2(0.001, -cabinL * 0.55),
    new THREE.Vector2(R * 0.75, -cabinL * 0.28),
    new THREE.Vector2(R, -cabinL * 0.02),
    new THREE.Vector2(R * 0.85, cabinL * 0.3),
    new THREE.Vector2(R * 0.35, cabinL * 0.55),
  ];
  const cab = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), mBody);
  cab.rotation.x = Math.PI / 2; // +y -> +z here so the fat end faces forward
  cab.position.z = -L * 0.22;
  g.add(cab);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, R * 0.8, cabinL * 0.4), mGlass);
  canopy.position.set(0, R * 0.25, -L * 0.38);
  g.add(canopy);

  // tail boom + fin + tail rotor
  const boomL = L * 0.52;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.32, boomL, 10), mBody);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, R * 0.15, -L * 0.22 + cabinL * 0.5 + boomL / 2 - L * 0.02);
  g.add(boom);
  const boomEndZ = boom.position.z + boomL / 2;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(R * 0.14, R * 1.3, R * 0.5), mAccent);
  fin.position.set(0, R * 0.6, boomEndZ - R * 0.1);
  g.add(fin);
  const tr = new THREE.Mesh(
    new THREE.CircleGeometry(rotorR * 0.18, 16),
    new THREE.MeshBasicMaterial({ color: 0x8fa0b4, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  tr.rotation.y = Math.PI / 2;
  tr.position.set(R * 0.25, R * 0.7, boomEndZ - R * 0.05);
  g.add(tr);
  const trBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, rotorR * 0.34, 0.05), mDark);
  trBlade.position.copy(tr.position);
  g.add(trBlade);

  // mast + main rotor
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.12, R * 0.12, R * 0.5, 8), mDark);
  mast.position.set(0, R * 1.0, -L * 0.16);
  g.add(mast);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(rotorR, 28),
    new THREE.MeshBasicMaterial({ color: 0x8fa0b4, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, R * 1.25, -L * 0.16);
  g.add(disc);
  const blades = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(rotorR * 0.06, 0.05, rotorR * 1.96), mDark);
    b.rotation.y = i * (Math.PI / 2);
    blades.add(b);
  }
  blades.position.set(0, R * 1.27, -L * 0.16);
  g.add(blades);

  // skids
  [1, -1].forEach((side) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.07, R * 0.07, cabinL * 1.1, 8), mDark);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * R * 0.85, -R * 1.15, -L * 0.2);
    g.add(rail);
    for (const dz of [-cabinL * 0.3, cabinL * 0.3]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.05, R * 0.6, 6), mDark);
      strut.position.set(side * R * 0.85, -R * 0.85, -L * 0.2 + dz);
      g.add(strut);
    }
  });

  // lights
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), beaconMat);
  beacon.position.set(0, R * 0.9, boomEndZ - R * 0.6);
  g.add(beacon);

  return {
    group: g,
    spanUnits: spec.wingspanM,
    animate: (t, dt, reduced) => {
      if (!reduced) {
        blades.rotation.y += dt * 22;
        trBlade.rotation.x += dt * 30;
      }
      const k = reduced ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(t * 3));
      beaconMat.color.setRGB(k, k * 0.2, k * 0.15);
    },
  };
}

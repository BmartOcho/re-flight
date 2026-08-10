// Procedural aircraft models, ported verbatim from the three prototypes.
// Nose points -Z. Each returns the group, its built wingspan in local units
// (so the engine can derive TRUE_SCALE = wingspanM * M / spanUnits), and an
// optional per-frame hook for moving parts (prop disc, strobe).
import * as THREE from 'three';

export interface BuiltAircraft {
  group: THREE.Group;
  /** Wingtip-to-wingtip span of the built model, in local units. */
  spanUnits: number;
  animate?: (t: number, dt: number, reducedMotion: boolean) => void;
}

export type AircraftIcao = 'DHC3' | 'B39M' | 'A319';

export function buildAircraft(icao: AircraftIcao): BuiltAircraft {
  switch (icao) {
    case 'DHC3':
      return buildDHC3();
    case 'B39M':
      return buildB39M();
    case 'A319':
      return buildA319();
  }
}

/* ---- DHC-3 Turbo Otter: high wing, single turboprop, fixed gear (from N2YV) ---- */
function buildDHC3(): BuiltAircraft {
  const plane = new THREE.Group();
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xf6f8fa, metalness: 0.2, roughness: 0.5 });
  const mRed = new THREE.MeshStandardMaterial({ color: 0xc0341a, metalness: 0.2, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.4, roughness: 0.5 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, metalness: 0.5, roughness: 0.25 });
  const prof = [[0, -5.6], [0.55, -5.2], [0.95, -4.4], [1.05, -2.0], [1.05, 2.4], [0.85, 4.0], [0.45, 5.2], [0, 5.6]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), mWhite);
  fus.rotation.x = -Math.PI / 2;
  plane.add(fus);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 4.6), mGlass);
  win.position.set(0, 0.45, -0.4);
  plane.add(win);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.5, 14), mWhite);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -5.9;
  plane.add(nose);
  const spin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 12), mRed);
  spin.rotation.x = -Math.PI / 2;
  spin.position.z = -7.0;
  plane.add(spin);
  const prop = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0x8fa0b4, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  prop.position.z = -6.9;
  plane.add(prop);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.1, 0.1), mDark);
  blade.position.z = -6.85;
  plane.add(blade);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(29, 0.32, 4.3), mWhite);
  wing.position.set(0, 1.35, -1.0);
  plane.add(wing);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(29, 0.06, 0.7), mRed);
  stripe.position.set(0, 1.53, -1.0);
  plane.add(stripe);
  [1, -1].forEach((side) => {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.4), mWhite);
    st.position.set(side * 4.4, 0.45, -0.8);
    st.rotation.z = side * 0.55;
    plane.add(st);
  });
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 2.9), mWhite);
  fin.position.set(0, 2.2, 4.6);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.0, 2.6), mRed);
  finTip.position.set(0, 3.6, 4.8);
  plane.add(finTip);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.22, 2.1), mWhite);
  stab.position.set(0, 0.6, 5.0);
  plane.add(stab);
  [1, -1].forEach((side) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8), mDark);
    leg.position.set(side * 1.5, -1.6, -1.4);
    leg.rotation.z = side * 0.25;
    plane.add(leg);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), mDark);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(side * 1.85, -2.3, -1.4);
    plane.add(wh);
  });
  const nleg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 8), mDark);
  nleg.position.set(0, -1.5, -4.6);
  plane.add(nleg);
  const nwh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), mDark);
  nwh.rotation.z = Math.PI / 2;
  nwh.position.set(0, -2.1, -4.6);
  plane.add(nwh);
  const lnav = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  lnav.position.set(-14.5, 1.35, -1.0);
  plane.add(lnav);
  const rnav = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2ee06a }));
  rnav.position.set(14.5, 1.35, -1.0);
  plane.add(rnav);
  return {
    group: plane,
    spanUnits: 29,
    animate: (_t, dt, reduced) => {
      if (!reduced) blade.rotation.z += dt * 38;
    },
  };
}

/* ---- Boeing 737 MAX 9, Alaska livery (from AS1282) ---- */
function buildB39M(): BuiltAircraft {
  const plane = new THREE.Group();
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: 0.25, roughness: 0.45 });
  const mBlue = new THREE.MeshStandardMaterial({ color: 0x0b3d91, metalness: 0.3, roughness: 0.5 });
  const mTeal = new THREE.MeshStandardMaterial({ color: 0x00b2a9, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x151a26, metalness: 0.5, roughness: 0.35 });
  const mFan = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.85, roughness: 0.25 });
  const prof = [[0, -7.4], [0.42, -7.15], [0.85, -6.6], [1.12, -5.6], [1.18, -3.5], [1.18, 3.2], [1.02, 4.9], [0.62, 6.4], [0.22, 7.3], [0, 7.5]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mWhite);
  fus.rotation.x = -Math.PI / 2;
  plane.add(fus);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.36, 0.85), mDark);
  cockpit.position.set(0, 0.44, -5.55);
  plane.add(cockpit);
  const wingShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(8.6, -3.9);
    s.lineTo(8.6, -5.1);
    s.lineTo(0, -4.6);
    s.closePath();
    return s;
  };
  const makeWing = (side: number) => {
    const g = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.24, bevelEnabled: false });
    const w = new THREE.Mesh(g, mWhite);
    w.rotation.x = -Math.PI / 2;
    w.scale.x = side;
    w.position.set(side * 0.9, -0.35, -0.6);
    w.rotation.z = side * 0.1;
    plane.add(w);
    const tipX = side * (0.9 + 8.6);
    const tipY = -0.35 + 8.6 * Math.sin(0.1);
    const tipZ = -0.6 + 4.5;
    ([[1, 2.4], [-1, 1.2]] as [number, number][]).forEach(([dir, len]) => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.9), mBlue);
      blade.position.set(tipX, tipY + (dir * len) / 2, tipZ);
      blade.rotation.z = side * dir * -0.3;
      blade.rotation.x = -0.35;
      plane.add(blade);
    });
    const nac = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.78, 2.5, 16), mWhite);
    cowl.rotation.x = Math.PI / 2;
    nac.add(cowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 8, 20), mDark);
    lip.position.z = -1.25;
    nac.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.8, 18), mFan);
    fan.position.z = -1.2;
    nac.add(fan);
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.9, 14), mDark);
    exh.rotation.x = Math.PI / 2;
    exh.position.z = 1.6;
    nac.add(exh);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 1.6), mWhite);
    pylon.position.set(0, 0.75, 0.2);
    nac.add(pylon);
    nac.position.set(side * 3.15, -1.15, -1.5);
    plane.add(nac);
  };
  makeWing(1);
  makeWing(-1);
  const stabShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(3.1, -1.5);
    s.lineTo(3.1, -2.2);
    s.lineTo(0, -1.9);
    s.closePath();
    return s;
  };
  [1, -1].forEach((side) => {
    const g = new THREE.ExtrudeGeometry(stabShape(), { depth: 0.16, bevelEnabled: false });
    const st = new THREE.Mesh(g, mWhite);
    st.rotation.x = -Math.PI / 2;
    st.scale.x = side;
    st.position.set(side * 0.3, 0.25, 5.8);
    st.rotation.z = side * 0.06;
    plane.add(st);
  });
  const finShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(2.6, 3.2);
    s.lineTo(3.6, 3.2);
    s.lineTo(2.2, 0);
    s.closePath();
    return s;
  };
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape(), { depth: 0.2, bevelEnabled: false }), mBlue);
  fin.rotation.y = -Math.PI / 2;
  fin.position.set(0.1, 0.7, 3.4);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 1.1), mTeal);
  finTip.position.set(0, 3.9, 6.55);
  plane.add(finTip);
  const bellyG = new THREE.CylinderGeometry(1.19, 1.19, 6.5, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  bellyG.rotateY(Math.PI);
  const belly = new THREE.Mesh(bellyG, mBlue);
  belly.rotation.x = Math.PI / 2;
  belly.position.z = -0.1;
  plane.add(belly);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  beacon.position.set(0, 1.35, 3.6);
  plane.add(beacon);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  navL.position.set(-9.3, 0.5, -4.6);
  plane.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x44ff66 }));
  navR.position.set(9.3, 0.5, -4.6);
  plane.add(navR);
  const beaconMat = beacon.material as THREE.MeshBasicMaterial;
  return {
    group: plane,
    spanUnits: 19,
    animate: (t, _dt, reduced) => {
      // anti-collision beacon pulse
      beaconMat.color.setScalar(reduced ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(t * 3.0)));
      beaconMat.color.setRGB(1, beaconMat.color.g * 0.2, beaconMat.color.b * 0.15);
    },
  };
}

/* ---- Airbus A319-115SL, American livery (from AAL3229) ---- */
function buildA319(): BuiltAircraft {
  const plane = new THREE.Group();
  const mSilver = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.6, roughness: 0.35 });
  const mBlue = new THREE.MeshStandardMaterial({ color: 0x0d3b73, metalness: 0.3, roughness: 0.5 });
  const mRed = new THREE.MeshStandardMaterial({ color: 0xc4122f, metalness: 0.3, roughness: 0.5 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x1b202b, metalness: 0.5, roughness: 0.4 });
  const mFan = new THREE.MeshStandardMaterial({ color: 0x9aa4b8, metalness: 0.85, roughness: 0.25 });
  const prof = [[0, -7.2], [0.42, -6.95], [0.86, -6.4], [1.14, -5.4], [1.2, -3.4], [1.2, 3.1], [1.04, 4.8], [0.62, 6.2], [0.22, 7.1], [0, 7.3]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mSilver);
  fus.rotation.x = -Math.PI / 2;
  plane.add(fus);
  const cp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.8), mDark);
  cp.position.set(0, 0.44, -5.4);
  plane.add(cp);
  const wingShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(8.2, -3.7);
    s.lineTo(8.2, -4.8);
    s.lineTo(0, -4.4);
    s.closePath();
    return s;
  };
  const wing = (side: number) => {
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape(), { depth: 0.24, bevelEnabled: false }), mSilver);
    w.rotation.x = -Math.PI / 2;
    w.scale.x = side;
    w.position.set(side * 0.9, -0.35, -0.5);
    w.rotation.z = side * 0.1;
    plane.add(w);
    const tipX = side * (0.9 + 8.2);
    const tipY = -0.35 + 8.2 * Math.sin(0.1);
    const tipZ = -0.5 + 4.25;
    const shShape = new THREE.Shape();
    shShape.moveTo(0, 0);
    shShape.lineTo(0.55, 1.9);
    shShape.lineTo(1.15, 1.9);
    shShape.lineTo(1.05, 0);
    shShape.closePath();
    const sh = new THREE.Mesh(new THREE.ExtrudeGeometry(shShape, { depth: 0.11, bevelEnabled: false }), mSilver);
    sh.rotation.y = side * Math.PI / 2;
    sh.position.set(tipX, tipY, tipZ - 0.55);
    sh.rotation.z = side * -0.13;
    plane.add(sh);
    const nac = new THREE.Group();
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.72, 2.3, 16), mSilver);
    cowl.rotation.x = Math.PI / 2;
    nac.add(cowl);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.1, 8, 20), mDark);
    lip.position.z = -1.15;
    nac.add(lip);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.74, 18), mFan);
    fan.position.z = -1.1;
    nac.add(fan);
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 1.5), mSilver);
    pyl.position.set(0, 0.7, 0.2);
    nac.add(pyl);
    nac.position.set(side * 3.0, -1.1, -1.4);
    plane.add(nac);
  };
  wing(1);
  wing(-1);
  const stabShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(2.9, -1.4);
    s.lineTo(2.9, -2.0);
    s.lineTo(0, -1.8);
    s.closePath();
    return s;
  };
  [1, -1].forEach((side) => {
    const st = new THREE.Mesh(new THREE.ExtrudeGeometry(stabShape(), { depth: 0.16, bevelEnabled: false }), mSilver);
    st.rotation.x = -Math.PI / 2;
    st.scale.x = side;
    st.position.set(side * 0.3, 0.25, 5.6);
    st.rotation.z = side * 0.06;
    plane.add(st);
  });
  const finShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(2.4, 3.1);
    s.lineTo(3.3, 3.1);
    s.lineTo(2.1, 0);
    s.closePath();
    return s;
  };
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape(), { depth: 0.2, bevelEnabled: false }), mBlue);
  fin.rotation.y = -Math.PI / 2;
  fin.position.set(0.1, 0.7, 3.3);
  plane.add(fin);
  const finR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 1.0), mRed);
  finR.position.set(0, 3.75, 6.35);
  plane.add(finR);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  navL.position.set(-8.9, 0.5, -4.3);
  plane.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2ee06a }));
  navR.position.set(8.9, 0.5, -4.3);
  plane.add(navR);
  return { group: plane, spanUnits: 18.6 };
}

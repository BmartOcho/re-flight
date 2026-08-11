// The unified renderer, ported from N2YV-denali-summit-flight.html (the reference)
// and generalized to run any flight from its meta.json. Every numeric constant
// and the arc-length trail, bank/pitch, scale, camera, and label-culling logic
// are preserved verbatim — see docs/HANDOFF.md §2. The scene (sky/fog/lights),
// terrain palette (by snow line), decorations, and aircraft model are the only
// config-driven parts.
import * as THREE from 'three';
import type { FlightMeta, TrackData } from '../types';
import { buildAircraft } from '../aircraft';
import { basePath } from '../paths';
import { M, FT_TO_M, KT_TO_MS, makeStateAt, makeToXZ, makeAltY, demAt, distKm, bankRad, pitchRad } from './track';

export interface ReplayHandle {
  dispose: () => void;
}

/**
 * Approximate treeline (m MSL) by latitude — piecewise linear on published
 * treeline data (tropics ~3.9 km, US Rockies ~3 km, Alaska Range ~0.7 km).
 * The snow line sits ~700 m above it. Against the hand-tuned per-theme snow
 * lines the curated flights shipped with: Denali 1345 vs the old 1400 ✓;
 * Portland 3632 vs 3000 (both above the whole DEM — no visible change);
 * Tetons 3747 vs 2900 — deliberately higher: the flight is in August, and
 * late-summer Tetons are bare rock with small snowfields, not snowcapped.
 */
function treelineM(latDeg: number): number {
  const a = Math.abs(latDeg);
  if (a <= 20) return 3900;
  if (a <= 45) return 3900 - (a - 20) * 36; // US Rockies ~3000 m at 45°
  if (a <= 62) return 3000 - (a - 45) * 135; // Alaska Range ~700 m at 62°
  if (a <= 70) return 705 - (a - 62) * 60;
  return 150;
}

export function createReplay(
  container: HTMLElement,
  meta: FlightMeta,
  track: TrackData,
  heights: Int16Array | null,
  /** Runtime satellite texture (data: URL) for on-demand flights; curated flights use meta.terrain.imageryUrl. */
  imageryDataUrl?: string | null,
): ReplayHandle {
  const prefersReduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = track.s;
  const T0 = track.t0;
  const T1 = T0 + S.length - 1;
  const stateAt = makeStateAt(track);
  const toXZ = makeToXZ(meta.origin);
  const altY = makeAltY(meta.datum);
  const ter = meta.terrain;

  let altMin = Infinity;
  let altMax = -Infinity;
  for (const s of S) {
    if (s[2] < altMin) altMin = s[2];
    if (s[2] > altMax) altMax = s[2];
  }

  // ---------------------------------------------------------------- overlay DOM
  container.classList.add('rp');
  container.setAttribute('data-theme', meta.theme);
  const localLabel = meta.timezone.label;
  const altDisclosure =
    meta.altitudeType === 'geometric'
      ? 'ALTITUDE BROADCAST GEOMETRIC (GPS)'
      : `ALTITUDE BAROMETRIC${meta.altCorrectionFt ? ` · QNH-CORRECTED +${meta.altCorrectionFt} FT TO FIELD ELEV` : ''}`;
  const imagerySrc = imageryDataUrl ?? (ter?.imageryUrl ? `${basePath}${ter.imageryUrl}` : null);
  const useImagery = !!(imagerySrc && ter && heights && meta.theme !== 'night');
  const footLines = [
    `TRACK · ${meta.trackAttribution} (${meta.dataSource === 'adsb' ? 'ADS-B' : meta.dataSource === 'gps' ? 'GPS LOG' : 'RADAR-DERIVED'}) · ${altDisclosure}`,
    ter
      ? `TERRAIN · ${ter.source}${useImagery && ter.imagerySource ? ` · IMAGERY ${ter.imagerySource}` : ''}`
      : 'NO TERRAIN MESH FOR THIS FLIGHT',
    'ATTITUDE DERIVED FROM TURN &amp; CLIMB RATES — NOT BROADCAST · LIVERY STYLISED',
    ...(meta.notes ?? []).map((n) => n.toUpperCase().replace(/</g, '&lt;')),
  ];

  container.innerHTML = `
    <div class="rp-scene" data-el="scene"></div>
    <div class="rp-labels" data-el="labels"></div>
    <div class="rp-title rp-card">
      <div class="rp-eyebrow">Flight replay · real ${meta.dataSource === 'adsb' ? 'ADS-B' : meta.dataSource === 'gps' ? 'GPS' : 'radar'} track</div>
      <div class="rp-h1">${esc(meta.callsign)} — ${esc(meta.title.toUpperCase())}</div>
      <div class="rp-sub">${esc(meta.aircraft.model)}${meta.aircraft.operator ? ' · ' + esc(meta.aircraft.operator) : ''} · ${esc(meta.dateLabel)}<br>${esc(meta.blurb)}</div>
      <div class="rp-real">EVERY POINT IS ${meta.dataSource === 'gps' ? 'YOUR ACTUAL RECORDED POSITION' : "THE AIRCRAFT'S ACTUAL BROADCAST POSITION"}</div>
    </div>
    <div class="rp-hud rp-card">
      <div class="rp-clock"><span data-el="clkZ">--:--:--</span><small> Z</small><br><small data-el="clkL">--:-- ${localLabel}</small></div>
      <div class="rp-row">
        <div class="rp-cell"><div class="v" data-el="vAlt">0</div><div class="k">ALT FT</div></div>
        <div class="rp-cell"><div class="v" data-el="vGs">0</div><div class="k">GS KT</div></div>
        <div class="rp-cell"><div class="v" data-el="vVs">0</div><div class="k">V/S FPM</div></div>
      </div>
      ${
        meta.reference
          ? `<div class="rp-rel">VS ${esc(meta.reference.name)} <b data-el="vRel">—</b><span class="d" data-el="vDist">—</span><span class="d rp-scale-note" data-el="scaleNote"></span></div>`
          : `<div class="rp-rel"><span class="d rp-scale-note" data-el="scaleNote"></span></div>`
      }
    </div>
    <div class="rp-event rp-card" data-el="event"><div class="rp-ev-tag" data-el="evTag"></div><div class="rp-ev-msg" data-el="evMsg"></div></div>
    <div class="rp-hint">DRAG TO ORBIT · SCROLL TO ZOOM · SPACE TO PLAY</div>
    <div class="rp-foot">${footLines.join('<br>')}</div>
    <div class="rp-bar">
      <canvas class="rp-profile" data-el="profile"></canvas>
      <div class="rp-controls">
        <button class="rp-btn primary" data-el="btnPlay" aria-label="Play or pause the replay">► PLAY</button>
        <button class="rp-btn" data-el="btnSpeed" aria-label="Cycle playback speed">20×</button>
        <button class="rp-btn" data-el="btnCam" aria-label="Switch camera">CHASE CAM</button>
        <button class="rp-btn" data-el="btnScale" aria-label="Cycle aircraft scale">AIRCRAFT ×${meta.scaleMultipliers[0]}</button>
        <span class="rp-phase" data-el="phase"></span>
      </div>
      <div class="rp-tl" data-el="tl" role="slider" tabindex="0" aria-label="Scrub timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="rp-tl-track"></div><div class="rp-tl-fill" data-el="tlFill"></div><div class="rp-tl-head" data-el="tlHead"></div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(name: string) => container.querySelector<T>(`[data-el="${name}"]`)!;
  const sceneEl = $('scene');
  const labelBox = $('labels');

  // ------------------------------------------------------------------- three
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(sceneEl.clientWidth, sceneEl.clientHeight);
  sceneEl.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, sceneEl.clientWidth / sceneEl.clientHeight, 0.02, 40000);

  const disposables: { dispose: () => void }[] = [];
  const track3 = <T extends THREE.BufferGeometry | THREE.Material>(o: T): T => {
    disposables.push(o as unknown as { dispose: () => void });
    return o;
  };

  // sky + fog + lights per theme
  const night = meta.theme === 'night';
  if (night) {
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.00042);
    scene.add(new THREE.AmbientLight(0x334066, 1.1));
    const moon = new THREE.DirectionalLight(0x8fa8ff, 0.9);
    moon.position.set(-400, 600, 300);
    scene.add(moon);
    // stars: deterministic scatter on the upper dome (it WAS a clear night sky
    // wherever there's a night theme — the scatter itself is decorative)
    const nStars = 420;
    const sg = track3(new THREE.BufferGeometry());
    const sp = new Float32Array(nStars * 3);
    const sc = new Float32Array(nStars * 3);
    for (let i = 0; i < nStars; i++) {
      const az = pseudo(i * 3.7) * Math.PI * 2;
      const el = 0.06 + Math.pow(pseudo(i * 9.1), 0.8) * 1.4; // bias low, none below horizon
      const R = 13200;
      sp[i * 3] = Math.cos(az) * Math.cos(el) * R;
      sp[i * 3 + 1] = Math.sin(el) * R;
      sp[i * 3 + 2] = Math.sin(az) * Math.cos(el) * R;
      const b = 0.35 + pseudo(i * 5.3) * 0.65;
      const warm = pseudo(i * 7.9) > 0.8;
      sc[i * 3] = b;
      sc[i * 3 + 1] = b * (warm ? 0.9 : 0.95);
      sc[i * 3 + 2] = b * (warm ? 0.75 : 1.05);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(sg, track3(new THREE.PointsMaterial({ size: 14, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, fog: false })));
    scene.add(stars);
  } else {
    const alpine = meta.theme === 'alpine';
    const zenC = alpine ? 0x2f6ea8 : 0x4b93cc;
    const midC = alpine ? 0x87b4d6 : 0xa8cbe4;
    const hazC = alpine ? 0xe4edf3 : 0xeef3f6;
    const sunDir = new THREE.Vector3(-700, 520, 600).normalize(); // matches the directional light
    const skyMat = track3(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zen: { value: new THREE.Color(zenC) },
          mid: { value: new THREE.Color(midC) },
          haz: { value: new THREE.Color(hazC) },
          sunDir: { value: sunDir },
        },
        vertexShader:
          'varying vec3 vDir; void main(){vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: [
          'uniform vec3 zen,mid,haz,sunDir; varying vec3 vDir;',
          'void main(){',
          '  float h = clamp(vDir.y, 0.0, 1.0);',
          // three-stop gradient: haze hugs the horizon, zenith deepens overhead
          '  vec3 c = mix(haz, mid, smoothstep(0.0, 0.18, h));',
          '  c = mix(c, zen, smoothstep(0.18, 0.65, h));',
          '  float s = max(dot(vDir, sunDir), 0.0);',
          '  c += vec3(1.0, 0.94, 0.82) * pow(s, 900.0) * 1.2;', // sun disc
          '  c += vec3(1.0, 0.9, 0.7) * pow(s, 12.0) * 0.14;', // forward-scatter glow
          '  gl_FragColor = vec4(c, 1.0);',
          '}',
        ].join('\n'),
      }),
    );
    scene.add(new THREE.Mesh(track3(new THREE.SphereGeometry(14000, 32, 20)), skyMat));
    scene.fog = new THREE.FogExp2(alpine ? 0xa9cde6 : 0xcfe0ee, 0.0003);
    scene.add(new THREE.HemisphereLight(0xcfe4f2, 0x6a7180, 1.0));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.15);
    sun.position.set(-700, 520, 600);
    scene.add(sun);
  }

  // ------------------------------------------------------------------- terrain
  let demMin = 0;
  let demMax = 1;
  const demY = (lat: number, lon: number): number => (ter && heights ? demAt(ter, heights, lat, lon) * M - meta.datum * FT_TO_M * M : 0);
  if (ter && heights) {
    const NT = ter.n;
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] < demMin) demMin = heights[i];
      if (heights[i] > demMax) demMax = heights[i];
    }
    // Land-cover bands from the latitude-aware treeline; snow ~700 m above it.
    const treeline = treelineM((ter.lat0 + ter.lat1) / 2);
    const snowLine = treeline + 700;
    const relief = Math.max(1, demMax - demMin);
    const cForestLush = new THREE.Color(0x2e4a26); // valley-floor canopy
    const cForestDry = new THREE.Color(0x5a6b3d); // drier / higher slopes
    const cTundra = new THREE.Color(0x77704c); // above-forest scrub
    const cRock = new THREE.Color(0x6d6659);
    const cScree = new THREE.Color(0x8b8579);
    const cSnow = new THREE.Color(0xf7fbff);
    const cIce = new THREE.Color(0xdcecf5);
    const cWater = new THREE.Color(0x2b5d7d);
    const cWaterDeep = new THREE.Color(0x1d4159);
    const cNight = new THREE.Color(0x0a1322);
    const cNightWater = new THREE.Color(0x122c47);
    const g = track3(new THREE.BufferGeometry());
    const pos = new Float32Array(NT * NT * 3);
    const col = new Float32Array(NT * NT * 3);
    const at = (i: number, j: number) => heights[Math.min(NT - 1, Math.max(0, i)) * NT + Math.min(NT - 1, Math.max(0, j))];
    for (let i = 0; i < NT; i++) {
      const lat = ter.lat1 - (ter.lat1 - ter.lat0) * (i / (NT - 1));
      for (let j = 0; j < NT; j++) {
        const lon = ter.lon0 + (ter.lon1 - ter.lon0) * (j / (NT - 1));
        const m = heights[i * NT + j];
        const p = toXZ(lat, lon);
        const k = (i * NT + j) * 3;
        pos[k] = p.x;
        pos[k + 1] = altY(m / FT_TO_M);
        pos[k + 2] = p.z;
        const mE = at(i, j + 1);
        const mS = at(i + 1, j);
        const slope = Math.min(1, (Math.abs(m - mE) + Math.abs(m - mS)) / 260);
        // Water: real lakes/rivers/sea are the only perfectly flat cells in a
        // DEM. Require dead-flat over the 4-neighbourhood, below the snow line
        // (dead-flat above it is glacier and stays ice-coloured).
        const flat = Math.max(m, mE, mS, at(i, j - 1), at(i - 1, j)) - Math.min(m, mE, mS, at(i, j - 1), at(i - 1, j));
        const isWater = m <= 0 || (flat < 2 && m < snowLine);
        let c: THREE.Color;
        if (isWater) {
          c = cWater.clone().lerp(cWaterDeep, Math.min(1, Math.max(0, (treeline - m) / Math.max(400, treeline))));
        } else if (m < treeline) {
          // vegetation: lush low, drying toward the treeline, tundra band at the top
          const f = Math.max(0, m - demMin) / Math.max(1, treeline - demMin);
          c = cForestLush.clone().lerp(cForestDry, Math.min(1, f * 1.35));
          if (f > 0.8) c.lerp(cTundra, (f - 0.8) / 0.2);
          // steep vegetated slopes show rock through the canopy
          if (slope > 0.5) c.lerp(cRock, Math.min(0.5, (slope - 0.5) * 1.2));
        } else if (m < snowLine) {
          c = cRock.clone().lerp(cScree, (m - treeline) / 700);
        } else {
          const hi = Math.min(1, (m - snowLine) / 900);
          c = cScree.clone().lerp(slope > 0.55 ? cSnow : cIce, hi);
          if (slope > 0.75) c.lerp(cRock, Math.min(0.55, (slope - 0.75) * 2.0));
        }
        // Per-vertex breakup so bands read as ground, not contour fill:
        // fine deterministic jitter + a low-frequency patchiness field.
        const n1 = pseudo(i * 12.9898 + j * 78.233) - 0.5;
        const n2 = Math.sin(i * 0.061) * Math.sin(j * 0.083);
        c.multiplyScalar(1 + n1 * 0.07 + n2 * (isWater ? 0.02 : 0.06));
        // Valley ambient shading: in high-relief scenes the low ground sits in
        // its own shadowed air; a subtle darkening reads as depth.
        if (relief > 800 && !isWater) c.multiplyScalar(0.9 + 0.1 * Math.min(1, (m - demMin) / relief + 0.35));
        if (night) {
          c.multiplyScalar(0.2).lerp(cNight, 0.35);
          if (isWater) c.lerp(cNightWater, 0.65); // moonlit water sheen
        }
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < NT - 1; i++)
      for (let j = 0; j < NT - 1; j++) {
        const a = i * NT + j;
        const b = a + 1;
        const c2 = a + NT;
        const d2 = c2 + 1;
        idx.push(a, c2, b, b, c2, d2);
      }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (useImagery) {
      // plain linear UVs: texture row 0 = north = vertex row i=0 (flipY texture -> v=1)
      const uv = new Float32Array(NT * NT * 2);
      for (let i = 0; i < NT; i++)
        for (let j = 0; j < NT; j++) {
          uv[(i * NT + j) * 2] = j / (NT - 1);
          uv[(i * NT + j) * 2 + 1] = 1 - i / (NT - 1);
        }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    const terrainMat = track3(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    scene.add(new THREE.Mesh(g, terrainMat));
    if (useImagery && imagerySrc) {
      // The procedural palette renders immediately; the satellite texture swaps
      // in when it decodes. On failure the palette simply stays — no spinner.
      new THREE.TextureLoader().load(imagerySrc, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        disposables.push(tex);
        terrainMat.map = tex;
        terrainMat.vertexColors = false;
        terrainMat.color.set(0xffffff);
        terrainMat.needsUpdate = true;
      });
    }
  }

  // --------------------------------------------------------------- decorations
  addDecorations();
  function addDecorations() {
    const d = meta.decorations;
    if (!d) return;
    const yOf = (lat: number, lon: number, off: number) => demY(lat, lon) + off * M;
    for (const path of d.rivers ?? []) {
      const v = path.map(([la, lo]) => {
        const p = toXZ(la, lo);
        return new THREE.Vector3(p.x, yOf(la, lo, 3), p.z);
      });
      const geo = track3(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), 120, night ? 3.0 : 2.2, 5, false));
      scene.add(new THREE.Mesh(geo, track3(new THREE.MeshBasicMaterial({ color: night ? 0x14304f : 0x3d7fa6, transparent: true, opacity: night ? 0.75 : 0.85 }))));
    }
    for (const rw of d.runways ?? []) {
      const p = toXZ(rw.lat, rw.lon);
      const geo = track3(new THREE.PlaneGeometry(rw.widthM * M * 1.4, rw.lengthM * M));
      const mesh = new THREE.Mesh(geo, track3(new THREE.MeshStandardMaterial({ color: night ? 0x2a3550 : 0x3a3d42, roughness: 0.9 })));
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (rw.bearing * Math.PI) / 180;
      mesh.position.set(p.x, yOf(rw.lat, rw.lon, 1), p.z);
      scene.add(mesh);
    }
    for (const cl of d.lights ?? []) {
      const n = cl.count;
      const geo = track3(new THREE.BufferGeometry());
      const pts = new Float32Array(n * 3);
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = pseudo(i * 2.399) * Math.PI * 2;
        const r = Math.pow(pseudo(i * 7.1), 0.6) * cl.radius;
        const la = cl.lat + Math.sin(a) * r * 0.7;
        const lo = cl.lon + Math.cos(a) * r;
        const p = toXZ(la, lo);
        pts[i * 3] = p.x;
        pts[i * 3 + 1] = yOf(la, lo, 2);
        pts[i * 3 + 2] = p.z;
        const warm = pseudo(i * 3.7) > 0.25;
        cols[i * 3] = warm ? 1 : 0.65;
        cols[i * 3 + 1] = warm ? 0.78 : 0.8;
        cols[i * 3 + 2] = warm ? 0.45 : 1;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      scene.add(new THREE.Points(geo, track3(new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0.55 }))));
    }
  }

  // --------------------------------------------------- reference summit + peaks
  let sumRing: THREE.Mesh | null = null;
  if (meta.reference) {
    const p = toXZ(meta.reference.lat, meta.reference.lon);
    sumRing = new THREE.Mesh(
      track3(new THREE.TorusGeometry(7, 0.5, 8, 40)),
      track3(new THREE.MeshBasicMaterial({ color: 0xe04a1b, transparent: true, opacity: 0.85 })),
    );
    sumRing.position.set(p.x, altY(meta.reference.elevationFt), p.z);
    sumRing.rotation.x = Math.PI / 2;
    scene.add(sumRing);
  }

  // peak labels — only those inside the terrain box (so a mountain sits under them)
  const inBox = (la: number, lo: number) => !ter || (la >= ter.lat0 && la <= ter.lat1 && lo >= ter.lon0 && lo <= ter.lon1);
  interface Label {
    name: string;
    ft: number;
    x: number;
    y: number;
    z: number;
    el: HTMLElement;
    ref: boolean;
  }
  const labels: Label[] = meta.peaks
    .filter((pk) => inBox(pk.lat, pk.lon))
    .map((pk) => {
      const p = toXZ(pk.lat, pk.lon);
      const el = document.createElement('div');
      el.className = 'rp-peak';
      const isRef = meta.reference?.name === pk.name;
      el.innerHTML = `${isRef ? '<b>' : ''}${esc(pk.name)}${isRef ? '</b>' : ''}<br><span class="ft">${pk.elevationFt.toLocaleString()} FT</span>`;
      labelBox.appendChild(el);
      return { name: pk.name, ft: pk.elevationFt, x: p.x, y: altY(pk.elevationFt), z: p.z, el, ref: !!isRef };
    });
  const labelOrder = labels.slice().sort((a, b) => b.ft - a.ft);

  // ------------------------------------------------------------------- trail
  const curvePts: THREE.Vector3[] = [];
  for (let i = 0; i < S.length; i++) {
    const p = toXZ(S[i][0], S[i][1]);
    curvePts.push(new THREE.Vector3(p.x, altY(S[i][2]), p.z));
  }
  const curve = new THREE.CatmullRomCurve3(curvePts);
  curve.arcLengthDivisions = 4000;
  curve.updateArcLengths();
  const LEN = curve.getLengths(4000);
  const LTOT = LEN[LEN.length - 1];
  const SEG = 2000;
  const RAD = 8;
  const WS = meta.aircraft.wingspanM * M; // wingspan in scene units
  let RIB_R = Math.max(0.05, (meta.aircraft.wingspanM * M * meta.scaleMultipliers[0]) / 12);
  let tube = new THREE.TubeGeometry(curve, SEG, RIB_R, RAD, false);
  const ribbonMat = track3(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const arcFrac = (t: number): number => {
    const u = Math.min(1, Math.max(0, (t - T0) / (S.length - 1)));
    const x = u * (LEN.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = LEN[i];
    const b = LEN[Math.min(LEN.length - 1, i + 1)];
    return (a + (b - a) * f) / LTOT;
  };
  const fracToTime = (fr: number): number => {
    const target = fr * LTOT;
    let lo = 0;
    let hi = LEN.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      LEN[m] <= target ? (lo = m) : (hi = m);
    }
    return T0 + (lo / (LEN.length - 1)) * (S.length - 1);
  };
  const lowC = new THREE.Color(0xb02a08);
  const hiC = new THREE.Color(0xffb15a);
  const paintTube = (tb: THREE.TubeGeometry) => {
    const count = tb.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const span = Math.max(1, altMax - altMin);
    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / (RAD + 1));
      const t = fracToTime(ring / SEG);
      const alt = S[Math.min(S.length - 1, Math.max(0, Math.round(t - T0)))][2];
      const c = lowC.clone().lerp(hiC, Math.min(1, Math.max(0, (alt - altMin) / span)));
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    tb.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  };
  paintTube(tube);
  const ribbonMesh = new THREE.Mesh(tube, ribbonMat);
  scene.add(ribbonMesh);
  let TUBE_IDX = tube.index!.count;
  tube.setDrawRange(0, 0);
  const trailTo = (t: number) => {
    const p = Math.min(1, Math.max(0, arcFrac(t)));
    tube.setDrawRange(0, Math.floor((TUBE_IDX * p) / 6) * 6);
  };
  const setRibbonRadius = (r: number) => {
    RIB_R = r;
    const old = tube;
    tube = new THREE.TubeGeometry(curve, SEG, RIB_R, RAD, false);
    paintTube(tube);
    TUBE_IDX = tube.index!.count;
    ribbonMesh.geometry = tube;
    old.dispose();
    trailTo(simT);
  };

  // ------------------------------------------------------------------ aircraft
  const built = buildAircraft(meta.aircraft.icao, meta.aircraft.livery);
  const plane = built.group;
  const TRUE_SCALE = (meta.aircraft.wingspanM * M) / built.spanUnits;
  let planeMult = meta.scaleMultipliers[0];
  // dark silhouette outline so the aircraft reads against snow at any distance
  const edgeMat = track3(new THREE.LineBasicMaterial({ color: 0x101418, transparent: true, opacity: 0.9 }));
  const edgeMeshes: THREE.Object3D[] = [];
  plane.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && (mesh.geometry.attributes.position?.count ?? 0) < 400) edgeMeshes.push(mesh);
  });
  edgeMeshes.forEach((o) => {
    const mesh = o as THREE.Mesh;
    const e = new THREE.LineSegments(track3(new THREE.EdgesGeometry(mesh.geometry, 28)), edgeMat);
    e.position.copy(mesh.position);
    e.rotation.copy(mesh.rotation);
    e.scale.copy(mesh.scale);
    plane.add(e);
  });
  plane.rotation.order = 'YXZ';
  plane.scale.setScalar(TRUE_SCALE * planeMult);
  scene.add(plane);
  const locator = new THREE.Mesh(
    track3(new THREE.RingGeometry(0.8, 1.0, 32)),
    track3(new THREE.MeshBasicMaterial({ color: 0xe04a1b, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide })),
  );
  locator.renderOrder = 999;
  scene.add(locator);

  // ---------------------------------------------------------------- altitude profile
  const profile = $<HTMLCanvasElement>('profile');
  const refFt = meta.reference?.elevationFt ?? altMax;
  const profileMax = Math.max(altMax, refFt) * 1.06;
  const drawProfile = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = profile.clientWidth || sceneEl.clientWidth - 48;
    const h = 44;
    profile.width = w * dpr;
    profile.height = h * dpr;
    const ctx = profile.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (meta.reference) {
      const sy = h - 3 - (refFt / profileMax) * (h - 8);
      ctx.strokeStyle = 'rgba(44,127,168,.6)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(44,127,168,.8)';
      ctx.font = '7px monospace';
      ctx.fillText(`${meta.reference.name} ${meta.reference.elevationFt.toLocaleString()}`, 4, sy - 3);
    }
    ctx.beginPath();
    for (let i = 0; i <= w; i += 2) {
      const t = T0 + (i / w) * (T1 - T0);
      const a = stateAt(t).alt;
      const y = h - 3 - (a / profileMax) * (h - 8);
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
    }
    ctx.strokeStyle = getComputedStyle(container).getPropertyValue('--accent') || '#e04a1b';
    ctx.lineWidth = 1.7;
    ctx.stroke();
  };

  // timeline ticks
  const tl = $('tl');
  for (const e of meta.events) {
    const d = document.createElement('div');
    d.className = 'rp-tick' + (e.tone === 'alert' ? ' alert' : '');
    d.style.left = `${((e.t - T0) / (T1 - T0)) * 100}%`;
    d.innerHTML = `<div class="dot"></div><div class="lbl">${esc(e.tag.split(' ')[0])}</div>`;
    tl.appendChild(d);
  }

  // ------------------------------------------------------------------ playback
  let simT = meta.startAtT != null ? Math.min(T1, Math.max(T0, meta.startAtT)) : T0;
  let playing = false;
  const SPEEDS = [5, 20, 40, 80];
  let speed = 20;
  let shownEvent: FlightMeta['events'][number] | null = null;
  let camMode: 'chase' | 'orbit' = meta.camera;
  let userCam = false;
  let orbA = 2.2;
  let orbEl = 0.26;
  let orbR = Math.max(60, WS * planeMult * 18);
  let dragging = false;
  let scrubbing = false;
  let px = 0;
  let py = 0;

  const btnPlay = $('btnPlay');
  const btnSpeed = $('btnSpeed');
  const btnCam = $('btnCam');
  const btnScale = $('btnScale');
  btnSpeed.textContent = `${speed}×`;
  btnCam.textContent = camMode === 'chase' ? 'CHASE CAM' : 'WIDE ORBIT';

  const setScaleNote = () => {
    const el = container.querySelector<HTMLElement>('[data-el="scaleNote"]');
    if (el)
      el.textContent =
        planeMult === 1 ? `LIFE SIZE · ${meta.aircraft.wingspanM} M WINGSPAN` : `AIRCRAFT SHOWN ×${planeMult}`;
  };
  setScaleNote();

  const onPlay = () => {
    if (simT >= T1) simT = T0;
    playing = !playing;
    btnPlay.textContent = playing ? '❚❚ PAUSE' : '► PLAY';
  };
  const onSpeed = () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    btnSpeed.textContent = `${speed}×`;
  };
  const onCam = () => {
    camMode = camMode === 'chase' ? 'orbit' : 'chase';
    btnCam.textContent = camMode === 'chase' ? 'CHASE CAM' : 'WIDE ORBIT';
    userCam = false;
  };
  const onScale = () => {
    const mults = meta.scaleMultipliers;
    planeMult = mults[(mults.indexOf(planeMult) + 1) % mults.length];
    plane.scale.setScalar(TRUE_SCALE * planeMult);
    btnScale.textContent = planeMult === 1 ? 'TRUE SCALE' : `AIRCRAFT ×${planeMult}`;
    setRibbonRadius(Math.max(0.05, (meta.aircraft.wingspanM * M * planeMult) / 12));
    orbR = Math.max(1.0, meta.aircraft.wingspanM * M * planeMult * 18);
    userCam = false;
    setScaleNote();
  };
  btnPlay.addEventListener('click', onPlay);
  btnSpeed.addEventListener('click', onSpeed);
  btnCam.addEventListener('click', onCam);
  btnScale.addEventListener('click', onScale);

  const scrubTo = (cx: number) => {
    const r = tl.getBoundingClientRect();
    simT = T0 + Math.min(1, Math.max(0, (cx - r.left) / r.width)) * (T1 - T0);
  };
  const onTlDown = (e: PointerEvent) => {
    scrubbing = true;
    scrubTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (scrubbing) scrubTo(e.clientX);
    if (dragging) {
      orbA -= (e.clientX - px) * 0.006;
      orbEl = Math.min(1.35, Math.max(0.03, orbEl + (e.clientY - py) * 0.004));
      px = e.clientX;
      py = e.clientY;
    }
  };
  const onPointerUp = () => {
    scrubbing = false;
    dragging = false;
  };
  const onCanvasDown = (e: PointerEvent) => {
    dragging = true;
    px = e.clientX;
    py = e.clientY;
    userCam = true;
  };
  const onWheel = (e: WheelEvent) => {
    orbR = Math.min(6000, Math.max(0.9, orbR * (1 + e.deltaY * 0.0012)));
    userCam = true;
    e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'k') {
      onPlay();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      simT = Math.min(T1, simT + (e.shiftKey ? 30 : 5));
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      simT = Math.max(T0, simT - (e.shiftKey ? 30 : 5));
      e.preventDefault();
    } else if (e.key === 'c') {
      onCam();
    }
  };
  tl.addEventListener('pointerdown', onTlDown);
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerdown', onCanvasDown);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('keydown', onKey);

  // clocks / events / phase
  const fmtZ = (t: number) => {
    const s = Math.floor(t);
    const h = Math.floor(s / 3600) % 24;
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(ss)}`;
  };
  const fmtLocal = (t: number) => {
    let s = Math.floor(t) + meta.timezone.offsetHours * 3600;
    s = ((s % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'} ${meta.timezone.label}`;
  };
  const evEl = $('event');
  const evTag = $('evTag');
  const evMsg = $('evMsg');
  const updateEvents = () => {
    let a: FlightMeta['events'][number] | null = null;
    for (const e of meta.events) if (simT >= e.t && simT <= e.t + e.dur) a = e;
    if (a !== shownEvent) {
      shownEvent = a;
      if (a) {
        evTag.textContent = a.tag;
        evMsg.textContent = a.msg;
        evEl.classList.toggle('alert', a.tone === 'alert');
        evEl.classList.add('on');
      } else evEl.classList.remove('on');
    }
  };
  const phaseLabel = () => {
    for (const ph of meta.phases) if (ph.untilT === null || simT < ph.untilT) return ph.label;
    return meta.phases.length ? meta.phases[meta.phases.length - 1].label : '';
  };

  // label culling — sort by elevation, place greedily, hide losers
  const vTmp = new THREE.Vector3();
  const updateLabels = () => {
    const placed: { x: number; y: number; w: number }[] = [];
    const cp = camera.position;
    const W = sceneEl.clientWidth;
    const H = sceneEl.clientHeight;
    for (const L of labelOrder) {
      vTmp.set(L.x, L.y + 8, L.z).project(camera);
      let vis = vTmp.z < 1 && Math.abs(vTmp.x) < 1.02 && Math.abs(vTmp.y) < 1.02;
      let sx = 0;
      let sy = 0;
      if (vis) {
        sx = (vTmp.x * 0.5 + 0.5) * W;
        sy = (-vTmp.y * 0.5 + 0.5) * H;
        if (Math.hypot(L.x - cp.x, L.y - cp.y, L.z - cp.z) > 3400) vis = false;
        const w = Math.max(100, L.name.length * 7.2);
        for (const p of placed) {
          if (Math.abs(sx - p.x) < (w + p.w) / 2 && Math.abs(sy - p.y) < 26) {
            vis = false;
            break;
          }
        }
        if (vis) placed.push({ x: sx, y: sy, w });
      }
      L.el.style.opacity = vis ? '1' : '0';
      if (vis) {
        L.el.style.left = `${sx}px`;
        L.el.style.top = `${sy}px`;
      }
    }
  };

  // ---------------------------------------------------------------- resize
  const onResize = () => {
    const w = sceneEl.clientWidth;
    const h = sceneEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    drawProfile();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(sceneEl);
  drawProfile();

  // ---------------------------------------------------------------- animate
  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3(0, 400, 800);
  const camTarget = new THREE.Vector3();
  const propStart = performance.now();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing && !scrubbing) {
      simT += dt * speed;
      if (simT >= T1) {
        simT = T1;
        playing = false;
        btnPlay.textContent = '↺ REPLAY';
      }
    }
    const s = stateAt(simT);
    const p = toXZ(s.lat, s.lon);
    const x = p.x;
    const z = p.z;
    const y = altY(s.alt);
    plane.position.set(x, y, z);
    const hd = (s.trk * Math.PI) / 180;
    const bank = bankRad(s.turn, s.gs);
    const pitch = pitchRad(s.vs, s.gs);
    plane.rotation.set(pitch, -hd, bank);
    if (built.animate) built.animate((performance.now() - propStart) / 1000, dt, prefersReduced);

    // locator: constant ~34 px on screen
    {
      const dCam = camera.position.distanceTo(plane.position);
      const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * dCam) / sceneEl.clientHeight;
      locator.position.copy(plane.position);
      locator.quaternion.copy(camera.quaternion);
      locator.scale.setScalar(Math.max(worldPerPx * 17, TRUE_SCALE * planeMult * 16));
      locator.visible = planeMult <= 8;
    }
    if (sumRing) sumRing.scale.setScalar(1 + Math.sin((performance.now() - propStart) * 0.003) * 0.12);

    if (camMode === 'chase' && !userCam) {
      const chaseD = Math.max(0.9, WS * planeMult * 6);
      const back = new THREE.Vector3(-Math.sin(hd), 0, Math.cos(hd)).multiplyScalar(chaseD);
      camPos.lerp(new THREE.Vector3(x + back.x, y + chaseD * 0.38, z + back.z), 0.035);
      camTarget.lerp(new THREE.Vector3(x, y + 2, z), 0.07);
    } else {
      const cx = x + Math.cos(orbA) * Math.cos(orbEl) * orbR;
      const cy = Math.max(y + Math.sin(orbEl) * orbR, 15);
      const cz = z + Math.sin(orbA) * Math.cos(orbEl) * orbR;
      camPos.lerp(new THREE.Vector3(cx, cy, cz), 0.08);
      camTarget.lerp(new THREE.Vector3(x, y, z), 0.08);
      if (camMode === 'orbit' && !dragging && !prefersReduced) orbA += dt * 0.035;
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    // HUD
    $('clkZ').textContent = fmtZ(simT);
    $('clkL').textContent = fmtLocal(simT);
    $('vAlt').textContent = Math.round(s.alt).toLocaleString();
    $('vGs').textContent = String(Math.round(s.gs));
    $('vVs').textContent = (s.vs > 0 ? '+' : '') + Math.round(s.vs / 10) * 10;
    if (meta.reference) {
      const rel = Math.round(s.alt - meta.reference.elevationFt);
      const relEl = container.querySelector<HTMLElement>('[data-el="vRel"]');
      const distEl = container.querySelector<HTMLElement>('[data-el="vDist"]');
      if (relEl) relEl.textContent = `${rel >= 0 ? '+' : ''}${rel.toLocaleString()} FT`;
      if (distEl) {
        const dk = distKm(s.lat, s.lon, meta.reference.lat, meta.reference.lon);
        distEl.textContent = (dk < 1 ? `${Math.round(dk * 1000)} M` : `${dk.toFixed(1)} KM`) + ` FROM ${meta.reference.name}`;
      }
    }
    $('phase').textContent = phaseLabel();
    const pct = ((simT - T0) / (T1 - T0)) * 100;
    $('tlFill').style.width = `${pct}%`;
    $('tlHead').style.left = `${pct}%`;
    tl.setAttribute('aria-valuenow', String(Math.round(pct)));
    trailTo(simT);
    updateLabels();
    updateEvents();
    renderer.render(scene, camera);
  };
  if (!prefersReduced) {
    playing = true;
    btnPlay.textContent = '❚❚ PAUSE';
  }
  animate();

  // ---------------------------------------------------------------- dispose
  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      container.removeEventListener('keydown', onKey);
      tube.dispose();
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* noop */
        }
      }
      renderer.dispose();
      container.innerHTML = '';
      container.classList.remove('rp');
      container.removeAttribute('data-theme');
    },
  };
}

// A tiny deterministic pseudo-random (city-light scatter) so builds are stable.
function pseudo(x: number): number {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

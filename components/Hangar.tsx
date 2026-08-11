'use client';

// Unlinked QA page (/hangar): spin any type from the parametric aircraft
// library. This is how model-library changes get eyeballed — the numeric gate
// is scripts/check-aircraft.ts; this page is for the silhouette itself.
import { useEffect, useRef, useState } from 'react';
import { ALL_TYPE_DESIGNATORS, resolveSpec } from '@/lib/aircraft/registry';

export default function Hangar() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [type, setType] = useState('B738');
  const spec = resolveSpec(type);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;
    (async () => {
      const THREE = await import('three');
      const { buildAircraft } = await import('@/lib/aircraft');
      if (disposed || !hostRef.current) return;
      const host = hostRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(host.clientWidth, host.clientHeight);
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101319);
      scene.add(new THREE.HemisphereLight(0xcfe4f2, 0x3a4150, 1.1));
      const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
      sun.position.set(-3, 4, 5);
      scene.add(sun);
      const built = buildAircraft(type);
      // normalize to unit span so every type frames identically
      const s = 1 / built.spanUnits;
      built.group.scale.setScalar(s);
      const box = new THREE.Box3().setFromObject(built.group);
      built.group.position.y = -(box.min.y + box.max.y) / 2;
      built.group.position.z = -(box.min.z + box.max.z) / 2;
      scene.add(built.group);
      const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.01, 100);
      const clock = new THREE.Clock();
      let a = 0.7;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        a += dt * 0.35;
        camera.position.set(Math.cos(a) * 1.8, 0.32, Math.sin(a) * 1.8);
        camera.lookAt(0, 0, 0);
        built.animate?.(performance.now() / 1000, dt, false);
        renderer.render(scene, camera);
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        host.innerHTML = '';
      };
    })();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [type]);

  const i = ALL_TYPE_DESIGNATORS.indexOf(type.toUpperCase());
  const step = (d: number) => setType(ALL_TYPE_DESIGNATORS[(i + d + ALL_TYPE_DESIGNATORS.length) % ALL_TYPE_DESIGNATORS.length]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'var(--mono)' }}>
      <h1 style={{ fontSize: 16, letterSpacing: '0.1em' }}>HANGAR · PARAMETRIC MODEL LIBRARY</h1>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        {ALL_TYPE_DESIGNATORS.length} exact types + family fallbacks. Dimensions from published figures; livery stylised.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0' }}>
        <button onClick={() => step(-1)} aria-label="Previous type">◂</button>
        <input
          value={type}
          onChange={(e) => setType(e.target.value.toUpperCase())}
          style={{ width: 90, textTransform: 'uppercase', fontFamily: 'inherit', padding: '6px 8px' }}
          list="hangar-types"
          spellCheck={false}
        />
        <datalist id="hangar-types">
          {ALL_TYPE_DESIGNATORS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button onClick={() => step(1)} aria-label="Next type">▸</button>
        <span style={{ fontSize: 13 }}>
          {spec.name}
          {spec.generic ? ' (closest match)' : ''} · {spec.wingspanM} m span
        </span>
      </div>
      <div ref={hostRef} style={{ width: '100%', aspectRatio: '16/10', borderRadius: 8, overflow: 'hidden' }} />
    </main>
  );
}

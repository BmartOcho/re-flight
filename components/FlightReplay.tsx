'use client';

import { useEffect, useRef, useState } from 'react';
import type { FlightMeta, TrackData } from '@/lib/types';
import { basePath } from '@/lib/paths';

// The renderer is imperative three.js; import it only on the client, after mount,
// so nothing three-related is evaluated during SSR / static export.
export default function FlightReplay({ meta }: { meta: FlightMeta }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let handle: { dispose: () => void } | null = null;

    (async () => {
      try {
        const [{ createReplay }, track, heights] = await Promise.all([
          import('@/lib/replay/engine'),
          fetch(`${basePath}/flights/${meta.slug}/track.json`).then((r) => {
            if (!r.ok) throw new Error(`track.json ${r.status}`);
            return r.json() as Promise<TrackData>;
          }),
          meta.terrain
            ? fetch(`${basePath}/flights/${meta.slug}/terrain.bin`).then(async (r) => {
                if (!r.ok) throw new Error(`terrain.bin ${r.status}`);
                const buf = await r.arrayBuffer();
                return new Int16Array(buf);
              })
            : Promise.resolve(null),
        ]);
        if (disposed || !hostRef.current) return;
        handle = createReplay(hostRef.current, meta, track, heights);
        setStatus('ready');
      } catch (e) {
        if (disposed) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();

    return () => {
      disposed = true;
      handle?.dispose();
    };
  }, [meta]);

  return (
    <>
      <div ref={hostRef} className="replay-host" tabIndex={-1} />
      {status !== 'ready' && (
        <div className="replay-status" role="status">
          {status === 'loading' ? (
            <>
              <span className="spinner" aria-hidden />
              Loading {meta.callsign} · {meta.track.count.toLocaleString()} real positions…
            </>
          ) : (
            <>Could not load this flight ({error}).</>
          )}
        </div>
      )}
    </>
  );
}

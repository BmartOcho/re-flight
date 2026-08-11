'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLog } from '@/lib/pipeline/parse';
import { processLog, type ProcessResult } from '@/lib/pipeline/process';
import { verifyTrack, type Check } from '@/lib/pipeline/verify-client';
import { synthMeta } from '@/lib/pipeline/meta';
import { resolveSpec } from '@/lib/aircraft/registry';
import { basePath } from '@/lib/paths';
import type { TerrainMeta, TrackData } from '@/lib/types';

type Phase = 'idle' | 'parsing' | 'ready' | 'building' | 'flying' | 'error';

// Common designators surfaced as suggestions; any registry type works.
const COMMON_TYPES = [
  'C172', 'C182', 'C208', 'P28A', 'SR22', 'BE36', 'M20P', 'DA40', 'RV7',
  'DHC2', 'DHC3', 'DHC6', 'PC12', 'TBM9', 'BE20', 'B350',
  'C25A', 'C56X', 'CL35', 'GLF5', 'PC24', 'E55P',
  'CRJ9', 'E75L', 'DH8D', 'AT76',
  'A319', 'A320', 'A21N', 'B737', 'B738', 'B39M', 'B752',
  'A333', 'A359', 'B77W', 'B789', 'B744',
  'R44', 'B407', 'EC35', 'A139',
];

interface Processed {
  track: TrackData;
  stats: ProcessResult['stats'];
  checks: Check[];
  pass: boolean;
  warnings: string[];
  title: string;
}

export default function UploadReplay() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [proc, setProc] = useState<Processed | null>(null);
  const [icao, setIcao] = useState('C172');
  const [withTerrain, setWithTerrain] = useState(true);
  const [buildMsg, setBuildMsg] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ dispose: () => void } | null>(null);

  const reset = () => {
    handleRef.current?.dispose();
    handleRef.current = null;
    setProc(null);
    setError('');
    setPhase('idle');
  };

  const ingest = useCallback(async (file: File) => {
    setPhase('parsing');
    setError('');
    try {
      const text = await file.text();
      const parsed = parseLog(file.name, text);
      if (!parsed.points.length) throw new Error(parsed.warnings[0] || 'No track points found in this file.');
      const result = processLog(parsed.points);
      const { checks, pass } = verifyTrack(result.track, result.stats);
      const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40);
      setProc({ track: result.track, stats: result.stats, checks, pass, warnings: [...parsed.warnings, ...result.warnings], title });
      // guess aircraft class from speed; the pilot can type their real type
      setIcao(result.stats.gsMaxKt > 250 ? 'A320' : result.stats.gsMaxKt > 180 ? 'PC12' : 'C172');
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const onFiles = (files: FileList | null) => {
    if (files && files[0]) ingest(files[0]);
  };

  const fly = useCallback(async () => {
    if (!proc) return;
    setPhase('building');
    let terrain: TerrainMeta | null = null;
    let heights: Int16Array | null = null;
    let imageryUrl: string | null = null;
    try {
      if (withTerrain) {
        setBuildMsg('Building terrain from elevation tiles…');
        const s = proc.stats;
        const mLat = 8 / 111;
        const mLon = 8 / (111 * Math.cos(((s.lat0 + s.lat1) / 2) * (Math.PI / 180)));
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        const box = {
          lat0: clamp(s.lat0 - mLat, -85, 85),
          lat1: clamp(s.lat1 + mLat, -85, 85),
          lon0: clamp(s.lon0 - mLon, -179, 179),
          lon1: clamp(s.lon1 + mLon, -179, 179),
        };
        const n = 256;
        const url = `${basePath}/api/terrain?lat0=${box.lat0}&lat1=${box.lat1}&lon0=${box.lon0}&lon1=${box.lon1}&n=${n}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `terrain ${res.status}`);
        const data = await res.json();
        const bin = atob(data.heightsB64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        heights = new Int16Array(u8.buffer);
        terrain = { ...data.box, n: data.n, source: `Terrarium z${data.z} (on demand) · ${data.n} grid` };
        if (data.imageryB64 && terrain) {
          imageryUrl = `data:image/jpeg;base64,${data.imageryB64}`;
          terrain.imagerySource = data.imagerySource || undefined;
        }
      }
    } catch (e) {
      setBuildMsg(`Terrain unavailable (${e instanceof Error ? e.message : 'error'}); flying without it.`);
      terrain = null;
      heights = null;
    }

    const meta = synthMeta(proc.stats, { title: proc.title, icao, hasTerrain: !!terrain }, terrain);
    setPhase('flying');
    // mount engine after the host is in the DOM
    requestAnimationFrame(async () => {
      const { createReplay } = await import('@/lib/replay/engine');
      if (!hostRef.current) return;
      handleRef.current?.dispose();
      handleRef.current = createReplay(hostRef.current, meta, proc.track, heights, imageryUrl);
    });
  }, [proc, icao, withTerrain]);

  useEffect(() => () => handleRef.current?.dispose(), []);

  if (phase === 'flying') {
    return (
      <div className="flight-page">
        <button className="brand-link" onClick={reset} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
          ◂ FLY ANOTHER
        </button>
        <div ref={hostRef} className="replay-host" tabIndex={-1} />
      </div>
    );
  }

  return (
    <main className="wrap up-wrap">
      <header className="hero up-hero">
        <div className="eyebrow">Re:Flight · bring your own flight</div>
        <h1>Fly your own log.</h1>
        <p className="lede">
          Drop a track log from ForeFlight, Garmin, CloudAhoy, or any GPS logger (<b>.gpx</b>, <b>.kml</b>, <b>.csv</b>).
          It runs through the same pipeline as the curated flights — resampled, verified, and rendered over real terrain
          built on demand. Nothing is uploaded to a server except the bounding box needed to fetch elevation tiles; your
          track is processed entirely in your browser.
        </p>
        <a className="up-back-link" href={`${basePath}/`}>
          ◂ Back to the gallery
        </a>
      </header>

      {phase === 'idle' || phase === 'parsing' ? (
        <div
          className={`dropzone${drag ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        >
          {phase === 'parsing' ? (
            <div className="dz-inner"><span className="spinner" /> Reading your track…</div>
          ) : (
            <div className="dz-inner">
              <div className="dz-big">Drop a .gpx / .kml / .csv here</div>
              <label className="btn-file">
                Choose a file
                <input type="file" accept=".gpx,.kml,.csv,.txt" hidden onChange={(e) => onFiles(e.target.files)} />
              </label>
              <button
                className="link-btn"
                onClick={async () => {
                  const r = await fetch(`${basePath}/sample/denali-sample.gpx`);
                  ingest(new File([await r.blob()], 'N2YV Denali (sample).gpx'));
                }}
              >
                or try a real sample track →
              </button>
            </div>
          )}
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="report err">
          <div className="rep-title">Could not read that log</div>
          <p>{error}</p>
          <button className="link-btn" onClick={reset}>← try another file</button>
        </div>
      ) : null}

      {proc && (phase === 'ready' || phase === 'building') ? (
        <div className="report">
          <div className="rep-head">
            <div className="rep-title">{proc.title || 'Your flight'}</div>
            <div className={`badge ${proc.pass ? 'ok' : 'warn'}`}>{proc.pass ? 'VERIFIED' : 'CHECK WARNINGS'}</div>
          </div>
          <ul className="checks">
            {proc.checks.map((c) => (
              <li key={c.name} className={c.ok ? 'ok' : 'bad'}>
                <span className="ck">{c.ok ? '✓' : '✗'}</span>
                <span className="cn">{c.name}</span>
                <span className="cd">{c.detail}</span>
              </li>
            ))}
          </ul>
          {proc.warnings.length ? (
            <ul className="warns">{proc.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>
          ) : null}
          <div className="opts">
            <label>
              Aircraft type (ICAO)
              <input
                list="icao-types"
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="C172, SR22, PC12…"
                spellCheck={false}
                style={{ textTransform: 'uppercase' }}
              />
              <datalist id="icao-types">
                {COMMON_TYPES.map((t) => (
                  <option key={t} value={t}>{resolveSpec(t).name}</option>
                ))}
              </datalist>
              <span className="type-name">
                {(() => {
                  const s = resolveSpec(icao);
                  return s.generic ? `${s.name} (closest match)` : s.name;
                })()}
              </span>
            </label>
            <label className="chk">
              <input type="checkbox" checked={withTerrain} onChange={(e) => setWithTerrain(e.target.checked)} />
              Build real terrain
            </label>
            <button className="btn-primary" onClick={fly} disabled={phase === 'building'}>
              {phase === 'building' ? <><span className="spinner" /> {buildMsg || 'Preparing…'}</> : '► Fly it'}
            </button>
          </div>
          <button className="link-btn" onClick={reset}>← use a different file</button>
        </div>
      ) : null}
    </main>
  );
}

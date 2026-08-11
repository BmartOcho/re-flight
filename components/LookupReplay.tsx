'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { basePath } from '@/lib/paths';
import type { FlightMeta, TrackData } from '@/lib/types';
import type { Check } from '@/lib/pipeline/verify-client';

type Phase = 'idle' | 'searching' | 'ready' | 'flying' | 'error';

interface FlightSummary {
  index: number;
  startZ: number;
  durationSec: number;
  maxAltFt: number;
}

interface Found {
  meta: FlightMeta;
  track: TrackData;
  heights: Int16Array | null;
  checks: Check[];
  pass: boolean;
  warnings: string[];
  aircraft: { hex: string; registration: string; type: string; operator?: string };
  flights: FlightSummary[];
  chosen: number;
}

const fmtZ = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}Z`;
};
const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`);

const EXAMPLES = [
  { reg: 'N704AL', date: '2024-01-05', label: 'Alaska 1282 (door plug)' },
  { reg: 'N228UP', date: '2024-06-01', label: 'a UPS run' },
];

export default function LookupReplay() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [reg, setReg] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<{ dispose: () => void } | null>(null);

  const reset = () => {
    handleRef.current?.dispose();
    handleRef.current = null;
    setFound(null);
    setError('');
    setPhase('idle');
  };

  const search = useCallback(async (r: string, d: string, flightIndex?: number) => {
    if (!r.trim() || !d.trim()) return;
    setPhase('searching');
    setError('');
    try {
      const fp = flightIndex != null ? `&flight=${flightIndex}` : '';
      const res = await fetch(`${basePath}/api/flight?reg=${encodeURIComponent(r.trim())}&date=${encodeURIComponent(d.trim())}${fp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `lookup ${res.status}`);
      let heights: Int16Array | null = null;
      if (data.heightsB64) {
        const bin = atob(data.heightsB64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        heights = new Int16Array(u8.buffer);
      }
      setFound({ meta: data.meta, track: data.track, heights, checks: data.checks, pass: data.pass, warnings: data.warnings || [], aircraft: data.aircraft, flights: data.flights || [], chosen: data.chosen ?? 0 });
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const fly = useCallback(() => {
    if (!found) return;
    setPhase('flying');
    requestAnimationFrame(async () => {
      const { createReplay } = await import('@/lib/replay/engine');
      if (!hostRef.current) return;
      handleRef.current?.dispose();
      handleRef.current = createReplay(hostRef.current, found.meta, found.track, found.heights);
    });
  }, [found]);

  useEffect(() => () => handleRef.current?.dispose(), []);

  if (phase === 'flying') {
    return (
      <div className="flight-page">
        <button className="brand-link" onClick={reset} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
          ◂ ANOTHER FLIGHT
        </button>
        <div ref={hostRef} className="replay-host" tabIndex={-1} />
      </div>
    );
  }

  return (
    <main className="wrap up-wrap">
      <header className="hero up-hero">
        <div className="eyebrow">Re:Flight · search the archive</div>
        <h1>Search by tail number.</h1>
        <p className="lede">
          Enter an aircraft&rsquo;s <b>registration</b> (tail number) and a <b>date</b>, and we pull that day&rsquo;s
          real ADS-B track from the archive, verify it, and fly it over real terrain. Coverage starts ~2016 and varies
          by region.
        </p>
        <a className="up-back-link" href={`${basePath}/`}>◂ Back to the gallery</a>
      </header>

      <form className="lookup-form" onSubmit={(e) => { e.preventDefault(); search(reg, date); }}>
        <label>
          Tail number
          <input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="N704AL" autoCapitalize="characters" spellCheck={false} />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max="2099-12-31" />
        </label>
        <button className="btn-primary" type="submit" disabled={phase === 'searching'}>
          {phase === 'searching' ? <><span className="spinner" /> Searching the archive…</> : 'Search'}
        </button>
      </form>
      <p className="hint-note">
        A <b>registration</b> (e.g. N704AL, D-AIUA, G-EZBA) — not a flight number like &ldquo;SWA172&rdquo; or a callsign.
      </p>

      {phase === 'idle' ? (
        <div className="examples">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.reg + ex.date} className="chip-btn" onClick={() => { setReg(ex.reg); setDate(ex.date); search(ex.reg, ex.date); }}>
              {ex.reg} · {ex.date} <em>{ex.label}</em>
            </button>
          ))}
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="report err">
          <div className="rep-title">No luck</div>
          <p>{error}</p>
          <p className="hint-note">
            The free archive can refuse server requests or lack coverage for a date/region. A paid ADS-B API (set
            <code> ADSB_PROVIDER </code>) is the reliable path.
          </p>
          <button className="link-btn" onClick={reset}>← try another</button>
        </div>
      ) : null}

      {found && (phase === 'ready') ? (
        <div className="report">
          <div className="rep-head">
            <div className="rep-title">{found.aircraft.registration} · {found.aircraft.type}{found.aircraft.operator ? ` · ${found.aircraft.operator}` : ''}</div>
            <div className={`badge ${found.pass ? 'ok' : 'warn'}`}>{found.pass ? 'VERIFIED' : 'CHECK WARNINGS'}</div>
          </div>
          <ul className="checks">
            {found.checks.map((c) => (
              <li key={c.name} className={c.ok ? 'ok' : 'bad'}>
                <span className="ck">{c.ok ? '✓' : '✗'}</span>
                <span className="cn">{c.name}</span>
                <span className="cd">{c.detail}</span>
              </li>
            ))}
          </ul>
          {found.warnings.length ? <ul className="warns">{found.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul> : null}
          {found.flights.length > 1 ? (
            <div className="flights">
              <div className="flights-label">{found.flights.length} flights that day — pick one:</div>
              <div className="flights-list">
                {found.flights.map((f) => (
                  <button
                    key={f.index}
                    className={`flight-chip${f.index === found.chosen ? ' on' : ''}`}
                    onClick={() => search(reg, date, f.index)}
                  >
                    {fmtZ(f.startZ)} · {fmtDur(f.durationSec)} · {f.maxAltFt.toLocaleString()} ft
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="opts">
            <button className="btn-primary" onClick={fly}>► Fly it</button>
          </div>
          <button className="link-btn" onClick={reset}>← search again</button>
        </div>
      ) : null}
    </main>
  );
}

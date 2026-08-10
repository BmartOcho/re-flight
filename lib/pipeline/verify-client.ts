// The verification harness, client-side, run on an uploaded flight before it
// renders — the same spirit as scripts/verify.ts: prove the numbers are sane, not
// just that it looks plausible. The trail-vs-aircraft and below-terrain checks
// belong to the build-time harness; here we run what a processed track alone can
// prove (attitude, speed, continuity).
import type { TrackData } from '../types';
import { bankRad, pitchRad } from '../replay/track';
import type { ProcessResult } from './process';

export interface Check {
  name: string;
  detail: string;
  ok: boolean;
}

export function verifyTrack(track: TrackData, stats: ProcessResult['stats']): { checks: Check[]; pass: boolean } {
  const S = track.s;
  let maxBank = 0;
  let atClamp = 0;
  let maxPitch = 0;
  for (const s of S) {
    const bank = Math.abs((bankRad(s[6], s[3]) * 180) / Math.PI);
    if (bank > maxBank) maxBank = bank;
    if (bank >= 34.95) atClamp++;
    const pitch = Math.abs((pitchRad(s[5], s[3]) * 180) / Math.PI);
    if (pitch > maxPitch) maxPitch = pitch;
  }
  const clampPct = (atClamp / S.length) * 100;

  // max 1 s position jump (teleport / discontinuity)
  let maxJump = 0;
  for (let i = 1; i < S.length; i++) {
    const dLat = ((S[i][0] - S[i - 1][0]) * Math.PI) / 180;
    const dLon = ((S[i][1] - S[i - 1][1]) * Math.PI) / 180;
    const cl = Math.cos((S[i][0] * Math.PI) / 180);
    const dM = 6371000 * Math.hypot(dLat, dLon * cl);
    maxJump = Math.max(maxJump, dM / 0.514444);
  }

  const checks: Check[] = [
    { name: 'Continuous 1 Hz track', detail: `${stats.count.toLocaleString()} points · ${fmtDur(stats.durationSec)}`, ok: stats.count >= 5 },
    { name: 'Max bank angle', detail: `${maxBank.toFixed(1)}° · ${clampPct.toFixed(1)}% at clamp`, ok: maxBank < 35.01 && clampPct < 5 },
    { name: 'Max pitch angle', detail: `${maxPitch.toFixed(1)}°`, ok: maxPitch < 20 },
    { name: 'Groundspeed derived', detail: `peak ${Math.round(stats.gsMaxKt)} kt`, ok: stats.gsMaxKt > 0 && stats.gsMaxKt < 700 },
    { name: 'No teleports', detail: `max 1 s step ${Math.round(maxJump)} kt-equiv`, ok: maxJump < 700 },
    { name: 'Altitude range', detail: `${Math.round(stats.altMinFt).toLocaleString()} → ${Math.round(stats.altMaxFt).toLocaleString()} ft`, ok: true },
  ];
  return { checks, pass: checks.every((c) => c.ok) };
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

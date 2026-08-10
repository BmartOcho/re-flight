// Shared Open Graph card (1200x630), rendered to PNG at build via next/og.
// Satori-compatible: every container is display:flex, colors are literals, no
// external fonts. Themed to match each flight's scene.
import type { SceneTheme } from './types';

export const OG_SIZE = { width: 1200, height: 630 };

const THEMES: Record<string, { bg: string; accent: string; ink: string }> = {
  alpine: { bg: 'linear-gradient(135deg,#0e2135 0%,#2f6ea8 62%,#7fb0d8 100%)', accent: '#ffb15a', ink: '#eef5fc' },
  day: { bg: 'linear-gradient(135deg,#123a5e 0%,#3a7bb0 62%,#aecfe8 100%)', accent: '#ffcf8c', ink: '#f4f9fd' },
  night: { bg: 'linear-gradient(135deg,#05080f 0%,#0d1b34 58%,#1b3a66 100%)', accent: '#ffb454', ink: '#dfe6f3' },
  site: { bg: 'linear-gradient(135deg,#0b1220 0%,#16223c 55%,#243c5c 100%)', accent: '#ffb15a', ink: '#eaf1fb' },
};

export function OgCard(props: {
  theme: SceneTheme | 'site';
  eyebrow: string;
  title: string;
  sub?: string;
  stat?: string;
}) {
  const t = THEMES[props.theme] ?? THEMES.site;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: t.bg,
        color: t.ink,
        padding: 70,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 26, letterSpacing: 7, color: t.accent }}>{props.eyebrow}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: props.title.length > 26 ? 66 : 82, fontWeight: 800, lineHeight: 1.03 }}>
          {props.title}
        </div>
        {props.sub ? (
          <div style={{ display: 'flex', fontSize: 30, marginTop: 22, color: 'rgba(255,255,255,0.82)' }}>{props.sub}</div>
        ) : null}
        {props.stat ? (
          <div style={{ display: 'flex', fontSize: 30, marginTop: 14, color: t.accent, fontWeight: 700 }}>{props.stat}</div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          fontSize: 21,
          letterSpacing: 3,
          color: 'rgba(255,255,255,0.92)',
          border: `1px solid ${t.accent}`,
          borderRadius: 6,
          padding: '12px 18px',
        }}
      >
        EVERY POINT IS THE AIRCRAFT&rsquo;S ACTUAL BROADCAST POSITION
      </div>
    </div>
  );
}
